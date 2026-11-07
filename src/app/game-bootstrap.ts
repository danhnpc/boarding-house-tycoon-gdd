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
    app: gameApp,
  };
  (window as unknown as { __bht?: typeof hooks }).__bht = hooks;
}
