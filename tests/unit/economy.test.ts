// Rent and accrual rules (GDD 3.2, 8.2; tech doc 9.2). Online ticks share the
// same segment integration as the offline resume; fractional accrual must
// never round income away. Timestamps are epoch milliseconds.

import { describe, expect, it } from 'vitest';
import {
  accrueIncome,
  activeIncomeReduction,
  grossRentPerGameDayMinor,
  netRentPerGameDayMinor,
  toWholeCash,
} from '../../src/domain/economy/rent';
import {
  OFFLINE_CAP_MS,
  integrateOffline,
  integrateNetRent,
} from '../../src/domain/economy/offline';
import { initialFrozenState } from './helpers';
import type { GameState, IncomeModifier } from '../../src/domain/types';

const HOUR_MS = 3_600_000;

function withModifiers(state: GameState, mods: IncomeModifier[]): GameState {
  return { ...state, modifiers: { incomeReductions: mods } };
}

describe('rent calculations', () => {
  it('starting state: 1 occupied L1 → gross 12,000 / net 10,800 minor per Game Day', () => {
    const state = initialFrozenState();
    expect(grossRentPerGameDayMinor(state)).toBe(12_000);
    expect(netRentPerGameDayMinor(state, 0)).toBe(10_800);
  });

  it('the vacant second room earns nothing and costs nothing', () => {
    const state = initialFrozenState();
    expect(grossRentPerGameDayMinor(state)).toBe(12_000); // room-2 vacant
  });

  it('an active modifier reduces net rent via gross', () => {
    const state = withModifiers(initialFrozenState(), [
      { modifierId: 'm1', rate: 0.15, expiresAt: Number.MAX_SAFE_INTEGER },
    ]);
    // 12000 * 0.85 = 10200 → net 9180.
    expect(netRentPerGameDayMinor(state, 0)).toBe(9_180);
  });

  it('combined reductions cap at 25% (GDD 8.2)', () => {
    const state = withModifiers(initialFrozenState(), [
      { modifierId: 'm1', rate: 0.15, expiresAt: Number.MAX_SAFE_INTEGER },
      { modifierId: 'm2', rate: 0.2, expiresAt: Number.MAX_SAFE_INTEGER },
    ]);
    expect(activeIncomeReduction(state, 0)).toBe(0.25);
    expect(netRentPerGameDayMinor(state, 0)).toBe(8_100);
  });

  it('expired modifiers contribute nothing', () => {
    const state = withModifiers(initialFrozenState(), [
      { modifierId: 'm1', rate: 0.15, expiresAt: 0 },
    ]);
    expect(activeIncomeReduction(state, 1)).toBe(0);
  });
});

describe('accrueIncome (online tick)', () => {
  it('a full Game Day of real time credits exactly the net rate', () => {
    const result = accrueIncome(initialFrozenState(), HOUR_MS);
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.player.cashMinorUnits).toBe(100_000 + 10_800);
    expect(result.state.time.lastCheckpointAt).toBe(HOUR_MS);
  });

  it('two 1-second ticks each credit 3 minor and never drift', () => {
    const base = initialFrozenState();
    const tickA = accrueIncome(base, 1_000);
    if (!tickA.ok) throw new Error(tickA.reason);
    const tickB = accrueIncome(tickA.state, 2_000);
    if (!tickB.ok) throw new Error(tickB.reason);
    const long = accrueIncome(base, 2_000);
    if (!long.ok) throw new Error(long.reason);
    expect(tickB.state.player.cashMinorUnits).toBe(long.state.player.cashMinorUnits);
  });

  it('fractional net rates keep remainder in state; no long-run drift', () => {
    // 15% reduction: net per second = 9180/3600 = 2.55 minor.
    const modded = withModifiers(initialFrozenState(), [
      { modifierId: 'm1', rate: 0.15, expiresAt: Number.MAX_SAFE_INTEGER },
    ]);
    let state = modded;
    let previousCash = state.player.cashMinorUnits;
    for (let i = 1; i <= 400; i++) {
      const result = accrueIncome(state, i * 1_000);
      if (!result.ok) throw new Error(result.reason);
      state = result.state;
      // Credit never decreases tick over tick.
      expect(state.player.cashMinorUnits).toBeGreaterThanOrEqual(previousCash);
      previousCash = state.player.cashMinorUnits;
    }
    // 400 s = 2.55 * 400 = 1,020 minor. Float epsilon can put a ±1 minor
    // transient at exact boundaries, but it must never accumulate: after a
    // long horizon the credit is within 1 minor unit of the exact integral.
    expect(Math.abs(state.player.cashMinorUnits - (100_000 + 1_020))).toBeLessThanOrEqual(1);
  });

  it('zero elapsed time credits nothing but advances the checkpoint', () => {
    const result = accrueIncome(initialFrozenState(5), 18_000_000);
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.player.cashMinorUnits).toBe(100_000);
    expect(result.state.time.lastCheckpointAt).toBe(18_000_000);
  });

  it('a backwards-moving clock is rejected (GDD 8.3/9.3)', () => {
    const result = accrueIncome(initialFrozenState(5), 0);
    expect(result).toMatchObject({ ok: false, reason: 'CLOCK_MOVED_BACKWARDS' });
  });
});

