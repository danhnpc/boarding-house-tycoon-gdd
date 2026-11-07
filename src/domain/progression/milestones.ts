// Capacity/level progression (GDD 4.1, 7.2). Milestones are permanent: once
// reached they stay reached even if occupancy later drops. Deriving never
// downgrades; the stored progression state is the source of truth.

import { EXPANSION_1, EXPANSION_2, MAX_LEVEL, MAX_ROOMS } from '../config/balance';
import { ok, type CommandResult } from '../shared/result';
import type { GameState, ProgressionState, RoomLevel } from '../types';

function deriveProgression(state: GameState): ProgressionState {
  const rooms = state.building.rooms;
  const occupied = rooms.filter((room) => room.tenantId !== null).length;
  const level2Plus = rooms.filter((room) => room.level >= 2).length;

  let capacity = state.progression.roomCapacity;
  let unlockedMaxLevel: number = state.progression.unlockedMaxLevel;

  if ((occupied >= EXPANSION_1.occupiedRooms) || capacity >= EXPANSION_1.capacity) {
    capacity = Math.max(capacity, EXPANSION_1.capacity);
    unlockedMaxLevel = Math.max(unlockedMaxLevel, EXPANSION_1.unlockedLevel);
  }
  const expansion2Reached =
    occupied >= EXPANSION_2.occupiedRooms && level2Plus >= EXPANSION_2.level2Rooms;
  if (expansion2Reached || capacity >= EXPANSION_2.capacity) {
    capacity = Math.max(capacity, EXPANSION_2.capacity);
    unlockedMaxLevel = Math.max(unlockedMaxLevel, EXPANSION_2.unlockedLevel);
  }

  return {
    roomCapacity: Math.min(capacity, MAX_ROOMS),
    unlockedMaxLevel: Math.max(
      Math.min(unlockedMaxLevel, MAX_LEVEL),
      1,
    ) as RoomLevel,
  };
}

/**
 * Re-evaluate milestones and persist any newly earned capacity/level unlocks.
 * Call after every state change that can affect occupancy or room levels.
 * Downgrades are impossible; returning the same shape is a no-op.
 */
export function applyProgression(state: GameState): GameState {
  const next = deriveProgression(state);
  const changed =
    next.roomCapacity !== state.progression.roomCapacity ||
    next.unlockedMaxLevel !== state.progression.unlockedMaxLevel;
  if (!changed) {
    return state;
  }
  return { ...state, progression: next };
}

/** Max level a room may currently reach (upgrade precondition). */
export function maxUnlockedLevel(state: GameState): RoomLevel {
  return state.progression.unlockedMaxLevel;
}

/** Sanity helper kept for future UI queries; current rules never fail. */
export function progressionResult(state: GameState): CommandResult<GameState> {
  return ok(state);
}
