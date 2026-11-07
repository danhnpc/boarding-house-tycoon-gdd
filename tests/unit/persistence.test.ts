// Persistence tests (ADR 0002 + local-first-save-migration skill): round trip,
// corrupt handling, future-version rejection, fresh install. IndexedDB is the
// in-memory fake so the adapter API is exercised for real.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IndexedDbSaveAdapter } from '../../src/persistence/indexeddb-adapter';
import { SaveGameService } from '../../src/persistence/save-game-service';
import { type SaveRecord } from '../../src/persistence/schema';
import { createInitialGameState } from '../../src/domain/state/initial-state';
import { FakeClock } from './helpers';
import type { GameState } from '../../src/domain/types';

const adapter = new IndexedDbSaveAdapter();
const service = new SaveGameService(adapter, () => 1_000);

let state: GameState;

beforeEach(async () => {
  await adapter.clear();
  state = createInitialGameState(new FakeClock(0));
});

describe('round trip', () => {
  it('save → load returns a deep-equal current-version state', async () => {
    await service.saveState(state);
    const outcome = await service.loadState();
    if (outcome.kind !== 'ok') throw new Error(`expected ok, got ${outcome.kind}`);
    expect(outcome.state).toEqual(state);
    expect(outcome.record.savedAt).toBe(1_000);
  });

  it('a modified state round trips with all mutations intact', async () => {
    const modified: GameState = {
      ...state,
      player: { cashMinorUnits: 123_456, lifetimeGrossIncomeMinorUnits: 10_800 },
      tenants: [...state.tenants, { tenantId: 'tenant-candidate-1', archetype: 'student' }],
    };
    await service.saveState(modified);
    const outcome = await service.loadState();
    if (outcome.kind !== 'ok') throw new Error(`expected ok, got ${outcome.kind}`);
    expect(outcome.state).toEqual(modified);
  });
});

describe('failure handling', () => {
  it('no save on record → no-save', async () => {
    const outcome = await service.loadState();
    expect(outcome).toMatchObject({ kind: 'no-save' });
  });

  it('corrupt envelopes are reported as corrupt', async () => {
    await service.saveState(state);
    await adapter.write({ garbage: true });
    const outcome = await service.loadState();
    expect(outcome).toMatchObject({ kind: 'corrupt' });
  });

  it('a future schemaVersion is rejected, never migrated backwards', async () => {
    await service.saveState(state);
    await adapter.write({ schemaVersion: 99, savedAt: 1, state });
    const outcome = await service.loadState();
    expect(outcome).toMatchObject({ kind: 'newer-version', version: 99 });
  });

  it('a failed load leaves the stored record untouched for diagnostics', async () => {
    await service.saveState(state);
    await adapter.write('not-an-object');
    const outcome = await service.loadState();
    expect(outcome).toMatchObject({ kind: 'corrupt' });

    // The last valid write (the corrupt one) is still exactly on disk.
    const raw = await adapter.read();
    expect(raw).toBe('not-an-object');
  });

  it('a state missing required fields fails validation, not silent reset', async () => {
    await adapter.write({
      schemaVersion: 1,
      savedAt: 0,
      state: { schemaVersion: 1 }, // everything else missing
    });
    const outcome = await service.loadState();
    expect(outcome).toMatchObject({ kind: 'corrupt' });
  });
});

describe('record integrity', () => {
  it('saved records are plain data with integer money and timestamps', async () => {
    await service.saveState(state);
    const raw = (await adapter.read()) as SaveRecord;
    expect(Number.isSafeInteger(raw.state.player.cashMinorUnits)).toBe(true);
    expect(Number.isSafeInteger(raw.savedAt)).toBe(true);
    expect(Number.isSafeInteger(raw.state.time.lastCheckpointAt)).toBe(true);
  });
});
