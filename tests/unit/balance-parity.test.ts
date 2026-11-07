// Balance parity: config values must match the GDD tables exactly
// (game-domain-pure-logic skill, rule 7). Changing one side without the other
// fails here.

import { describe, expect, it } from 'vitest';
import {
  BUILD_COST_MINOR,
  EXPANSION_1,
  EXPANSION_2,
  INITIAL_CAPACITY,
  MAX_COMBINED_INCOME_REDUCTION,
  MAX_ROOMS,
  NET_RATE,
  OPERATING_COST_RATE,
  REAL_SECONDS_PER_GAME_DAY,
  RENT_PER_GAME_DAY_MINOR,
  SCHEMA_VERSION,
  STARTING_CASH_MINOR,
  TENANT_BUDGET_PER_GAME_DAY_MINOR,
  UPGRADE_COST_MINOR,
} from '../../src/domain/config/balance';
import { SCHEMA_VERSION as SAVE_VERSION } from '../../src/persistence/schema';

describe('GDD parity', () => {
  it('rent table matches GDD 3.2 (minor units, 100 = 1 Cash)', () => {
    expect(RENT_PER_GAME_DAY_MINOR).toEqual({ 1: 12_000, 2: 21_000, 3: 35_000 });
  });

  it('build costs match GDD 3.3', () => {
    expect(BUILD_COST_MINOR).toEqual({ 3: 90_000, 4: 140_000, 5: 210_000, 6: 300_000 });
  });

  it('upgrade costs match GDD 3.3', () => {
    expect(UPGRADE_COST_MINOR).toEqual({ 2: 65_000, 3: 130_000 });
  });

  it('tenant budgets match GDD 5.1', () => {
    expect(TENANT_BUDGET_PER_GAME_DAY_MINOR).toEqual({
      student: 15_000,
      office_worker: 38_000,
      messy_tenant: 18_000,
    });
  });

  it('time and economy constants match GDD 3.1/3.2', () => {
    expect(REAL_SECONDS_PER_GAME_DAY).toBe(3_600);
    expect(OPERATING_COST_RATE).toBe(0.1);
    expect(NET_RATE).toBeCloseTo(0.9);
    expect(STARTING_CASH_MINOR).toBe(100_000);
    expect(INITIAL_CAPACITY).toBe(2);
    expect(MAX_ROOMS).toBe(6);
  });

  it('milestones match GDD 4.1', () => {
    expect(EXPANSION_1).toMatchObject({
      occupiedRooms: 2,
      capacity: 4,
      unlockedLevel: 2,
    });
    expect(EXPANSION_2).toMatchObject({
      occupiedRooms: 4,
      level2Rooms: 2,
      capacity: 6,
      unlockedLevel: 3,
    });
  });

  it('income reduction cap matches GDD 8.2', () => {
    expect(MAX_COMBINED_INCOME_REDUCTION).toBe(0.25);
  });

  it('save schema version matches config', () => {
    expect(SCHEMA_VERSION).toBe(3);
    expect(SAVE_VERSION).toBe(3);
  });
});
