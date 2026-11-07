// Candidate generation (GDD 5.3 resolved rules). Deterministic: each 5-active-
// minute check adds at most one candidate when the queue has room and at least
// one vacant affordable room exists. No probability roll. Weights are re-
// normalized over archetypes that currently have an affordable vacant room.

import { CANDIDATE_QUEUE_LIMIT, CANDIDATE_WEIGHTS, RENT_PER_GAME_DAY_MINOR, TENANT_BUDGET_PER_GAME_DAY_MINOR } from '../config/balance';
import type { Rng } from '../shared/rng';
import type { GameState, TenantArchetype } from '../types';

export function affordableVacantRoom(state: GameState, archetype: TenantArchetype): boolean {
  const budget = TENANT_BUDGET_PER_GAME_DAY_MINOR[archetype];
  return state.building.rooms.some(
    (room) => room.tenantId === null && RENT_PER_GAME_DAY_MINOR[room.level] <= budget,
  );
}

export function eligibleArchetypes(state: GameState): TenantArchetype[] {
  const every = (Object.keys(CANDIDATE_WEIGHTS) as TenantArchetype[]).filter((archetype) =>
    affordableVacantRoom(state, archetype),
  );
  return every;
}

/**
 * One 5-minute check: add a candidate unless the queue is full or nothing is
 * affordable. Returns unchanged state when nothing is added.
 */
export function generateCandidate(state: GameState, rng: Rng): GameState {
  if (state.candidates.length >= CANDIDATE_QUEUE_LIMIT) {
    return state;
  }
  const eligible = eligibleArchetypes(state);
  if (eligible.length === 0) {
    return state;
  }
  const weightsTotal = eligible.reduce((sum, archetype) => sum + CANDIDATE_WEIGHTS[archetype], 0);
  let roll = rng.next() * weightsTotal;
  let chosen = eligible[eligible.length - 1];
  for (const archetype of eligible) {
    roll -= CANDIDATE_WEIGHTS[archetype];
    if (roll < 0) {
      chosen = archetype;
      break;
    }
  }
  const maxExisting = state.candidates
    .map((c) => Number.parseInt(c.candidateId.replace('candidate-', ''), 10) || 0)
    .reduce((max, n) => Math.max(max, n), 0);
  return {
    ...state,
    candidates: [
      ...state.candidates,
      { candidateId: `candidate-${maxExisting + 1}`, archetype: chosen },
    ],
  };
}
