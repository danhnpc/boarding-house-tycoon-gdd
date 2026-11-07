// Economy rules (GDD 3). Pure calculations over the canonical state.
// Money is integer minor units; fractional accrual is preserved through
// state.time.incomeRemainderMinorUnits so income is never silently lost.

import {
  MAX_COMBINED_INCOME_REDUCTION,
  NET_RATE,
  RENT_PER_GAME_DAY_MINOR,
} from '../config/balance';
import { ok, type CommandResult } from '../shared/result';
import { integrateNetRent } from './offline';
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

export function activeIncomeReduction(state: GameState, now: number): number {
  const total = state.modifiers.incomeReductions
    .filter((modifier) => modifier.expiresAt > now)
    .reduce((sum, modifier) => sum + modifier.rate, 0);
  return Math.min(total, MAX_COMBINED_INCOME_REDUCTION);
}

/**
 * Net rent per Game Day in minor units: (gross × (1 − reduction)) × 90%.
 * Uses integer arithmetic with a conservative floor; the accrual remainder
 * below absorbs the fraction so no income is lost.
 */
export function netRentPerGameDayMinor(state: GameState, now: number): number {
  const reduction = activeIncomeReduction(state, now);
  const reducedGross = Math.floor(grossRentPerGameDayMinor(state) * (1 - reduction));
  return Math.floor(reducedGross * NET_RATE);
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
  const { creditedMinorUnits, remainderMinorUnits, grossFloatMinorUnits } =
    integrateNetRent(
      state,
      state.time.lastCheckpointAt,
      now,
      state.time.incomeRemainderMinorUnits,
    );

  const next: GameState = {
    ...state,
    player: {
      ...state.player,
      cashMinorUnits: state.player.cashMinorUnits + creditedMinorUnits,
      lifetimeGrossIncomeMinorUnits:
        state.player.lifetimeGrossIncomeMinorUnits + Math.floor(grossFloatMinorUnits),
    },
    time: {
      ...state.time,
      lastCheckpointAt: now,
      incomeRemainderMinorUnits: remainderMinorUnits,
    },
  };
  return ok(next);
}

/** Display convenience: whole Cash (GDD shows whole values; minor is truth). */
export function toWholeCash(minorUnits: number): number {
  return Math.floor(minorUnits / 100);
}
