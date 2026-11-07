---
name: isometric-world-rendering
description: Use when building or changing the isometric boarding-house world in Phaser: grid-to-screen projection, depth sorting, room sprites and hit areas, camera, selection, and rendering from state. Covers the responsive touch-and-mouse web target (ADR 0003). Not for HUD, panels, or domain logic.
---

# Isometric World Rendering

## When to use

- Implementing the Phaser scene that draws the boarding house.
- Adding room, furniture, or tenant visuals to the world.
- Changing camera behavior, pointer/touch selection, or depth ordering.
- Adjusting how the world scales across desktop, Android Chrome, and iOS Safari.

## Source of truth

- `docs/planning/technical-architecture.md`: Phaser scene, isometric projection, rendering and input sections (3.x, 4 project structure, 5.x, 6.x).
- `docs/gdd/game-design-plan.md`: world layout and room rules (sections 3.x, 4.x, 5.x).
- `docs/decisions/0003-web-first-responsive-delivery.md`: one responsive web build; portrait 9:16 is primary, landscape must still work.

## Rules

1. **Projection:**
   - `screenX = (gridX - gridY) * (tileWidth / 2)`
   - `screenY = (gridX + gridY) * (tileHeight / 2)`
   Keep projection in one pure helper so it can be unit-tested.
2. **Depth sorting** uses the **ground contact point** of each sprite (its base on the tile), not its visual top. Sort by `screenY` of that point, or by `gridX + gridY`, consistently.
3. **Room-level hit areas.** Players select a room, not a sprite pixel. Use a diamond or polygon hit area per room footprint.
4. **State-driven rendering.** The world reads the current game state through a read-only snapshot or view model. Phaser never writes game rules. Phaser may keep purely visual state (tweens, hover highlight).
5. **No physics and no pathfinding in MVP.** Movement, if any, is a simple tween.
6. **Input is touch and mouse.** Use Phaser pointer events that cover both. Do not rely on hover for any required action. Minimum touch target for a tappable room is at least 44 px in CSS pixels.
7. **Responsive scaling.** Use `Phaser.Scale.FIT` (or equivalent) with the canvas sized from the viewport. Re-layout on resize and orientation change. Portrait is primary; landscape must not break the layout.
8. **Camera** is bounded to the world footprint, supports pan and zoom with clamped limits, and resets to the default framing on demand.
9. **Visual selection is reported to React** through the typed `GameToUiEvent` contract (for example `roomSelected` with a room id). Do not send positions per frame.
10. **Phaser game lifecycle** is owned by the bridge (see `react-phaser-bridge`). The scene only builds and updates its objects; it never creates a second game instance.

## Procedure

1. Implement the pure projection and footprint helpers in a Phaser-free module and test them.
2. Build the scene: ground tiles, room sprites, and a per-room hit area.
3. Add depth sorting based on the ground contact point.
4. Connect rendering to a state snapshot: on each state change, update only the sprites whose data changed.
5. Add pan, zoom with limits, and reset.
6. Add tap and click selection, emitting `roomSelected` to the UI bridge.
7. Test on a portrait phone viewport, a landscape phone viewport, and a desktop viewport.
8. Run the Tests section before marking the task done.

## Tests

- Projection helper: known grid cells map to expected screen coordinates; round trip if an inverse exists.
- Depth order: a room behind another on the grid draws below it.
- Hit areas: a tap in the room's diamond selects that room; a tap just outside does not.
- Touch target size is at least 44 px for each tappable room at the default zoom.
- Resize and orientation change keep the world visible and centered.
- Camera stays within bounds after pan and zoom.
- Browser check on Chrome desktop, Chrome Android emulation, and iOS Safari (or Playwright WebKit) with no console errors.

## Anti-patterns

- Sorting depth by sprite center or top edge instead of ground contact.
- Putting game rules inside the Phaser scene.
- Recreating sprites on every state change.
- Per-frame positions sent to React state.
- Hover-only interactions.
- Calling the desktop layout "mobile" and skipping portrait testing.
- Creating a second Phaser game when React re-renders.

## Done checklist

- [ ] Projection and footprint helpers are pure and unit-tested.
- [ ] Depth uses the ground contact point.
- [ ] Each room has a hit area and emits a typed selection event.
- [ ] Rendering reads state snapshots; Phaser does not own rules.
- [ ] Camera is bounded; resize works in portrait and landscape.
- [ ] Touch targets are at least 44 px.
- [ ] Tests and browser checks in the Tests section pass.