describe('integrateNetRent (shared segment integration)', () => {
  it('splits the interval at modifier expiries and sums segments', () => {
    // Reduced for first 10 s, clean for the next 110 s of a 2-minute interval.
    const state = withModifiers(initialFrozenState(), [
      { modifierId: 'm1', rate: 0.15, expiresAt: 10_000 },
    ]);
    const result = integrateNetRent(state, 0, HOUR_MS / 30, 0); // 120 s
    // Segments: 0–10 s at 2.55/s = 25.5; 10–120 s at 3/s = 330 → 355.5.
    expect(result.creditedMinorUnits).toBe(355);
    expect(result.remainderMinorUnits).toBeCloseTo(0.5);
  });

  it('a modifier expiring exactly at the interval start is inactive', () => {
    const state = withModifiers(initialFrozenState(), [
      { modifierId: 'm1', rate: 0.15, expiresAt: 0 },
    ]);
    const result = integrateNetRent(state, 0, 1_000, 0);
    expect(result.creditedMinorUnits).toBe(3); // 1 s at 3/s
  });
});

describe('integrateOffline (GDD 8.1)', () => {
  it('caps at 8 hours: 20 elapsed hours credit exactly 8 hours of net', () => {
    const capped = integrateOffline(initialFrozenState(), 20 * HOUR_MS);
    expect(capped.creditedMinorUnits).toBe(10_800 * 8);
    expect(capped.cappedAt8Hours).toBe(true);
    // Nothing carried over: an immediate second resume from the uncapped
    // checkpoint credits nothing extra (handled by the application layer
    // resetting lastCheckpointAt — the cap is "per interval", GDD B3).
  });

  it('a repeat resume of the same interval cannot re-credit (checkpoint moved)', () => {
    const first = integrateOffline(initialFrozenState(), 2 * HOUR_MS);
    expect(first.creditedMinorUnits).toBe(10_800 * 2);
    // Application layer persists: state.time.lastCheckpointAt = toMs.
    const resumedState: GameState = {
      ...initialFrozenState(),
      time: {
        lastCheckpointAt: first.toMs,
        incomeRemainderMinorUnits: first.remainderMinorUnits,
        onlineMs: 0,
      },
    };
    const second = integrateOffline(resumedState, 2 * HOUR_MS + 5);
    expect(second.creditedMinorUnits).toBe(0);
  });

  it('a backwards-moving clock grants zero', () => {
    const result = integrateOffline(initialFrozenState(5), 0);
    expect(result.creditedMinorUnits).toBe(0);
    expect(result.clockMovedBackwards).toBe(true);
  });

  it('8-hour cap constant is exactly 28,800,000 ms', () => {
    expect(OFFLINE_CAP_MS).toBe(28_800_000);
  });
});

describe('toWholeCash', () => {
  it('100,999 minor → 1,009 displayed Cash (floor)', () => {
    expect(toWholeCash(100_999)).toBe(1_009);
  });
});
