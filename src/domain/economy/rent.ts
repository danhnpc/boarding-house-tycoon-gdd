// Economy rules (GDD 3). Pure calculations over the canonical state.
// Money is integer minor units; fractional accrual is preserved through
// state.time.incomeRemainderMinorUnits and state.time.grossRemainderMinorUnits
// so income is never silently lost.

import {
  NET_RATE,
  RENT_PER_GAME_DAY_MINOR,
} from '../config/balance';
import { ok, type CommandResult } from '../shared/result';
import { integrateNetRent, reductionAt, type IntegrationResult } from './offline';
import type { GameState } from '../types';

/** Gross rent per Game Day from occupied rooms, in minor units. */
export function grossRentPerGameDayMinor(state: GameState): number {
  return state.building.rooms.reduce((sum, room) => {
    if (room.tenantId === null) {
      return sum;
    }
    return sum + RENT_PER_GAME_DAY_MINOR[room.level];
  }, 0);
}

/**
 * Net rent per Game Day in minor units: (gross × (1 − reduction)) × 90%.
 * Uses integer arithmetic with a conservative floor; the accrual remainder
 * below absorbs the fraction so no income is lost.
 */
export function netRentPerGameDayMinor(state: GameState, now: number): number {
  const reduction = reductionAt(state, now);
  const reducedGross = Math.floor(grossRentPerGameDayMinor(state) * (1 - reduction));
  return Math.floor(reducedGross * NET_RATE);
}

/**
 * Apply one integrated interval to the state: credit whole cash, carry both
 * fractional remainders (net and gross), and move the checkpoint. Shared by the
 * online accrual, the foreground long-gap path, and the offline resume so the
 * bookkeeping cannot drift between them.
 */
export function applyIntegration(
  state: GameState,
  result: IntegrationResult,
  checkpointMs: number,
): GameState {
  const grossTotal = state.time.grossRemainderMinorUnits + result.grossFloatMinorUnits;
  const grossWhole = Math.floor(grossTotal);
  return {
    ...state,
    player: {
      ...state.player,
      cashMinorUnits: state.player.cashMinorUnits + result.creditedMinorUnits,
      lifetimeGrossIncomeMinorUnits: state.player.lifetimeGrossIncomeMinorUnits + grossWhole,
    },
    time: {
      ...state.time,
      lastCheckpointAt: checkpointMs,
      incomeRemainderMinorUnits: result.remainderMinorUnits,
      grossRemainderMinorUnits: grossTotal - grossWhole,
    },
  };
}

/**
 * Accrue income over the elapsed real time since the last checkpoint and move
 * the checkpoint to `now` in the same state update (GDD 8.1: an interval is
 * never credited twice). Uses the same segment integration as the offline
 * resume (GDD 8.2 / tech doc 9.2), so online and offline cannot drift.
 */
export function accrueIncome(state: GameState, now: number): CommandResult<GameState> {
  if (now < state.time.lastCheckpointAt) {
    return { ok: false, reason: 'CLOCK_MOVED_BACKWARDS' };
  }
  const result = integrateNetRent(
    state,
    state.time.lastCheckpointAt,
    now,
    state.time.incomeRemainderMinorUnits,
  );
  return ok(applyIntegration(state, result, now));
}

/** Display convenience: whole Cash (GDD shows whole values; minor is truth). */
export function toWholeCash(minorUnits: number): number {
  return Math.floor(minorUnits / 100);
}
