# ADR 0002: Use Local-First Save Data for the MVP

- **Status:** Accepted for the MVP baseline; delivery target set by [ADR 0003](0003-web-first-responsive-delivery.md)
- **Decision date:** 2026-11-07
- **Decision owners:** Product / Engineering
- **Related documents:**
  - [`../gdd/game-design-plan.md`](../gdd/game-design-plan.md)
  - [`../planning/technical-architecture.md`](../planning/technical-architecture.md)
  - [`0001-react-phaser-capacitor.md`](0001-react-phaser-capacitor.md)

## Context

The MVP is a single-player idle tycoon focused on one locally managed boarding-house property, up to six rooms, three room levels, three tenant archetypes, five event templates, one main mission chain, and offline income capped at eight hours.

The MVP does not include user accounts, cross-device progression, multiplayer, leaderboards, competitive rewards, paid currency, ads, in-app purchases, remote offers, or server-issued entitlements. No current gameplay feature requires a shared authoritative state or a backend to make the core loop function.

The game must still preserve progress across browser reloads and app restarts, recover from app background/termination, and calculate offline income without crediting the same interval twice.

## Decision

Use a **local-first, single-device save** for the MVP. Do not build an ASP.NET Core backend or cloud account system as a prerequisite for first playable or MVP completion.

### Storage and save model

- Use browser **IndexedDB** as the local persistence store.
- Keep persistence behind a typed adapter/service so the domain and UI do not directly access IndexedDB.
- Use one canonical, serializable `GameState` as the saved gameplay snapshot.
- Include `schemaVersion` and stable IDs for rooms, tenants, candidates, events, and missions.
- Support explicit migrations when the save schema changes.
- Do not persist Phaser objects, DOM nodes, React component instances, functions, or runtime-only references.
- The MVP needs one save slot. Multiple profiles/slots are deferred unless a product requirement appears.

### Save timing

Persist after every material state change, including:

- Building a room.
- Upgrading a room.
- Accepting or rejecting a tenant candidate.
- Resolving an event.
- Claiming a mission reward or unlocking a milestone.
- Applying offline income and advancing the time checkpoint.

Also perform an autosave at least every 60 seconds while active, and attempt a save when the application is backgrounded or closed through a supported lifecycle hook. Lifecycle hooks are best-effort; correctness must not depend only on a final unload callback.

### Offline income integrity

The persisted checkpoint and the offline reward must be committed atomically:

1. Read the current save and its last successfully credited checkpoint.
2. Calculate eligible elapsed time, clamped to a maximum of eight hours and never below zero.
3. Integrate rent across the interval, including any temporary event effects that expire during that interval.
4. Preserve fractional income remainder; do not round down independently on every tick.
5. Apply the income and update the credited checkpoint in the same IndexedDB transaction.
6. If the transaction fails, do not advance the checkpoint independently of the reward. Retry/recover from the previously persisted state.

This protects against duplicate offline credit caused by reloads, app crashes, or repeated resume callbacks. The offline calculation must use the GDD's game-time and operating-cost rules. Temporary effects that the GDD says continue offline must expire according to their timestamps and affect only the interval during which they are active.

### Clock and trust model

The MVP uses the device wall clock for elapsed time. Clamp negative elapsed time to zero and apply the eight-hour cap. This is a practical local-only policy, not an anti-cheat guarantee. A user with device/debug access can modify local save data or the system clock; that is acceptable for a non-competitive MVP with no purchases or valuable server-issued rewards.

## Why no backend is required yet

A backend would add account/authentication, API hosting, operational monitoring, deployment, security, and synchronization work without enabling a required MVP feature. The current game can be played on one device, and all required state can be stored locally.

The architecture must nevertheless preserve seams for future services:

- A `SaveRepository` / persistence interface separates save consumers from IndexedDB.
- A `TimeProvider` abstraction isolates wall-clock reads.
- The canonical `GameState` is serializable and versioned.
- Domain rules are independent of IndexedDB and HTTP.

These seams allow a future cloud-save or server-authoritative service to be introduced without moving the game renderer or rewriting the core domain model.

## Alternatives considered

### Backend and cloud save from day one

**Not selected.** It would add accounts, APIs, deployment, authentication, conflict handling, and ongoing operational cost before the MVP has validated retention or cross-device demand.

### LocalStorage

**Not selected.** The game state is structured and will contain arrays and nested entities. IndexedDB is a better fit for structured asynchronous storage and transactional updates.

### Save only on app close

**Not selected.** Browser/mobile lifecycle callbacks are not guaranteed to run during force quit, OS termination, crashes, or device shutdown. Material-change saves and periodic autosave reduce loss risk.

### Local save plus immediate cloud sync

**Deferred.** There is no MVP account or cross-device requirement. Introducing sync would require conflict resolution and a more complex trust model.

## Consequences

### Positive

- Faster MVP implementation and fewer infrastructure dependencies.
- The game remains playable offline after the initial application assets are available.
- Save/load and offline calculations can be tested locally and deterministically.
- No backend deployment or account lifecycle blocks the first playable build.

### Negative / limitations

- Progress is device/browser-local and is not automatically shared across devices.
- Clearing browser/app data can remove the save unless an export/backup feature is added later.
- Safari (iOS) may delete script-writable storage, including IndexedDB, after a long period without visits (Intelligent Tracking Prevention). Players who never add the game to the Home Screen are most exposed. Request `navigator.storage.persist()`, warn in Settings, and recommend a Home Screen install (see ADR 0003).
- Local saves and Cash are editable by a technically capable player.
- Device-clock manipulation can affect offline time within the eight-hour cap.
- No remote recovery is possible if local storage is lost.

These limitations are accepted for the MVP and must not be described as secure, tamper-proof, or cloud-backed.

## Revisit when

A backend or cloud save should be reconsidered when the product introduces any of the following:

- User accounts or cross-device progression.
- Cloud backup/restore or support-driven save recovery.
- In-app purchases, paid currency, or server-issued entitlements.
- Leaderboards, competitive rankings, shared economies, or rewards where save tampering matters.
- Remote events/offers or remote configuration that must be authoritative.
- A requirement for server-authoritative time or progression validation.

At that point, define ownership of each field, sync/conflict behavior, authentication, anti-tamper boundaries, migration from local saves, and data retention before implementation.

## Implementation checklist

- [ ] IndexedDB adapter and save repository are implemented.
- [ ] Save schema has an explicit version.
- [ ] A migration path is tested with at least one prior-schema fixture.
- [ ] Material state changes trigger persistence.
- [ ] Autosave runs at least every 60 seconds while active.
- [ ] Background lifecycle attempts a checkpoint save.
- [ ] Offline income and checkpoint update share one transaction.
- [ ] Fractional income remainder is preserved.
- [ ] Temporary event effects are integrated across their actual active intervals.
- [ ] Repeated resume/load cannot credit the same interval twice.
- [ ] Corrupt or unavailable saves produce a recoverable user-facing error; they do not silently reset without notice.
- [ ] `navigator.storage.persist()` is requested and its result is shown in Settings.
- [ ] iOS Safari storage warning and Home Screen recommendation are shown.
