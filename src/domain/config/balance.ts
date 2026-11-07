// One typed config source for every balance value (tech doc 5.3).
// Numbers are minor units: 100 minor units = 1 displayed Cash.
// Source: GDD sections 3.2–3.4, 4, 5, 6, 7. A test asserts parity with the
// GDD tables, so changing a value here without the GDD fails CI
// (game-domain-pure-logic skill, rule 7).

import type { RoomLevel, TenantArchetype } from '../types';

/** 1 Game Day = 60 real minutes = 3,600 real seconds (GDD 3.1). */
export const REAL_SECONDS_PER_GAME_DAY = 3_600;

/** Operating cost is 10% of gross rent; net is 90% (GDD 3.2). */
export const OPERATING_COST_RATE = 0.1;
export const NET_RATE = 1 - OPERATING_COST_RATE;

/** Gross rent per Game Day per room level (GDD 3.2). */
export const RENT_PER_GAME_DAY_MINOR: Record<RoomLevel, number> = {
  1: 12_000, // 120 Cash
  2: 21_000, // 210 Cash
  3: 35_000, // 350 Cash
};

/** Construction cost per new room number (GDD 3.3). New rooms start at Level 1. */
export const BUILD_COST_MINOR: Record<number, number> = {
  3: 90_000, // 900 Cash
  4: 140_000, // 1,400 Cash
  5: 210_000, // 2,100 Cash
  6: 300_000, // 3,000 Cash
};

/** Upgrade costs by target level (GDD 3.3). */
export const UPGRADE_COST_MINOR: Record<Exclude<RoomLevel, 1>, number> = {
  2: 65_000, // 1 -> 2, 650 Cash
  3: 130_000, // 2 -> 3, 1,300 Cash
};

/** Hard budget per Game Day by archetype (GDD 5.1). */
export const TENANT_BUDGET_PER_GAME_DAY_MINOR: Record<TenantArchetype, number> = {
  student: 15_000, // 150 Cash
  office_worker: 38_000, // 380 Cash
  messy_tenant: 18_000, // 180 Cash
};

/** Starting state (GDD 3.4). */
export const STARTING_CASH_MINOR = 100_000; // 1,000 Cash
export const INITIAL_ROOM_COUNT = 2;
export const INITIAL_CAPACITY = 2;

/** Capacity progression (GDD 4.1). Milestones are permanent once reached. */
export const MAX_ROOMS = 6;
export const MAX_LEVEL: RoomLevel = 3;
export const EXPANSION_1 = {
  occupiedRooms: 2,
  capacity: 4,
  unlockedLevel: 2 as RoomLevel,
};
export const EXPANSION_2 = {
  occupiedRooms: 4,
  level2Rooms: 2,
  capacity: 6,
  unlockedLevel: 3 as RoomLevel,
};

/** Building-wide income reductions add up, capped at 25% (GDD 8.2). */
export const MAX_COMBINED_INCOME_REDUCTION = 0.25;

/** Event system timing (GDD 6.2), in online ms. */
export const EVENT_CHECK_INTERVAL_ONLINE_MS = 5 * 60_000;
export const EVENT_BASE_CHANCE = 0.25;
export const EVENT_GLOBAL_COOLDOWN_ONLINE_MS = 10 * 60_000;
export const EVENT_PER_EVENT_COOLDOWN_ONLINE_MS = 30 * 60_000;
export const EVENT_ROLLING_WINDOW_ONLINE_MS = 60 * 60_000;
export const EVENT_MAX_PER_ROLLING_WINDOW = 3;

/** Candidate generation cadence and queue cap (GDD 5.3). */
export const CANDIDATE_CHECK_INTERVAL_ONLINE_MS = 5 * 60_000;
export const CANDIDATE_QUEUE_LIMIT = 3;
export const CANDIDATE_WEIGHTS: Record<string, number> = {
  student: 0.5,
  office_worker: 0.3,
  messy_tenant: 0.2,
};

/** Outage/water-tap delay modifiers last 1 Game Day (GDD 6.4). */
export const ONE_GAME_DAY_MS = REAL_SECONDS_PER_GAME_DAY * 1_000;

/** Selection costs of the five MVP events (GDD 6.4), minor units. */
export const EVENT_COST_MINOR: Record<string, number> = {
  'utility-outage.pay': 12_000, // 120 Cash
  'hallway-clutter.hire': 10_000, // 100 Cash
  'water-tap.repair': 15_000, // 150 Cash
  'noise-complaint.mediator': 8_000, // 80 Cash
};

/** Save schema version (ADR 0002). Bump + sequential migration on change. */
export const SCHEMA_VERSION = 3;
