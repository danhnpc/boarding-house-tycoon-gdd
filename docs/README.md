# Boarding House Tycoon — Documentation Index

This folder contains the MVP's product, engineering, decision, and art documentation.

## Source-of-truth map

| Document | Owns | Does not own |
|---|---|---|
| [`gdd/game-design-plan.md`](gdd/game-design-plan.md) | Gameplay rules, economy baseline, tenant/event/mission behavior, progression, MVP scope | Framework choices and code architecture |
| [`planning/technical-architecture.md`](planning/technical-architecture.md) | Technology stack, module boundaries, runtime architecture, persistence design, testing and implementation phases | Gameplay balance values |
| [`decisions/0001-react-phaser-capacitor.md`](decisions/0001-react-phaser-capacitor.md) | Rationale and consequences of the selected client stack | Detailed gameplay rules |
| [`decisions/0002-local-first-save.md`](decisions/0002-local-first-save.md) | Rationale, limits, and revisit triggers for local-first save | Future backend design beyond the MVP boundary |
| [`decisions/0003-web-first-responsive-delivery.md`](decisions/0003-web-first-responsive-delivery.md) | Delivery target: one responsive web build; store wrapper deferred | Gameplay rules and balance |
| [`art/visual-direction.md`](art/visual-direction.md) | Visual style, consistency rules, asset naming/production checklist | Final production art files or gameplay rules |

## Change-control rules

1. Change gameplay behavior or balance in the GDD first, then update code/configuration.
2. Change architecture or implementation boundaries in the Technical Architecture Plan.
3. Record material technology/persistence choices in the relevant ADR.
4. Update visual rules and the asset checklist in the Art Direction document.
5. Keep balance values in one typed runtime configuration source; reconcile that source with the GDD before a release.
6. Treat files under `art/assets/` as concept references only. Production assets should live in the game's runtime asset directory after approval.

## Recommended reading order

1. GDD — understand what the player experiences.
2. Technical Architecture — understand how the client is structured.
3. ADR 0001, ADR 0002, and ADR 0003 — understand why the key architecture, persistence, and delivery choices were made.
4. Visual Direction — understand the production art target and asset handoff rules.
