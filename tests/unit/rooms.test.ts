// Build/upgrade rules (GDD 3.3, 4.1, 4.3).

import { describe, expect, it } from 'vitest';
import { buildRoom, upgradeRoom } from '../../src/domain/building/rooms';
import { initialFrozenState } from './helpers';
import type { GameState, RoomLevel } from '../../src/domain/types';

const L1 = 1 as RoomLevel;
const L2 = 2 as RoomLevel;
const L3 = 3 as RoomLevel;

function stateWithCash(cashMinorUnits: number, cap = 2): GameState {
  const s = initialFrozenState();
  return {
    ...s,
    player: { ...s.player, cashMinorUnits },
    progression: { ...s.progression, roomCapacity: cap, unlockedMaxLevel: 1 },
  };
}

describe('buildRoom', () => {
  it('builds room-3 when capacity allows and Cash suffices', () => {
    const state = stateWithCash(1_000_000, 4);
    const result = buildRoom(state, 'room-3');
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.player.cashMinorUnits).toBe(1_000_000 - 90_000);
    const room = result.state.building.rooms.find((r) => r.roomId === 'room-3');
    expect(room).toEqual({ roomId: 'room-3', level: 1, tenantId: null });
  });

  it('rejects daily capacity limit', () => {
    const result = buildRoom(stateWithCash(1_000_000, 2), 'room-3');
    expect(result).toMatchObject({ ok: false, reason: 'CAPACITY_LIMIT_REACHED' });
  });

  it('rejects duplicate rooms', () => {
    const result = buildRoom(stateWithCash(1_000_000, 4), 'room-1');
    expect(result).toMatchObject({ ok: false, reason: 'ROOM_ALREADY_EXISTS' });
  });

  it('rejects unknown room numbers (no build cost defined)', () => {
    const result = buildRoom(stateWithCash(1_000_000, 4), 'room-9');
    expect(result).toMatchObject({ ok: false, reason: 'INVALID_ROOM_ID' });
  });

  it('rejects insufficient funds and leaves state unchanged', () => {
    const state = stateWithCash(89_999, 4);
    const result = buildRoom(state, 'room-3');
    expect(result).toMatchObject({ ok: false, reason: 'INSUFFICIENT_FUNDS' });
    expect(result.ok ? result.state : state.player.cashMinorUnits).toBe(89_999);
  });
});

describe('upgradeRoom', () => {
  it('blocks Level 2 while only Level 1 is unlocked', () => {
    const result = upgradeRoom(stateWithCash(1_000_000), 'room-1');
    expect(result).toMatchObject({ ok: false, reason: 'LEVEL_LOCKED' });
  });

  it('upgrades a vacant unlocked room and deducts Cash', () => {
    const unlocked: GameState = {
      ...stateWithCash(1_000_000, 4),
      progression: { roomCapacity: 4, unlockedMaxLevel: L2 },
    };
    const result = upgradeRoom(unlocked, 'room-2'); // room-2 is vacant
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.player.cashMinorUnits).toBe(1_000_000 - 65_000);
    expect(result.state.building.rooms.find((r) => r.roomId === 'room-2')).toEqual({
      roomId: 'room-2',
      level: 2,
      tenantId: null,
    });
  });

  it('blocks upgrading an occupied room beyond its tenant budget (GDD 4.3)', () => {
    // Student (budget 150) cannot live in a Level 2 room (rent 210).
    const studentState: GameState = {
      ...stateWithCash(1_000_000, 4),
      progression: { roomCapacity: 4, unlockedMaxLevel: L2 },
      tenants: [{ tenantId: 'tenant-99', archetype: 'student' as const }],
      building: {
        roomCapacity: 4,
        rooms: [{ roomId: 'room-1', level: L1, tenantId: 'tenant-99' }],
      },
    };
    const result = upgradeRoom(studentState, 'room-1');
    expect(result).toMatchObject({ ok: false, reason: 'TENANT_BUDGET_TOO_LOW' });
  });

  it('allows upgrading when the tenant can afford the new rent (office_worker 380 >= 210)', () => {
    const officeState: GameState = {
      ...stateWithCash(1_000_000, 4),
      progression: { roomCapacity: 4, unlockedMaxLevel: L2 },
    }; // room-1 tenant is office_worker
    const result = upgradeRoom(officeState, 'room-1');
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.building.rooms.find((r) => r.roomId === 'room-1')?.level).toBe(2);
  });

  it('Level 3 is the ceiling', () => {
    const maxed: GameState = {
      ...stateWithCash(1_000_000, 4),
      progression: { roomCapacity: 4, unlockedMaxLevel: L3 },
      building: {
        roomCapacity: 4,
        rooms: [{ roomId: 'room-1', level: L3, tenantId: 'tenant-1' }],
      },
    };
    const result = upgradeRoom(maxed, 'room-1');
    expect(result).toMatchObject({ ok: false, reason: 'MAX_LEVEL_REACHED' });
  });

  it('unknown room fails cleanly', () => {
    const result = upgradeRoom(stateWithCash(1_000_000, 4), 'room-9');
    expect(result).toMatchObject({ ok: false, reason: 'ROOM_NOT_FOUND' });
  });
});
