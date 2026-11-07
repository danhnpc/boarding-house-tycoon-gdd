// Main Mission chain (GDD 7.1). One mission active; progress is derived from
// state, never from UI clicks. Rewards are credited to Cash once and saved.
// MVP completion = mission 7 done (one room at Level 3, not all six).

import type { GameState } from '../types';

export type MissionObjectiveKind =
  | 'TENANTS_COUNT'
  | 'ROOM_AT_LEVEL'
  | 'ROOMS_BUILT'
  | 'OCCUPIED_ROOMS'
  | 'ROOMS_AT_LEVEL_2_PLUS';

export interface MissionDefinition {
  number: number;
  objective: { kind: MissionObjectiveKind; target: number };
  rewardMinor: number;
}

/** GDD 7.1 — rewards converted to minor units here (boundary conversion). */
export const MAIN_MISSIONS: readonly MissionDefinition[] = [
  { number: 1, objective: { kind: 'TENANTS_COUNT', target: 2 }, rewardMinor: 10_000 },
  { number: 2, objective: { kind: 'ROOM_AT_LEVEL', target: 2 }, rewardMinor: 15_000 },
  { number: 3, objective: { kind: 'ROOMS_BUILT', target: 3 }, rewardMinor: 20_000 },
  { number: 4, objective: { kind: 'OCCUPIED_ROOMS', target: 3 }, rewardMinor: 15_000 },
  { number: 5, objective: { kind: 'OCCUPIED_ROOMS', target: 4 }, rewardMinor: 25_000 },
  { number: 6, objective: { kind: 'ROOMS_AT_LEVEL_2_PLUS', target: 2 }, rewardMinor: 30_000 },
  { number: 7, objective: { kind: 'ROOM_AT_LEVEL', target: 3 }, rewardMinor: 40_000 },
];

export function missionIsComplete(state: GameState, mission: MissionDefinition): boolean {
  const rooms = state.building.rooms;
  const occupied = rooms.filter((room) => room.tenantId !== null).length;
  const level2Plus = rooms.filter((room) => room.level >= 2).length;
  const highestLevel = rooms.reduce((max, room) => Math.max(max, room.level), 0);
  switch (mission.objective.kind) {
    case 'TENANTS_COUNT':
      return state.tenants.length >= mission.objective.target;
    case 'ROOM_AT_LEVEL':
      return highestLevel >= mission.objective.target;
    case 'ROOMS_BUILT':
      return rooms.length >= mission.objective.target;
    case 'OCCUPIED_ROOMS':
      return occupied >= mission.objective.target;
    case 'ROOMS_AT_LEVEL_2_PLUS':
      return level2Plus >= mission.objective.target;
  }
}

export interface MissionCheckResult {
  completed: number[];
  rewardsMinor: number;
}

/**
 * Evaluate the active mission after any state change; auto-complete cascade
 * missions whose objectives are already satisfied (e.g. after a bulk change)
 * and credit each reward exactly once (completed numbers are persisted).
 * This evaluation can never fail, so it returns the plain state.
 */
export function evaluateMissions(state: GameState): GameState {
  const completed: number[] = [];
  let rewardsMinor = 0;
  let working = state;
  for (;;) {
    const nextMission = MAIN_MISSIONS.find(
      (mission) => mission.number === working.missions.nextMissionNumber,
    );
    if (nextMission === undefined) {
      break; // chain complete
    }
    if (!missionIsComplete(working, nextMission)) {
      break;
    }
    completed.push(nextMission.number);
    rewardsMinor += nextMission.rewardMinor;
    working = {
      ...working,
      player: {
        ...working.player,
        cashMinorUnits: working.player.cashMinorUnits + nextMission.rewardMinor,
      },
      missions: {
        completedMissionNumbers: [
          ...working.missions.completedMissionNumbers,
          nextMission.number,
        ],
        nextMissionNumber: nextMission.number + 1,
      },
    };
  }
  if (completed.length === 0) {
    return state;
  }
  return working;
}

/** The mission the player is working on, or null when the chain is done. */
export function activeMission(state: GameState): MissionDefinition | null {
  return MAIN_MISSIONS.find((m) => m.number === state.missions.nextMissionNumber) ?? null;
}
