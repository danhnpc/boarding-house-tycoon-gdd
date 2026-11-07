---
name: idle-economy-time-engine
description: Use when implementing or changing the idle economy of Boarding House Tycoon: game-time conversion, rent accrual, operating cost, events and modifiers, candidate cooldowns, the 8-hour offline cap, fractional remainders, and offline income integration. Use together with game-domain-pure-logic.
---

# Idle Economy and Time Engine

## When to use

- Implementing rent, operating cost, or net income per tick.
- Implementing offline progress when the player returns.
- Adding or changing events, modifiers, candidate cooldowns, or the candidate queue.
- Checking any number that depends on game time.

## Source of truth

- `docs/gdd/game-design-plan.md`: economy (sections 3.x), rent table and costs (4.x), events and candidates (5.x, 6.x), offline rules (8.x), balance numbers (13).
- `docs/planning/technical-architecture.md`: time provider, offline integration, and save checkpoint sections (3.x, 6.x, 7.x).

Numbers in this skill are copies for quick reference. If they differ from the GDD, the GDD wins.

## Rules

1. **Time:** `1 Game Day = 3,600 real seconds`. Rent accrues per real minute as `Rent per Game Day / 60`, only for occupied rooms.
2. **Rent table (per Game Day):**

   | Level | Gross | Operating cost (10%) | Net (90%) |
   |---|---|---|---|
   | L1 | 120 | 12 | 108 |
   | L2 | 210 | 21 | 189 |
   | L3 | 350 | 35 | 315 |

3. **Operating cost** is 10% of gross and applies **only to occupied rooms**. Vacant rooms produce nothing and cost nothing. Net = gross × 90%.
4. **Build and upgrade costs:** Room 3: 900. Room 4: 1,400. Room 5: 2,100. Room 6: 3,000. Upgrade L1 to L2: 650. Upgrade L2 to L3: 1,300.
5. **Money is integer minor units** (100 minor = 1 Cash). Keep the fractional remainder between ticks. Never floor every tick, or income drifts.
6. **Events:** 25% base chance per valid check.
   - Delay event: gross reduced 15% for 1 Game Day.
   - Utility outage: gross reduced 10% for 1 Game Day.
   - Only one event is active at a time.
7. **Modifiers** are time-bounded. `netRentAt(t) = netRentPerGameDay × (1 − reduction(t))`, with total reduction capped at 25%.
8. **Offline progress:**
   - `offlineElapsed = min(max(now − lastCheckpointAt, 0), 8 hours)`.
   - Integrate `netRentAt(t)` over the interval, splitting the interval at every modifier expiry.
   - Modifiers keep counting while offline.
   - **No events or candidates are generated offline.**
   - Event and candidate cooldowns advance **only while online**.
   - A clock that moves backwards gives **zero** income.
9. **Offline credit and checkpoint update** are one atomic save transaction (see `local-first-save-migration`).
10. **Candidates:** the queue holds at most 3. A candidate is eligible when `Maximum Budget >= Room Rent`.
11. **Time and randomness are injected.** Use `TimeProvider` for the clock and a seeded RNG for chance rolls. Never call `Date.now()` or `Math.random()` inside the engine.

## Procedure

1. Write the pure functions first: `netRentPerGameDay`, `rentPerRealSecond`, `applyTick(state, dtSeconds)`, `integrateOffline(state, now)`.
2. Keep the fractional remainder in state, not in a local variable.
3. Implement modifiers as data with `startAt` and `endAt` (integer ms). Split intervals at expiry points.
4. Implement the event roll with the injected RNG and the "one active event" rule.
5. Implement candidate cooldown and queue limits.
6. Wire the offline step into startup: compute the credit, show a summary, and write credit plus checkpoint atomically.
7. Test with a fake clock and seeded RNG. No real timers in unit tests.
8. Run the Tests section before marking the task done.

## Tests

- 1 Game Day equals 3,600 seconds of accrual; one real minute of an L1 occupied room yields 108 / 60 = 1.8 Cash net (180 minor units).
- Vacant rooms yield zero rent and zero operating cost.
- Operating cost is exactly 10% of gross for occupied rooms; net is 90%.
- Fractional remainders accumulate across many small ticks without drift.
- Offline elapsed is capped at 8 hours.
- Modifiers expire at the correct time during an offline interval; the integral is split correctly.
- Total reduction never exceeds 25%.
- Offline interval generates no events and no candidates; cooldowns do not advance offline.
- Clock moved backwards: offline credit is zero.
- Candidate queue never exceeds 3; a candidate with `Maximum Budget < Room Rent` is not eligible.
- Event roll with a seeded RNG is reproducible; only one event is active at a time.

## Anti-patterns

- Rounding every tick down to whole minor units.
- Applying operating cost to vacant rooms.
- Describing operating cost as "a cost on income" without the 10%-of-gross and occupied-only rules.
- Generating events or candidates during offline catch-up.
- Using `Date.now()` or `Math.random()` in the engine.
- Letting modifiers stop counting while the app is closed.
- Advancing cooldowns offline.

## Done checklist

- [ ] Time conversion is 3,600 seconds per Game Day.
- [ ] Rent table and operating cost match the GDD exactly.
- [ ] Fractional remainders are preserved in state.
- [ ] Offline: 8-hour cap, modifier splitting, 25% reduction cap, no events, zero on backwards clock.
- [ ] Cooldowns advance only online; candidate queue limit and eligibility are enforced.
- [ ] Clock and RNG are injected; unit tests use a fake clock and seeded RNG.
- [ ] All tests in the Tests section pass.
