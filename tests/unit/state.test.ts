// Starting-state parity (GDD 3.4) and purity guarantees (skill rules 3 & 8).

import { describe, expect, it } from 'vitest';
import { acceptCandidate } from '../../src/domain/tenant/candidates';
import { buildRoom } from '../../src/domain/building/rooms';
import { initialFrozenState } from './helpers';
import type { GameState } from '../../src/domain/types';

describe('initial state (GDD 3.4)', () => {
  it('Starting cash 1,000 Cash and 2 Level 1 rooms', () => {
    const state = initialFrozenState();
    expect(state.player.cashMinorUnits).toBe(100_000);
    expect(state.player.lifetimeGrossIncomeMinorUnits).toBe(0);
    expect(state.building.roomCapacity).toBe(2);
    expect(state.building.rooms).toHaveLength(2);
    for (const room of state.building.rooms) {
      expect(room.level).toBe(1);
    }
  });

  it('initial occupancy: room-1 occupied by an Office Worker, room-2 vacant', () => {
    const state = initialFrozenState();
    expect(state.building.rooms[0]).toEqual({
      roomId: 'room-1',
      level: 1,
      tenantId: 'tenant-1',
    });
    expect(state.building.rooms[1].tenantId).toBeNull();
    expect(state.tenants).toEqual([{ tenantId: 'tenant-1', archetype: 'office_worker' }]);
  });

  it('initial candidate queue holds one Student', () => {
    const state = initialFrozenState();
    expect(state.candidates).toEqual([
      { candidateId: 'candidate-1', archetype: 'student' },
    ]);
  });

  it('checkpoint starts at game-creation time', () => {
    const state = initialFrozenState(7);
    expect(state.time.lastCheckpointAt).toBe(7 * 3_600_000);
    expect(state.time.incomeRemainderMinorUnits).toBe(0);
    expect(state.time.grossRemainderMinorUnits).toBe(0);
  });

  it('no mission started, no modifiers, no active event', () => {
    const state = initialFrozenState();
    expect(state.missions).toEqual({ completedMissionNumbers: [], nextMissionNumber: 1 });
    expect(state.modifiers.incomeReductions).toEqual([]);
    expect(state.events).toEqual({
      activeEventId: null,
      eventPayload: null,
      globalCooldownRemainingOnlineMs: 0,
      perEventCooldownOnlineMs: {},
      recentEventOnlineTimes: [],
      noiseTargetCooldownOnlineMsRecord: {},
      suppressedOnlineMs: {},
      lastCheckOnlineMs: 0,
    });
  });
});

describe('purity: commands must not mutate their input', () => {
  it('accept and build never alter the frozen source state', () => {
    const frozen = initialFrozenState();
    const before: GameState = JSON.parse(JSON.stringify(frozen));

    const accepted = acceptCandidate(frozen, 'candidate-1', 'room-2');
    if (!accepted.ok) throw new Error(accepted.reason);
    const built = buildRoom({ ...accepted.state }, 'room-3'); // capacity 4 post-milestone
    if (!built.ok) throw new Error(built.reason);

    expect(frozen).toEqual(before);
    expect(Object.isFrozen(frozen)).toBe(true);
  });

  it('rule results are serializable (deep-clone round trip)', () => {
    const state = initialFrozenState();
    const result = acceptCandidate(state, 'candidate-1', 'room-2');
    if (!result.ok) throw new Error(result.reason);
    const roundTrip: GameState = JSON.parse(JSON.stringify(result.state));
    expect(roundTrip).toEqual(result.state);
  });
});
