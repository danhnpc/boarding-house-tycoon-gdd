// GameApp integration tests: boot flow, offline resume, command pipeline,
// persistence round trip. In-memory adapter + fake clock; no real timers.

import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../src/domain/shared/rng';
import { GameApp } from '../../src/application/game-app';
import { SaveGameService } from '../../src/persistence/save-game-service';
import { FakeClock } from './helpers';

const HOUR_MS = 3_600_000;

class MemoryAdapter {
  record: unknown = null;
  async read(): Promise<unknown | null> {
    return this.record;
  }
  async write(record: unknown): Promise<void> {
    this.record = record;
  }
  async clear(): Promise<void> {
    this.record = null;
  }
}

const foreground = { isForeground: () => true } as const;
const rng = createSeededRng(12345);

describe('GameApp boot', () => {
  it('fresh install creates and persists the GDD starting state', async () => {
    const adapter = new MemoryAdapter();
    const app = new GameApp(new FakeClock(0), new SaveGameService(adapter, () => 0), foreground, rng);
    const boot = await app.boot();
    app.stopTimers();

    expect(boot.created).toBe(true);
    expect(boot.offline).toBeNull();
    expect(boot.state.player.cashMinorUnits).toBe(100_000);
    expect(boot.state.building.rooms).toEqual([
      { roomId: 'room-1', level: 1, tenantId: 'tenant-1' },
      { roomId: 'room-2', level: 1, tenantId: null },
    ]);
    expect(adapter.record).not.toBeNull();
  });

  it('resume applies offline income once and advances the checkpoint', async () => {
    const adapter = new MemoryAdapter();
    // First session: fresh game with checkpoint at H1.
    const first = new GameApp(new FakeClock(HOUR_MS), new SaveGameService(adapter, () => HOUR_MS), foreground, rng);
    const firstBoot = await first.boot();
    first.stopTimers();
    expect(firstBoot.created).toBe(true);

    // Player returns 3 real hours later (1 occupied L1 room, net 108/hr).
    const returnAt = HOUR_MS + 3 * HOUR_MS;
    const resumed = new GameApp(new FakeClock(returnAt), new SaveGameService(adapter, () => returnAt), foreground, rng);
    const boot = await resumed.boot();
    resumed.stopTimers();

    expect(boot.created).toBe(false);
    expect(boot.offline).toMatchObject({
      creditedMinor: 10_800 * 3,
      cappedAt8Hours: false,
      clockMovedBackwards: false,
      elapsedMs: 3 * HOUR_MS,
    });
    expect(boot.state.player.cashMinorUnits).toBe(100_000 + 10_800 * 3);
    expect(boot.state.time.lastCheckpointAt).toBe(returnAt);

    // Reloading again immediately cannot re-credit the same interval.
    const again = new GameApp(new FakeClock(returnAt), new SaveGameService(adapter, () => returnAt), foreground, rng);
    const secondBoot = await again.boot();
    again.stopTimers();
    expect(secondBoot.offline).toMatchObject({ creditedMinor: 0 });
    expect(secondBoot.state.player.cashMinorUnits).toBe(100_000 + 10_800 * 3);
  });

  it('offline income caps at 8 hours even after a 30-hour gap', async () => {
    const adapter = new MemoryAdapter();
    const created = new GameApp(new FakeClock(0), new SaveGameService(adapter, () => 0), foreground, rng);
    await created.boot();
    created.stopTimers();

    const resumed = new GameApp(new FakeClock(30 * HOUR_MS), new SaveGameService(adapter, () => 30 * HOUR_MS), foreground, rng);
    const boot = await resumed.boot();
    resumed.stopTimers();
    expect(boot.offline).toMatchObject({
      creditedMinor: 10_800 * 8,
      cappedAt8Hours: true,
    });
    expect(boot.state.time.lastCheckpointAt).toBe(30 * HOUR_MS);
  });

  it('a backwards-moving device clock grants zero and resets the checkpoint', async () => {
    const adapter = new MemoryAdapter();
    const created = new GameApp(new FakeClock(5 * HOUR_MS), new SaveGameService(adapter, () => 5 * HOUR_MS), foreground, rng);
    await created.boot();
    created.stopTimers();

    const earlier = new GameApp(new FakeClock(4 * HOUR_MS), new SaveGameService(adapter, () => 4 * HOUR_MS), foreground, rng);
    const boot = await earlier.boot();
    earlier.stopTimers();
    expect(boot.offline).toMatchObject({ creditedMinor: 0, clockMovedBackwards: true });
    expect(boot.state.player.cashMinorUnits).toBe(100_000);
  });
});

describe('GameApp command pipeline', () => {
  it('accept → missions credited → persisted; reload restores everything', async () => {
    const adapter = new MemoryAdapter();
    const clock = new FakeClock(0);
    const first = new GameApp(clock, new SaveGameService(adapter, () => clock.now()), foreground, rng);
    await first.boot();
    const result = first.execute({
      type: 'ACCEPT_CANDIDATE',
      candidateId: 'candidate-1',
      roomId: 'room-2',
    });
    expect(result.ok).toBe(true);
    // Mission 1 credited on the same command call.
    expect(first.getState().missions.completedMissionNumbers).toEqual([1]);
    expect(first.getState().player.cashMinorUnits).toBe(100_000 + 10_000);
    await first.saveNow(); // saves are queued; wait for the write before reloading
    first.stopTimers();

    // Reload from the persisted record.
    const restored = new GameApp(clock, new SaveGameService(adapter, () => clock.now()), foreground, rng);
    const boot = await restored.boot();
    restored.stopTimers();
    expect(boot.state.missions.completedMissionNumbers).toEqual([1]);
    expect(boot.state.building.rooms[1].tenantId).toBe('tenant-candidate-1');
  });

  it('invalid commands are rejected with the domain reason and change nothing', async () => {
    const adapter = new MemoryAdapter();
    const clock = new FakeClock(0);
    const app = new GameApp(clock, new SaveGameService(adapter, () => clock.now()), foreground, rng);
    await app.boot();

    const before = app.getState();
    const result = app.execute({ type: 'BUILD_ROOM', roomId: 'room-3' }); // capacity 2
    expect(result).toMatchObject({ ok: false, reason: 'CAPACITY_LIMIT_REACHED' });
    expect(app.getState()).toBe(before); // same object reference: untouched
    app.stopTimers();
  });

  it('mission rewards only persist when the command succeeded', async () => {
    const adapter = new MemoryAdapter();
    const clock = new FakeClock(0);
    const app = new GameApp(clock, new SaveGameService(adapter, () => clock.now()), foreground, rng);
    await app.boot();
    // Student blocked from a Level 2 room: no tenant added, no mission credited.
    const result = app.execute({
      type: 'ACCEPT_CANDIDATE',
      candidateId: 'candidate-1',
      roomId: 'room-9',
    });
    expect(result).toMatchObject({ ok: false, reason: 'ROOM_NOT_FOUND' });
    expect(app.getState().missions.completedMissionNumbers).toEqual([]);
    expect(app.getState().player.cashMinorUnits).toBe(100_000);
    app.stopTimers();
  });
});
