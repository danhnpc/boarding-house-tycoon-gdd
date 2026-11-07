// Persistence tests (ADR 0002 + local-first-save-migration skill): round trip,
// corrupt handling, future-version rejection, fresh install. IndexedDB is the
// in-memory fake so the adapter API is exercised for real.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IndexedDbSaveAdapter } from '../../src/persistence/indexeddb-adapter';
import { SaveGameService } from '../../src/persistence/save-game-service';
import { type SaveRecord } from '../../src/persistence/schema';
import { createInitialGameState } from '../../src/domain/state/initial-state';
import { SCHEMA_VERSION } from '../../src/domain/config/balance';
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

/** Shape of a v1 save: no event system, no online clock, no gross remainder. */
function toV1(current: GameState): Record<string, unknown> {
  const v1: Record<string, unknown> = {
    ...current,
    schemaVersion: 1,
    time: {
      lastCheckpointAt: current.time.lastCheckpointAt,
      incomeRemainderMinorUnits: current.time.incomeRemainderMinorUnits,
    },
  };
  delete v1.events;
  return v1;
}

/** Shape of a v2 save: events + online clock, no gross remainder. */
function toV2(current: GameState): Record<string, unknown> {
  const v2: Record<string, unknown> = {
    ...current,
    schemaVersion: 2,
    time: {
      lastCheckpointAt: current.time.lastCheckpointAt,
      incomeRemainderMinorUnits: current.time.incomeRemainderMinorUnits,
      onlineMs: current.time.onlineMs,
    },
  };
  return v2;
}

describe('migration chain fixtures', () => {
  it('a v1 save migrates through v2 to the current schema', async () => {
    await adapter.write({ schemaVersion: 1, savedAt: 5, state: toV1(state) });
    const outcome = await service.loadState();
    if (outcome.kind !== 'ok') throw new Error(`expected ok, got ${outcome.kind}`);
    expect(outcome.state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(outcome.state.events.lastCheckOnlineMs).toBe(0);
    expect(outcome.state.time.onlineMs).toBe(0);
    expect(outcome.state.time.grossRemainderMinorUnits).toBe(0);
  });

  it('a v2 save migrates to the current schema with a zero gross remainder', async () => {
    await adapter.write({ schemaVersion: 2, savedAt: 5, state: toV2(state) });
    const outcome = await service.loadState();
    if (outcome.kind !== 'ok') throw new Error(`expected ok, got ${outcome.kind}`);
    expect(outcome.state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(outcome.state.time.grossRemainderMinorUnits).toBe(0);
    expect(outcome.state.time.onlineMs).toBe(0);
  });

  it('a current save keeps its gross remainder through a round trip', async () => {
    const carried: GameState = {
      ...state,
      time: { ...state.time, grossRemainderMinorUnits: 0.625 },
    };
    await service.saveState(carried);
    const outcome = await service.loadState();
    if (outcome.kind !== 'ok') throw new Error(`expected ok, got ${outcome.kind}`);
    expect(outcome.state.time.grossRemainderMinorUnits).toBe(0.625);
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
