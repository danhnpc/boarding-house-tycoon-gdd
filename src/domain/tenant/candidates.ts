// Tenant lifecycle commands (GDD 5.2, 5.4; tech doc 6.3).
// No automatic churn: tenants stay until moved out. Accept/assign is manual.

import {
  RENT_PER_GAME_DAY_MINOR,
  TENANT_BUDGET_PER_GAME_DAY_MINOR,
} from '../config/balance';
import { fail, ok, type CommandResult } from '../shared/result';
import { applyProgression } from '../progression/milestones';
import type { CandidateId, GameState, RoomId, TenantId } from '../types';

function findCandidate(state: GameState, candidateId: CandidateId) {
  return state.candidates.find((candidate) => candidate.candidateId === candidateId);
}

function findRoom(state: GameState, roomId: RoomId) {
  return state.building.rooms.find((room) => room.roomId === roomId);
}

/** `tenant-<candidateId>`, with a numeric suffix if a current tenant already holds it. */
function uniqueTenantId(state: GameState, candidateId: CandidateId): TenantId {
  const base = `tenant-${candidateId}`;
  const taken = new Set(state.tenants.map((t) => t.tenantId));
  let id: TenantId = base;
  for (let n = 2; taken.has(id); n++) {
    id = `${base}-${n}`;
  }
  return id;
}

export function roomRentPerGameDayMinor(state: GameState, roomId: RoomId): number | null {
  const room = findRoom(state, roomId);
  return room === undefined ? null : RENT_PER_GAME_DAY_MINOR[room.level];
}

/**
 * Accept a candidate into a specific vacant room. A candidate is eligible when
 * "Maximum Budget >= Room Rent" at the room's current level (GDD 5.2).
 */
export function acceptCandidate(
  state: GameState,
  candidateId: CandidateId,
  roomId: RoomId,
): CommandResult<GameState> {
  const candidate = findCandidate(state, candidateId);
  if (candidate === undefined) {
    return fail('CANDIDATE_NOT_FOUND');
  }
  const room = findRoom(state, roomId);
  if (room === undefined) {
    return fail('ROOM_NOT_FOUND');
  }
  if (room.tenantId !== null) {
    return fail('ROOM_NOT_VACANT');
  }
  const budget = TENANT_BUDGET_PER_GAME_DAY_MINOR[candidate.archetype];
  if (budget < RENT_PER_GAME_DAY_MINOR[room.level]) {
    return fail('BUDGET_TOO_LOW');
  }

  // Candidate IDs are reused once the queue empties (generation derives them
  // from the queue max), so the tenant ID must be unique among current tenants.
  const tenantId = uniqueTenantId(state, candidateId);
  const next: GameState = {
    ...state,
    tenants: [
      ...state.tenants,
      { tenantId, archetype: candidate.archetype },
    ],
    building: {
      ...state.building,
      rooms: state.building.rooms.map((r) =>
        r.roomId === roomId ? { ...r, tenantId } : r,
      ),
    },
    candidates: state.candidates.filter((c) => c.candidateId !== candidateId),
  };
  // Occupancy can complete a capacity milestone (GDD 4.1).
  return ok(applyProgression(next));
}

/** Reject a candidate: removed from the queue with no penalty (GDD 5.2). */
export function rejectCandidate(
  state: GameState,
  candidateId: CandidateId,
): CommandResult<GameState> {
  if (findCandidate(state, candidateId) === undefined) {
    return fail('CANDIDATE_NOT_FOUND');
  }
  const next: GameState = {
    ...state,
    candidates: state.candidates.filter((c) => c.candidateId !== candidateId),
  };
  return ok(next);
}

/**
 * Move an occupied room's tenant out (GDD 5.4): free, room becomes vacant
 * immediately, the tenant is discarded (never re-queued). Milestone unlocks
 * are permanent and are not revoked (GDD 4.1 / 7.2).
 */
export function moveOutTenant(state: GameState, roomId: RoomId): CommandResult<GameState> {
  const room = findRoom(state, roomId);
  if (room === undefined) {
    return fail('ROOM_NOT_FOUND');
  }
  if (room.tenantId === null) {
    return fail('ROOM_NOT_OCCUPIED');
  }
  const tenantId = room.tenantId;
  const next: GameState = {
    ...state,
    tenants: state.tenants.filter((t) => t.tenantId !== tenantId),
    building: {
      ...state.building,
      rooms: state.building.rooms.map((r) =>
        r.roomId === roomId ? { ...r, tenantId: null } : r,
      ),
    },
  };
  return ok(next);
}
