---
name: game-domain-pure-logic
description: Use when writing or reviewing the game's domain layer in src/domain/ for Boarding House Tycoon: pure rules, state transitions, money in minor units, data-driven balance config, and the import restrictions that keep the domain testable and framework-free. Use before any change to rules, costs, or room logic.
---

# Game Domain Pure Logic

## When to use

- Adding or changing a game rule (rent, room build, upgrade, candidate eligibility, events).
- Creating balance data (room costs, rent tables, event parameters).
- Writing or reviewing code in `src/domain/`.
- Adding randomness or time to a rule.

## Source of truth

- `docs/planning/technical-architecture.md`: project structure (section 4), domain rules and time/RNG injection (sections 3.x, 5.x).
- `docs/gdd/game-design-plan.md`: rule definitions and balance numbers (sections 3.x through 6.x, 13).

## Rules

1. **Location:** all rules live in `src/domain/`.
2. **Forbidden imports in `src/domain/`:**
   - `react`, `phaser`, `zustand`
   - `@capacitor/*`
   - IndexedDB, Dexie
   - DOM and browser globals: `window`, `document`, `localStorage`, `navigator`
   Enforce this with a lint rule or a test that scans imports.
3. **Pure functions:** `(state, input) => nextState` or `(state, input) => { state, effects }`. No mutation of inputs. No I/O.
4. **Injected time and randomness:**
   - Clock: a `TimeProvider` interface with `now(): number`. Never call `Date.now()` in the domain.
   - Randomness: a seeded RNG passed in as a parameter. Never call `Math.random()`.
5. **Money is integer minor units.** 100 minor units = 1 displayed Cash. Formatting to a display string happens outside the domain.
6. **Data-driven config:** costs, rent tables, event parameters, and cooldowns live in typed config objects (for example `src/domain/config/balance.ts`). Rules read from config; no magic numbers in logic.
7. **Balance values must match the GDD:**
   - Rent per Game Day gross: L1 120, L2 210, L3 350. Operating cost 10% of gross on occupied rooms. Net 90%.
   - Build: Room 3 900, Room 4 1,400, Room 5 2,100, Room 6 3,000. Upgrade L1 to L2 650, L2 to L3 1,300.
   - 1 Game Day = 3,600 real seconds.
8. **Explicit results:** rules that can fail return a typed result (`{ ok: true, state } | { ok: false, reason }`), not thrown exceptions for normal gameplay outcomes.
9. **Persistence and rendering are downstream.** The domain does not know about saves or screens.

## Procedure

1. Define plain types for `GameState`, rooms, tenants, candidates, events, and modifiers.
2. Put balance numbers into a typed config file with a source comment pointing to the GDD section.
3. Write each rule as a pure function. Inject `TimeProvider` and RNG as parameters.
4. Add an import-guard test that fails on any forbidden import in `src/domain/`.
5. Write unit tests with fixed inputs, a fake clock, and a seeded RNG.
6. Run the Tests section before marking the task done.

## Tests

- Import guard: no forbidden module or global appears in `src/domain/**`.
- Each rule is deterministic: same state, input, clock, and seed give the same output.
- Balance config values match the GDD table (a test asserts the numbers).
- Money math uses integers only; no floats appear in state fields for money.
- A rule given an invalid action returns `{ ok: false, reason }` and leaves state unchanged.
- Rules never mutate their input (test with a frozen state object).

## Anti-patterns

- Calling `Date.now()` or `Math.random()` inside a rule.
- Importing React, Phaser, Zustand, Capacitor, IndexedDB, or DOM globals into `src/domain/`.
- Floats for money, or rounding inside rules without the fractional remainder.
- Hard-coded numbers in rule functions instead of config.
- Mutating state in place.
- Throwing for expected gameplay outcomes.

## Done checklist

- [ ] All rules are in `src/domain/` as pure functions.
- [ ] Forbidden imports are absent and guarded by a test.
- [ ] Time and randomness are injected.
- [ ] Money is integer minor units.
- [ ] Balance numbers are in typed config and match the GDD.
- [ ] Rules return explicit results for invalid actions.
- [ ] All tests in the Tests section pass.
