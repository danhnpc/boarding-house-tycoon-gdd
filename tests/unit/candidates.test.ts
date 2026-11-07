// Tenant commands and milestone progression via occupancy (GDD 5, 4.1).

import { describe, expect, it } from 'vitest';
import {
  acceptCandidate,
  moveOutTenant,
  rejectCandidate,
  roomRentPerGameDayMinor,
} from '../../src/domain/tenant/candidates';
import { buildRoom } from '../../src/domain/building/rooms';
import { applyProgression } from '../../src/domain/progression/milestones';
import { initialFrozenState } from './helpers';
import type { GameState, RoomLevel } from '../../src/domain/types';

const L1 = 1 as RoomLevel;
const L2 = 2 as RoomLevel;

describe('acceptCandidate', () => {
  it('student (150) can take the vacant Level 1 room (rent 120)', () => {
    const result = acceptCandidate(initialFrozenState(), 'candidate-1', 'room-2');
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.building.rooms.find((r) => r.roomId === 'room-2')).toEqual({
      roomId: 'room-2',
      level: 1,
      tenantId: 'tenant-candidate-1',
    });
    expect(result.state.candidates).toHaveLength(0);
    expect(result.state.tenants).toContainEqual({
      tenantId: 'tenant-candidate-1',
      archetype: 'student',
    });
  });

  it('student cannot take a Level 2 room (150 < 210)', () => {
    const state: GameState = {
      ...initialFrozenState(),
      building: {
        roomCapacity: 4,
        rooms: [
          { roomId: 'room-1', level: L1, tenantId: 'tenant-1' },
          { roomId: 'room-2', level: L2, tenantId: null },
        ],
      },
    };
    const result = acceptCandidate(state, 'candidate-1', 'room-2');
    expect(result).toMatchObject({ ok: false, reason: 'BUDGET_TOO_LOW' });
  });

  it('rejects assignment to an occupied room', () => {
    const result = acceptCandidate(initialFrozenState(), 'candidate-1', 'room-1');
    expect(result).toMatchObject({ ok: false, reason: 'ROOM_NOT_VACANT' });
  });

  it('unknown candidate or room fail cleanly', () => {
    expect(acceptCandidate(initialFrozenState(), 'candidate-9', 'room-2')).toMatchObject({
      ok: false,
      reason: 'CANDIDATE_NOT_FOUND',
    });
    expect(acceptCandidate(initialFrozenState(), 'candidate-1', 'room-9')).toMatchObject({
      ok: false,
      reason: 'ROOM_NOT_FOUND',
    });
  });
});

describe('milestone progression via acceptance (GDD 4.1)', () => {
  it('accepting the 2nd tenant reaches Expansion 1: capacity 4 + Level 2 unlock + build allowed', () => {
    let state = initialFrozenState();
    const accepted = acceptCandidate(state, 'candidate-1', 'room-2');
    if (!accepted.ok) throw new Error(accepted.reason);
    state = accepted.state;

    expect(state.progression).toEqual({ roomCapacity: 4, unlockedMaxLevel: 2 });

    const built = buildRoom(state, 'room-3');
    if (!built.ok) throw new Error(built.reason);
    expect(built.state.building.rooms).toHaveLength(3);
  });

  it('milestone unlocks are permanent: moving a tenant out does not revoke them', () => {
    let state = initialFrozenState();
    const accepted = acceptCandidate(state, 'candidate-1', 'room-2');
    if (!accepted.ok) throw new Error(accepted.reason);
    state = accepted.state;

    const movedOut = moveOutTenant(state, 'room-2');
    if (!movedOut.ok) throw new Error(movedOut.reason);
    expect(movedOut.state.progression).toEqual({ roomCapacity: 4, unlockedMaxLevel: 2 });
  });

  it('Expansion 2 needs 4 occupied rooms AND at least 2 Level 2 rooms', () => {
    const fourOccupiedTwoL2: GameState = {
      ...initialFrozenState(),
      progression: { roomCapacity: 4, unlockedMaxLevel: L2 },
      building: {
        roomCapacity: 4,
        rooms: [
          { roomId: 'room-1', level: L1, tenantId: 'tenant-1' },
          { roomId: 'room-2', level: L2, tenantId: 'tenant-a' },
          { roomId: 'room-3', level: L1, tenantId: 'tenant-b' },
          { roomId: 'room-4', level: L2, tenantId: 'tenant-c' },
        ],
      },
    };
    const progressed = applyProgression(fourOccupiedTwoL2);
    expect(progressed.progression).toEqual({ roomCapacity: 6, unlockedMaxLevel: 3 });

    // Only 1 room at Level 2 → not enough, even with 4 occupied.
    const notYet: GameState = {
      ...initialFrozenState(),
      progression: { roomCapacity: 4, unlockedMaxLevel: L2 },
      building: {
        roomCapacity: 4,
        rooms: [
          { roomId: 'room-1', level: L1, tenantId: 'tenant-1' },
          { roomId: 'room-2', level: L2, tenantId: 'tenant-a' },
          { roomId: 'room-3', level: L1, tenantId: 'tenant-b' },
          { roomId: 'room-4', level: L1, tenantId: 'tenant-c' },
        ],
      },
    };
    expect(applyProgression(notYet).progression).toEqual({
      roomCapacity: 4,
      unlockedMaxLevel: 2,
    });
  });
});

describe('rejectCandidate and moveOutTenant', () => {
  it('reject removes the candidate without penalty and keeps Cash', () => {
    const state = initialFrozenState();
    const result = rejectCandidate(state, 'candidate-1');
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.candidates).toHaveLength(0);
    expect(result.state.player.cashMinorUnits).toBe(state.player.cashMinorUnits);
  });

  it('reject of unknown candidate fails', () => {
    expect(rejectCandidate(initialFrozenState(), 'candidate-9')).toMatchObject({
      ok: false,
      reason: 'CANDIDATE_NOT_FOUND',
    });
  });

  it('moveOut frees the room and discards the tenant (never re-queued)', () => {
    const state = initialFrozenState();
    const result = moveOutTenant(state, 'room-1');
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.building.rooms.find((r) => r.roomId === 'room-1')).toEqual({
      roomId: 'room-1',
      level: 1,
      tenantId: null,
    });
    expect(result.state.tenants).toHaveLength(0);
    expect(result.state.candidates).toHaveLength(1); // untouched queue
  });

  it('moveOut on a vacant room fails', () => {
    expect(moveOutTenant(initialFrozenState(), 'room-2')).toMatchObject({
      ok: false,
      reason: 'ROOM_NOT_OCCUPIED',
    });
  });
});

describe('roomRentPerGameDayMinor', () => {
  it('reports current-level rent (eligibility comparison basis, GDD 5.2)', () => {
    const state = initialFrozenState();
    expect(roomRentPerGameDayMinor(state, 'room-1')).toBe(12_000);
    expect(roomRentPerGameDayMinor(state, 'room-9')).toBeNull();
  });
});
