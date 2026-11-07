// Segment integration of net rent over an interval (GDD 8.2, tech doc 9.2).
// Shared by the online tick and the offline resume so one implementation
// cannot drift from the other: online accrual is the same formula, the only
// difference is the 8-hour cap applied at resume. GDD 8.2: "The same formula
// is used in tech doc 9.2. If one changes, change the other."

import {
  NET_RATE,
  REAL_SECONDS_PER_GAME_DAY,
  RENT_PER_GAME_DAY_MINOR,
  MAX_COMBINED_INCOME_REDUCTION,
} from '../config/balance';
import type { GameState } from '../types';

export interface IntegrationResult {
  /** Whole minor units to credit this interval. */
  creditedMinorUnits: number;
  /** New fractional remainder to persist (in state, never local-only). */
  remainderMinorUnits: number;
  /** Floating-point gross (pre-cost, post-reduction) accrued this interval. */
  grossFloatMinorUnits: number;
}

const MS_PER_SECOND = 1_000;
const SECONDS_PER_HOUR = 3_600;

/** Reduction active at time t: sum of unexpired rates, capped at 25% (GDD 8.2). */
export function reductionAt(state: GameState, tMs: number): number {
  const total = state.modifiers.incomeReductions
    .filter((modifier) => modifier.expiresAt > tMs)
    .reduce((sum, modifier) => sum + modifier.rate, 0);
  return Math.min(total, MAX_COMBINED_INCOME_REDUCTION);
}

/**
 * Integrate net rent from `fromMs` to `toMs`. The interval is split at every
 * modifier expiry inside it; each segment accrues at its constant reduced
 * rate. The fractional total is floored once for the whole interval plus the
 * carried remainder — never per segment — so rounding cannot eat income.
 */
export function integrateNetRent(
  state: GameState,
  fromMs: number,
  toMs: number,
  carriedRemainderMinorUnits: number,
): IntegrationResult {
  if (toMs < fromMs) {
    return {
      creditedMinorUnits: 0,
      remainderMinorUnits: carriedRemainderMinorUnits,
      grossFloatMinorUnits: 0,
    };
  }

  const grossPerDay = state.building.rooms.reduce((sum, room) => {
    return sum + (room.tenantId !== null ? RENT_PER_GAME_DAY_MINOR[room.level] : 0);
  }, 0);

  if (grossPerDay === 0) {
    return {
      creditedMinorUnits: 0,
      remainderMinorUnits: carriedRemainderMinorUnits,
      grossFloatMinorUnits: 0,
    };
  }

  // Segment boundaries: every distinct modifier expiry within the interval.
  const expiries = [
    ...new Set(
      state.modifiers.incomeReductions
        .filter((m) => m.expiresAt > fromMs && m.expiresAt < toMs)
        .map((m) => m.expiresAt),
    ),
  ].sort((a, b) => a - b);

  const boundaries = [fromMs, ...expiries, toMs];
  let totalFloat = carriedRemainderMinorUnits;
  let grossFloat = 0;
  for (let i = 0; i < boundaries.length - 1; i++) {
    const startMs = boundaries[i];
    const endMs = boundaries[i + 1];
    const reduction = reductionAt(state, startMs);
    const reducedGross = Math.floor(grossPerDay * (1 - reduction));
    const netPerSecondMinor = (reducedGross * NET_RATE) / REAL_SECONDS_PER_GAME_DAY;
    const seconds = (endMs - startMs) / MS_PER_SECOND;
    totalFloat += netPerSecondMinor * seconds;
    grossFloat += (reducedGross * seconds) / REAL_SECONDS_PER_GAME_DAY;
  }

  const creditedMinorUnits = Math.floor(totalFloat);
  return {
    creditedMinorUnits,
    remainderMinorUnits: totalFloat - creditedMinorUnits,
    grossFloatMinorUnits: grossFloat,
  };
}

/** Offline cap: 8 real hours per interval (GDD 8.1). */
export const OFFLINE_CAP_MS = SECONDS_PER_HOUR * 8 * MS_PER_SECOND;

export interface OfflineResult extends IntegrationResult {
  /** Actual credited window (cap-adjusted), for the resume summary UI. */
  fromMs: number;
  toMs: number;
  cappedAt8Hours: boolean;
  clockMovedBackwards: boolean;
}

/**
 * Offline resume result for `now - lastCheckpointAt`:
 * - clamped to the 8-hour cap and to non-negative (backwards clock → zero),
 * - capped window never carries over to the next resume (GDD 8.1),
 * - the caller must persist income + new checkpoint in the same snapshot.
 */
export function integrateOffline(state: GameState, nowMs: number): OfflineResult {
  const checkpoint = state.time.lastCheckpointAt;
  const rawElapsed = nowMs - checkpoint;
  const clockMovedBackwards = rawElapsed < 0;
  const elapsed = Math.min(Math.max(rawElapsed, 0), OFFLINE_CAP_MS);
  const fromMs = checkpoint;
  const toMs = checkpoint + elapsed;
  const result = integrateNetRent(
    state,
    fromMs,
    toMs,
    state.time.incomeRemainderMinorUnits,
  );
  return {
    ...result,
    fromMs,
    toMs,
    cappedAt8Hours: rawElapsed > OFFLINE_CAP_MS,
    clockMovedBackwards,
  };
}
