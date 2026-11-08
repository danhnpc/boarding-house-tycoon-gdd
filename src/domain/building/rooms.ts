// Build and upgrade commands (GDD 3.3, 4.3; tech doc 6.1).

import {
  BUILD_COST_MINOR,
  MAX_LEVEL,
  RENT_PER_GAME_DAY_MINOR,
  TENANT_BUDGET_PER_GAME_DAY_MINOR,
  UPGRADE_COST_MINOR,
} from '../config/balance';
import { fail, ok, type CommandResult } from '../shared/result';
import { applyProgression, maxUnlockedLevel } from '../progression/milestones';
import type { GameState, RoomId, RoomLevel, RoomState } from '../types';

function findRoom(state: GameState, roomId: RoomId): RoomState | undefined {
  return state.building.rooms.find((room) => room.roomId === roomId);
}

function roomNumber(roomId: RoomId): number | null {
  const match = /^room-(\d+)$/.exec(roomId);
  if (match === null) {
    return null;
  }
  return Number.parseInt(match[1], 10);
}

/** Build a new nonexistent room slot (GDD 3.3, 4.1). New rooms start at Level 1. */
export function buildRoom(state: GameState, roomId: RoomId): CommandResult<GameState> {
  const number = roomNumber(roomId);
  if (findRoom(state, roomId) !== undefined) {
    return fail('ROOM_ALREADY_EXISTS');
  }
  if (number === null || !(number in BUILD_COST_MINOR)) {
    return fail('INVALID_ROOM_ID');
  }
  const nextCount = state.building.rooms.length + 1;
  if (nextCount > state.progression.roomCapacity) {
    return fail('CAPACITY_LIMIT_REACHED');
  }
  const cost = BUILD_COST_MINOR[number];
  if (state.player.cashMinorUnits < cost) {
    return fail('INSUFFICIENT_FUNDS');
  }

  const next: GameState = {
    ...state,
    player: {
      ...state.player,
      cashMinorUnits: state.player.cashMinorUnits - cost,
    },
    building: {
      ...state.building,
      rooms: [
        ...state.building.rooms,
        { roomId, level: 1 as RoomLevel, tenantId: null },
      ],
    },
  };
  return ok(next);
}

/**
 * Upgrade a room one level. Preconditions (GDD 4.3):
 * - the next level exists,
 * - the next level is unlocked,
 * - enough Cash,
 * - an occupied room can only upgrade if its tenant's budget covers the new rent.
 */
export function upgradeRoom(state: GameState, roomId: RoomId): CommandResult<GameState> {
  const room = findRoom(state, roomId);
  if (room === undefined) {
    return fail('ROOM_NOT_FOUND');
  }
  if (room.level >= MAX_LEVEL) {
    return fail('MAX_LEVEL_REACHED');
  }
  const nextLevel = (room.level + 1) as RoomLevel;
  if (nextLevel > maxUnlockedLevel(state)) {
    return fail('LEVEL_LOCKED');
  }
  const cost = UPGRADE_COST_MINOR[nextLevel as 2 | 3];
  if (state.player.cashMinorUnits < cost) {
    return fail('INSUFFICIENT_FUNDS');
  }
  if (room.tenantId !== null) {
    const tenant = state.tenants.find((t) => t.tenantId === room.tenantId);
    if (
      tenant !== undefined &&
      TENANT_BUDGET_PER_GAME_DAY_MINOR[tenant.archetype] <
        RENT_PER_GAME_DAY_MINOR[nextLevel]
    ) {
      return fail('TENANT_BUDGET_TOO_LOW');
    }
  }

  const next: GameState = {
    ...state,
    player: {
      ...state.player,
      cashMinorUnits: state.player.cashMinorUnits - cost,
    },
    building: {
      ...state.building,
      rooms: state.building.rooms.map((r) =>
        r.roomId === roomId ? { ...r, level: nextLevel } : r,
      ),
    },
  };
  // A level-up can complete a milestone (GDD 4.1), e.g. capacity from Level 3 rooms.
  return ok(applyProgression(next));
}
