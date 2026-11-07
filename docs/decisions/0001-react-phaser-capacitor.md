# ADR 0001: Adopt React, Phaser, and Capacitor for the MVP

- **Status:** Accepted for the MVP baseline; platform target and Capacitor packaging superseded in part by [ADR 0003](0003-web-first-responsive-delivery.md); Phase 0 technical spike is the validation gate
- **Decision date:** 2026-11-07
- **Decision owners:** Product / Engineering
- **Related documents:**
  - [`../gdd/game-design-plan.md`](../gdd/game-design-plan.md)
  - [`../planning/technical-architecture.md`](../planning/technical-architecture.md)
  - [`../art/visual-direction.md`](../art/visual-direction.md)

## Context

Boarding House Tycoon is a web-first, responsive, single-player casual idle tycoon (see ADR 0003). The MVP is a 2D isometric / 2.5D cartoon boarding-house management game with a small number of rooms, selectable tenants, lightweight events, room upgrades, passive income, and a handful of UI panels.

The game world needs sprite rendering, touch input, camera/scene lifecycle, visual depth ordering, and simple animation. The rest of the experience is conventional application UI: cash and income HUD, room details, candidate lists, mission progress, and event dialogs.

The implementation should:

- Fit a browser-first development workflow.
- Use the team's existing JavaScript / TypeScript and React experience.
- Separate game rendering from UI and gameplay rules.
- Avoid adopting a full 3D engine when the MVP does not need 3D rendering, complex physics, combat, or large numbers of simulated agents.
- Serve one responsive web application to desktop and Android/iOS browsers, keeping store packaging as an optional later step.
- Keep the gameplay domain independent of the rendering and UI frameworks so the implementation can evolve without rewriting economy, tenant, mission, and event rules.

The GDD is authoritative for gameplay and balance. This ADR records the engineering technology decision only.

## Decision

Use the following stack for the MVP:

| Concern | Decision | Responsibility |
|---|---|---|
| Language | TypeScript | Application, domain rules, game integration, tooling |
| UI | React | HUD, navigation, dialogs, room and tenant panels |
| Build tooling | Vite | Local development and production web build |
| 2D game framework | Phaser 4.x | Isometric world, sprites, input, camera, animation, scene lifecycle |
| Client state adapter | Zustand | Publish canonical serializable state to React and integration adapters |
| Local persistence | IndexedDB | Local save slot and progress persistence; detailed rationale in ADR 0002 |
| Store wrapper (deferred, optional) | None in MVP; Capacitor 8.x if chosen later | Optional store packaging; see ADR 0003 |
| Unit testing | Vitest | Domain and application logic tests |
| Browser E2E testing | Playwright | End-to-end user-flow tests in a real browser |
| Package manager | pnpm | Dependency installation and lockfile management |

Use compatible stable patch versions when scaffolding the repository. Pin exact versions in `package.json`, commit `pnpm-lock.yaml`, and use one supported Node.js LTS version consistently across local development and CI. The exact versions are confirmed during Phase 0 and recorded in the repository's runtime/package configuration.

### Responsibility boundaries

- **React** owns DOM-based application UI. It does not own the Phaser frame loop, camera, or individual world sprites.
- **Phaser** owns the interactive game world and its visual lifecycle. It does not own authoritative Cash, tenant assignments, mission completion, or save data.
- **Domain modules** own deterministic gameplay rules and state transitions. They must not import React, Phaser, Zustand, or Capacitor APIs.
- **Application services** coordinate commands, validation, state updates, and persistence.
- **Zustand** is an observable adapter for the canonical serializable `GameState`; it must not become a second independent source of gameplay truth.
- **Store wrapper** (deferred; Capacitor if chosen later) would only provide packaging and native APIs. It is not part of the MVP build, is not the game engine, and does not replace Phaser.

