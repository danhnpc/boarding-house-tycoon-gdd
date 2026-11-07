---
name: local-first-save-migration
description: Use when implementing or changing game persistence for Boarding House Tycoon: the GameState save format, IndexedDB storage, schemaVersion, sequential migrations, autosave timing, offline checkpoints, corrupt-save handling and storage persistence on iOS Safari. Covers the single local save slot.
---

# Local-First Save and Migration

## When to use

- Adding or changing any field in `GameState`.
- Writing the save/load layer, autosave, or the offline checkpoint.
- Handling a save that fails to load, or changing the save schema.
- Working on storage durability for mobile browsers.

## Source of truth

- `docs/decisions/0002-local-first-save.md` (local-first, single save slot).
- `docs/decisions/0003-web-first-responsive-delivery.md` (one web build, responsive).
- `docs/planning/technical-architecture.md`: save layer, IndexedDB, migrations, lifecycle sections (7.x, 8.x, 9.x).
- `docs/gdd/game-design-plan.md`: offline and save rules (sections 8.x, 9.4).

If this skill and a doc disagree, the doc wins. Update this skill.

## Rules

1. **One local save slot** in IndexedDB. No accounts, no server, no sync in MVP.
2. **`GameState` is plain serializable data.** No class instances, functions, DOM nodes, Phaser objects, or `Date` objects. Store timestamps as integers (epoch ms).
3. **Root object has `schemaVersion`** (integer). Every save is written with the current version.
4. **Migrations are sequential and pure:** `v1 -> v2 -> v3 ...`. Each step takes the previous shape and returns the next. Never skip steps. Never mutate the input.
5. **Every migration has a fixture test:** a saved JSON from that version, loaded through the full chain, must produce a valid current `GameState`.
6. **Autosave every 60 seconds** and **after every material change** (build, upgrade, rent collection, event resolution, candidate acceptance). Material saves are debounced to avoid write storms.
7. **Atomic offline checkpoint:** the offline credit and the `lastCheckpointAt` update are written in the **same IndexedDB transaction**. Never write one without the other.
8. **Corrupt or unreadable saves are never silently reset.** Show a recoverable error screen with clear options (retry, export raw data, start a new game with explicit confirmation). Keep the raw record intact until the player chooses.
9. **Storage durability:** call `navigator.storage.persist()` on startup. If it is denied, show a Settings warning. Recommend "Add to Home Screen" on iOS. Document that iOS Safari may evict unused storage.
10. **Lifecycle events are best-effort.** Use `visibilitychange` and `pagehide` to flush a save, but never rely on them alone. The 60-second autosave is the safety net.
11. **Money in saves is integer minor units** (100 = 1 displayed Cash). Never store floats for money.
12. **Save format stays in `src/persistence/` (or the adapter layer).** The domain layer does not import IndexedDB or Dexie.

## Procedure

1. Define or change the `GameState` type in the domain layer, with plain types only.
2. If the shape changes, add a new schema version and a migration `vN -> vN+1`.
3. Add a fixture file for the previous version (`fixtures/save-vN.json`) and a test that runs the full migration chain.
4. Implement the save/load adapter: `load()`, `save(state)`, `checkpoint(credit, at)` (atomic).
5. Wire autosave: a 60-second interval plus a debounced save after material actions.
6. Implement the corrupt-save path: detect, show the recoverable error, never overwrite silently.
7. Add `navigator.storage.persist()` at startup and the Settings warning when it is not granted.
8. Run the Tests section before marking the task done.

## Tests

- Migration chain: each fixture (every past version) migrates to the current version and passes the `GameState` validator.
- Round trip: `save(state)` then `load()` returns a deep-equal state.
- Atomic checkpoint: simulate a failure between credit and checkpoint; neither is applied.
- Corrupt input (invalid JSON, missing `schemaVersion`, unknown version) produces the recoverable error and leaves the stored record unchanged.
- Future `schemaVersion` (saved by a newer build) is rejected with a clear message, not migrated backwards.
- Autosave timer fires about every 60 seconds; material actions trigger a save.
- Persistence request denied path shows the Settings warning.

## Anti-patterns

- Storing class instances, functions, or Phaser/React objects in the save.
- Resetting the game to defaults when a save fails to parse.
- Writing the offline credit and checkpoint in separate transactions.
- Skipping a migration version or editing an old migration after release.
- Saving money as floating-point numbers.
- Relying only on `pagehide` to save.
- Importing IndexedDB or Dexie from `src/domain/`.

## Done checklist

- [ ] `GameState` is plain, serializable, and has `schemaVersion`.
- [ ] Every version change has a sequential migration and a fixture test.
- [ ] Autosave (60 s) and material-change saves are wired.
- [ ] Offline credit and checkpoint are one transaction.
- [ ] Corrupt saves show a recoverable error and are never silently reset.
- [ ] `navigator.storage.persist()` is requested, with a Settings warning on denial.
- [ ] All tests in the Tests section pass.
