---
name: react-phaser-bridge
description: Use when wiring React UI to the Phaser world in Boarding House Tycoon: who owns which screen element, creating and destroying the Phaser game safely under React StrictMode, typed event and command contracts, subscription cleanup, and keeping per-frame data out of React state.
---

# React and Phaser Bridge

## When to use

- Mounting or unmounting the Phaser game from a React component.
- Adding a HUD element, panel, dialog, or setting that must talk to the world.
- Adding a message between React and Phaser.
- Debugging duplicate canvases, leaked listeners, or re-render performance problems.

## Source of truth

- `docs/planning/technical-architecture.md`: React/Phaser split, bridge contracts, project structure (sections 3.x, 4, 5.x).
- `docs/gdd/game-design-plan.md`: UI screens and HUD (sections 9.x).
- `docs/decisions/0003-web-first-responsive-delivery.md`: one responsive web app.

## Rules

1. **Responsibility split:**
   - **React owns:** HUD, mission card, room detail panel, candidate panel, event dialog, settings, onboarding, and all text and forms.
   - **Phaser owns:** world rendering, sprites, camera, and visual selection.
   - Neither side reaches into the other's internals.
2. **Lifecycle:** create the Phaser game in an effect with a ref to the container element. Return a cleanup that calls `game.destroy(true)` and removes all bridge listeners.
3. **StrictMode safe:** React mounts, unmounts, and remounts effects in development. The effect must be idempotent: a second mount creates exactly one game, and cleanup leaves no canvas behind.
4. **Re-renders never recreate the game.** Store the game instance in a ref. Keep the effect's dependency list empty or limited to values that truly require a rebuild (none in MVP).
5. **Typed contracts only:**
   - `GameToUiEvent`: e.g. `roomSelected`, `worldReady`, `eventTriggered`.
   - `UiToGameCommand`: e.g. `focusRoom`, `resetCamera`, `setSpeed`.
   - Every message has a discriminated `type` and a typed payload. No `any`, no ad-hoc strings.
6. **No per-frame data in React state.** Positions, tweens, and hover state stay in Phaser. React receives only discrete events.
7. **Subscriptions are cleaned up.** Every `on()` or `subscribe()` has a matching `off()` in the cleanup. Never leave listeners attached after unmount.
8. **Game state flows one way into rendering.** React and Phaser both read the same state store. Commands go through the typed command path, which then changes state in the domain layer.
9. **Domain stays framework-free.** Bridge code may import React and Phaser. Domain modules may not (see `game-domain-pure-logic`).

## Procedure

1. Define the `GameToUiEvent` and `UiToGameCommand` unions in one shared contracts file.
2. Write a `PhaserHost` React component: it holds a container ref, creates the game in an effect, and destroys it in cleanup.
3. Expose a small bridge object (send command, subscribe to events) created inside the effect and disposed in cleanup.
4. Build HUD and panels as ordinary React components that read the store and dispatch commands.
5. Verify that React re-renders do not touch the Phaser game.
6. Run the Tests section before marking the task done.

## Tests

- Mount, unmount, and remount under StrictMode leaves exactly one canvas in the DOM.
- After unmount, `game.destroy(true)` has been called and no listeners remain (assert the subscription count is zero).
- A `roomSelected` event from Phaser updates the React room detail panel.
- A `focusRoom` command from React moves the camera.
- A React state change that does not affect the world does not re-create the Phaser game (count constructor calls).
- Typed contracts compile: an unknown event type fails type-checking.
- No Phaser position data appears in the React store during a 10-second run.

## Anti-patterns

- Creating the Phaser game in render or at module load.
- Forgetting `game.destroy(true)`, which leaves a second canvas after navigation or StrictMode remount.
- Sending positions or tween progress to React every frame.
- Using untyped string events or `any` payloads.
- Letting Phaser code call React setters directly.
- Attaching listeners without removing them.

## Done checklist

- [ ] React owns UI; Phaser owns world; no cross-reaching.
- [ ] Game creation and `game.destroy(true)` live in one effect, safe under StrictMode.
- [ ] Re-renders do not recreate the game.
- [ ] Contracts are typed unions in one shared file.
- [ ] No per-frame data in React state.
- [ ] Every subscription is removed on cleanup.
- [ ] All tests in the Tests section pass.