The Phaser canvas is mounted inside a React-owned host element. The Phaser instance must be created once for its host lifecycle and explicitly destroyed during cleanup. React and Phaser communicate through typed commands/events, not direct imports of each other's runtime objects.

## Alternatives considered

### React with CSS/SVG/Canvas only

**Not selected.** It is technically possible, but the team would have to create and maintain more of the camera, input, scene lifecycle, sprite animation, hit testing, and rendering infrastructure. React remains the UI layer, not the game-world renderer.

### Cocos Creator with TypeScript

**Not selected for the current MVP.** Cocos is a capable game engine and is a valid future alternative if an editor-centric scene/asset workflow becomes more valuable than the React-first architecture. Choosing it now would move the project into a different primary editor and runtime workflow without a demonstrated MVP need.

### Unity with C#

**Not selected.** Unity provides broad 2D/3D production capabilities, but the current game does not require a 3D world or complex physics. It would introduce a C#-first workflow and reduce reuse of the team's React/TypeScript experience.

### PixiJS

**Not selected initially.** PixiJS is a strong rendering option, but Phaser supplies more of the 2D game framework structure needed here, including scenes, input, camera, and animation. Reconsider PixiJS only if Phaser creates a measurable constraint.

## Consequences

### Positive

- The team can build the game using TypeScript throughout the client.
- React handles conventional UI efficiently while Phaser handles the game world.
- The domain layer can be unit-tested without a browser or game engine.
- One responsive web build runs on desktop and Android/iOS browsers without a native wrapper.
- The rendering framework can be replaced later without intentionally rewriting gameplay rules, provided the domain boundaries are respected.

### Negative / trade-offs

- The project has two presentation systems: React DOM and the Phaser canvas. Their lifecycle, sizing, input focus, and state bridge must be deliberately managed.
- The team must implement isometric placement, depth sorting, room hit areas, and visual state mapping in Phaser; the framework does not automatically create the game's art or layout.
- Mobile browsers do not provide native rendering or guaranteed storage, so low-end device frame rate, memory use, loading, safe areas, touch responsiveness, and storage eviction (notably iOS Safari) must be measured on real devices.
- Art production still requires a consistent external asset pipeline; this stack does not replace art tooling.

## Validation gates — Phase 0 technical spike

Do not treat the technology choice as fully validated until the following checks pass:

1. A Vite + React + TypeScript app mounts one Phaser 4.x game instance.
2. A building/room sprite renders at the target portrait layout.
3. A room hit area can be selected reliably with mouse and touch.
4. A Phaser selection event opens a React room-detail panel through a typed bridge.
5. React rerenders and route/component lifecycle changes do not create duplicate Phaser instances or listeners.
6. The production build runs in Chrome on Android and Safari on iOS at portrait and landscape sizes.
7. A real-device smoke test confirms acceptable startup, touch responsiveness, memory behavior, and frame rate for the first scene.

If a gate fails, record the measured failure and revisit the smallest affected choice. Do not replace the entire stack based only on preference.

## Revisit when

Reconsider this ADR only if one or more of the following is demonstrated:

- Phaser cannot meet the supported-device performance target after profiling and reasonable optimization.
- The art/content workflow requires an editor-centric scene pipeline that the current approach cannot support efficiently.
- The game scope changes materially toward 3D, physics-heavy simulation, or complex animation tooling.
- A required capability cannot be provided reliably in mobile browsers, so a store wrapper becomes necessary (see ADR 0003).

Any replacement must include migration impact on rendering, assets, build/deploy, test strategy, and the framework-independent domain layer.

## Implementation notes

- Keep the domain layer free of framework imports.
- Keep one canonical serializable `GameState` and expose it through selectors/subscriptions.
- Do not put per-frame coordinates into React state.
- Use Phaser for the world and React for standard panels/dialogs.
- Build and validate the responsive web version on desktop and mobile browsers before completing mobile hardening.
- Keep exact package versions and runtime versions in source control.
