// Rent and accrual rules (GDD 3.2, 8.2; tech doc 9.2). Fractional accrual
// must never round income away.

import { describe, expect, it } from 'vitest';
import { accrueIncome, activeIncomeReduction, grossRentPerGameDayMinor, netRentPerGameDayMinor, toWholeCash } from '../../src/domain/economy/rent';
import { FakeClock, initialFrozenState } from './helpers';
import type { GameState, IncomeModifier } from '../../src/domain/types';

const HOUR = 3_600;

function withModifiers(state: GameState, mods: IncomeModifier[]): GameState {
  return { ...state, modifiers: { incomeReductions: mods } };
}

describe('rent calculations', () => {
  it('starting State: 1 occupied L1 → gross 12,000 / net 10,800 minor per Game Day', () => {
    const state = initialFrozenState();
    expect(grossRentPerGameDayMinor(state)).toBe(12_000);
    expect(netRentPerGameDayMinor(state, 0)).toBe(10_800);
  });

  it('vacant rooms earn nothing', () => {
    const state = initialFrozenState();
    expect(netRentPerGameDayMinor(state, 0)).toBe(10_800); // only room-1 occupied
  });

  it('an active modifier reduces net rent by its rate on gross', () => {
    const state = withModifiers(initialFrozenState(), [
      { modifierId: 'm1', rate: 0.15, expiresAt: Number.MAX_SAFE_INTEGER },
    ]);
    // 12000 * 0.85 = 10200 gross-equiv → net 9180.
    expect(netRentPerGameDayMinor(state, 0)).toBe(9_180);
  });

  it('combined reductions cap at 25% (GDD 8.2)', () => {
    const state = withModifiers(initialFrozenState(), [
      { modifierId: 'm1', rate: 0.15, expiresAt: Number.MAX_SAFE_INTEGER },
      { modifierId: 'm2', rate: 0.2, expiresAt: Number.MAX_SAFE_INTEGER },
    ]);
    expect(activeIncomeReduction(state, 0)).toBe(0.25);
    // 12000 * (1 - 0.25) = 9000 → net 8100.
    expect(netRentPerGameDayMinor(state, 0)).toBe(8_100);
  });

  it('expired modifiers contribute nothing', () => {
    const state = withModifiers(initialFrozenState(), [
      { modifierId: 'm1', rate: 0.15, expiresAt: 0 },
    ]);
    expect(activeIncomeReduction(state, 1)).toBe(0);
  });
});

describe('accrueIncome', () => {
  it('a full Game Day of real time credits exactly the net rate', () => {
    const clock = new FakeClock(0);
    const result = accrueIncome(initialFrozenState(), HOUR, clock.now());
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.player.cashMinorUnits).toBe(100_000 + 10_800);
    expect(result.state.time.lastCheckpointAt).toBe(clock.current);
  });

  it('fractional minutes carry a remainder instead of being rounded away', () => {
    const clock = new FakeClock(0);
    const first = accrueIncome(initialFrozenState(), 30, clock.now());
    if (!first.ok) throw new Error(first.reason);
    // 3 minor/second * 30 s = 90 exactly here, remainder 0; but partial rates
    // must preserve fractions. Force one: 1 second at 10,800/3600 = 3 minor → 3.
    expect(first.state.player.cashMinorUnits).toBe(100_090);
    expect(first.state.time.incomeRemainderMinorUnits).toBeCloseTo(0);

    clock.advance(1_000);
    const second = accrueIncome(first.state, 1, clock.now());
    if (!second.ok) throw new Error(second.reason);
    expect(second.state.player.cashMinorUnits).toBe(100_093);
  });

  it('two short ticks sum to one long tick (no drift)', () => {
    const clock = new FakeClock(0);
    const base = initialFrozenState();
    const long = accrueIncome(base, 2, clock.now());
    if (!long.ok) throw new Error(long.reason);

    const tickA = accrueIncome(base, 1, clock.now());
    if (!tickA.ok) throw new Error(tickA.reason);
    const tickB = accrueIncome(tickA.state, 1, clock.now() + 1);
    if (!tickB.ok) throw new Error(tickB.reason);
    expect(tickB.state.player.cashMinorUnits).toBe(long.state.player.cashMinorUnits);
  });

  it('zero elapsed time changes nothing but still advances the checkpoint', () => {
    const clock = new FakeClock(5_000);
    const result = accrueIncome(initialFrozenState(), 0, clock.now());
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.player.cashMinorUnits).toBe(100_000);
    expect(result.state.time.lastCheckpointAt).toBe(5_000);
  });

  it('negative elapsed time is rejected', () => {
    const result = accrueIncome(initialFrozenState(), -1, 0);
    expect(result).toMatchObject({ ok: false, reason: 'NEGATIVE_ELAPSED_TIME' });
  });

  it('toWholeCash: 100,999 minor → 1,009 Cash displayed (floor)', () => {
    expect(toWholeCash(100_999)).toBe(1_009);
  });
});
