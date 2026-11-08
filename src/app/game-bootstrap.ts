// Composition root: one GameApp per app instance (composition/service layer,
// not a domain singleton). Modules import gameApp and wire subscriptions.

import { GameApp } from '../application/game-app';
import { IndexedDbSaveAdapter } from '../persistence/indexeddb-adapter';
import { SaveGameService } from '../persistence/save-game-service';
import { systemTimeProvider } from '../platform/system-time';
import { browserOnlineProvider } from '../platform/visibility';
import { createSeededRng } from '../domain/shared/rng';
import { maybeTriggerEvent } from '../domain/event/engine';
import { useGameStore } from '../state/game-store';
import type { BootResult } from '../application/game-app';

export const saves = new SaveGameService(new IndexedDbSaveAdapter(), () => Date.now());
export const gameApp = new GameApp(
  systemTimeProvider,
  saves,
  browserOnlineProvider,
  createSeededRng(Math.floor(Date.now() % 2_147_483_647) ^ 0x9e3779b9),
);

let zonesProbe: (() => string) | null = null;
let viewProbe: (() => { panX: number; panY: number; yawRad: number } | null) | null = null;

/** React host wires the live scene's view snapshot for dev/e2e reads. */
export function wireViewProbe(
  probe: () => { panX: number; panY: number; yawRad: number } | null,
): void {
  viewProbe = probe;
}

// The canonical state flows into the store on every discrete change; React
// and Phaser both subscribe to the store (react-phaser-bridge rule 8).
gameApp.onStateChange((state) => {
  useGameStore.getState().setGameState(state);
});

// One boot per page load; StrictMode remounts and panel re-renders reuse it.
export const bootPromise: Promise<BootResult> = gameApp.boot();

  // Dev/test hooks (never in production bundles): pacing simulation and
  // Playwright use these instead of simulating seconds-long waits.

if (import.meta.env.DEV) {
  const hooks = {
    grantCash: (wholeCash: number) =>
      gameApp.applyExternalPatch((state) => ({
        ...state,
        player: {
          ...state.player,
          cashMinorUnits: state.player.cashMinorUnits + wholeCash * 100,
        },
      })),
    forceEvent: () =>
      gameApp.applyExternalPatch((state) => {
        const rolled = maybeTriggerEvent(
          {
            ...state,
            events: { ...state.events, globalCooldownRemainingOnlineMs: 0, perEventCooldownOnlineMs: {}, suppressedOnlineMs: {} },
          },
          { next: () => 0 },
        );
        return rolled.triggered ? rolled.state : state;
      }),
    forceCompletion: () =>
      gameApp.applyExternalPatch((state) => ({
        ...state,
        missions: {
          completedMissionNumbers: [1, 2, 3, 4, 5, 6, 7],
          nextMissionNumber: 8,
        },
        progression: { roomCapacity: 6, unlockedMaxLevel: 3 },
        building: {
          roomCapacity: 6,
          rooms: [
            { roomId: 'room-1', level: 3, tenantId: 'tenant-1' },
            { roomId: 'room-2', level: 3, tenantId: 'tenant-candidate-1' },
            { roomId: 'room-3', level: 3, tenantId: 'tenant-es-101' },
            { roomId: 'room-4', level: 3, tenantId: 'tenant-es-102' },
            { roomId: 'room-5', level: 3, tenantId: null },
            { roomId: 'room-6', level: 3, tenantId: null },
          ],
        },
        tenants: [
          { tenantId: 'tenant-1', archetype: 'office_worker' },
          { tenantId: 'tenant-candidate-1', archetype: 'student' },
          { tenantId: 'tenant-es-101', archetype: 'student' },
          { tenantId: 'tenant-es-102', archetype: 'student' },
        ],
      })),
    zones: () => zonesProbe?.() ?? 'not-wired',
    setZoneProbe: (probe: () => string) => {
      zonesProbe = probe;
    },
    viewState: () => viewProbe?.() ?? null,
    setViewProbe: (probe: () => { panX: number; panY: number; yawRad: number } | null) => {
      viewProbe = probe;
    },
    app: gameApp,
  };
  (window as unknown as { __bht?: typeof hooks }).__bht = hooks;
}
