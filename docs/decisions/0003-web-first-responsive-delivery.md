# ADR 0003: Web-First Responsive Delivery; Native Store Wrapper Deferred

- **Status:** Accepted for the MVP baseline
- **Decision date:** 2026-11-07
- **Decision owners:** Product / Engineering
- **Supersedes (in part):** the mobile-first platform target and the Capacitor packaging decisions in [ADR 0001](0001-react-phaser-capacitor.md). The rest of ADR 0001 (React, Phaser, Zustand, Vite, IndexedDB, Vitest, Playwright, pnpm) still applies.
- **Related documents:**
  - [`../gdd/game-design-plan.md`](../gdd/game-design-plan.md)
  - [`../planning/technical-architecture.md`](../planning/technical-architecture.md)
  - [`0002-local-first-save.md`](0002-local-first-save.md)

## Context

The product was planned as mobile-first with Android packaged through Capacitor and iOS out of MVP scope. The product owner now wants the MVP to be a **web game first**. A single responsive web build should run in desktop browsers and in Android and iOS mobile browsers, so the team builds and tests one deliverable instead of a web build plus a native wrapper per platform.

The game is portrait-first (9:16 composition), touch-friendly, single-player, and local-first. None of these requirements needs a native API that a mobile browser cannot provide for the MVP.

## Decision

1. **Delivery target:** one responsive web application. It is the MVP deliverable and the only build target for the MVP.
2. **Platforms:** desktop browsers (Chrome, Edge, Firefox, Safari) and mobile browsers (Chrome on Android, Safari on iOS), current versions. Android and iOS players reach the game through their browsers.
3. **Layout:** portrait phone (9:16) is the primary composition. Landscape and desktop widths scale the same scene and panels. Layout uses CSS viewport units and safe-area insets. Gameplay never depends on orientation or screen size.
4. **Store wrapper:** not part of the MVP. A native wrapper (Capacitor or similar) is a later, optional step for store distribution. It is added only when there is a store-listing requirement. Domain code must still not import wrapper APIs, so the option stays open.
5. **Persistence:** unchanged from [ADR 0002](0002-local-first-save.md). IndexedDB is the save store. Persistent storage is requested where supported.

## Consequences

### Positive

- One build, one test matrix, one release path.
- Faster iteration: development, Playwright tests, and playtests all run in the browser.
- No WebView packaging, signing, or native plugin work in the MVP.

### Negative / limitations

- **iOS Safari storage risk.** Safari may delete script-writable storage, including IndexedDB, for sites not used for a long period (Intelligent Tracking Prevention). Players who do not add the game to the Home Screen can lose local progress. Mitigations: request `navigator.storage.persist()`, show a clear save-warning in Settings, and recommend a Home Screen install during onboarding. Save loss on iOS is an accepted MVP risk until a cloud or export option exists.
- **Lifecycle is less reliable.** Mobile browsers may discard a background tab without a final `pagehide` callback. Periodic checkpoints (GDD 8.3, tech doc 9.3) remain mandatory.
- **No store presence.** Without a wrapper, the game cannot be listed in the Google Play or App Store. Store-only requirements (privacy listing, Data safety form, store icons and splash, rating) apply only if a wrapper is released.
- **Performance varies by browser.** Frame rate, memory limits, and audio behavior differ between mobile browsers. Real-device browser testing is required before release.
- **Install prompts and fullscreen are not guaranteed.** Any "install" or fullscreen behavior is an enhancement, not a requirement.

## Alternatives considered

### Native-first with Capacitor (previous baseline)

**Not selected for the MVP.** It gives store presence but adds a second build target, native signing, WebView testing, and a plugin surface, before the core loop has been validated. It remains available later (see Revisit).

### Progressive Web App (PWA) with home-screen install as the primary path

**Partly adopted.** A web manifest and a home-screen install are recommended for iOS storage reliability and better launch behavior. They are enhancements, not a separate delivery target.

### Trusted Web Activity for Android

**Deferred.** It is a store-distribution option for Android and only matters once a store wrapper is needed.

## Revisit when

Reconsider this ADR when one or more of the following is required:

- The game must be listed in the Google Play or App Store.
- iOS save loss is measured as a material retention problem, and a cloud or export option cannot solve it.
- Required device features (for example, push notifications or reliable background timers on iOS) cannot be provided in the browser.
- The browser build cannot meet the frame-rate or memory targets on supported devices after profiling.

Any move to a store wrapper must record the migration impact on the build, the save adapter, lifecycle handling, and release checklist.

## Implementation checklist

- [ ] One responsive build is the only production artifact.
- [ ] Layout is verified at portrait phone, landscape phone, and desktop widths.
- [ ] Safe-area insets are applied to HUD and panels.
- [ ] `navigator.storage.persist()` is requested and its result is shown in Settings.
- [ ] iOS Safari save-risk warning and Home Screen recommendation are in onboarding and Settings.
- [ ] Real-device browser tests cover Android Chrome and iOS Safari (see tech doc 12.4).
- [ ] No store wrapper code exists in the MVP repository until a wrapper ADR is accepted.
