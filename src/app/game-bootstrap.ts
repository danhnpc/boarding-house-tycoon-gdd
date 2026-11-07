// Composition root: one GameApp per app instance (composition/service layer,
// not a domain singleton). Modules import gameApp and wire subscriptions.

import { GameApp } from '../application/game-app';
import { IndexedDbSaveAdapter } from '../persistence/indexeddb-adapter';
import { SaveGameService } from '../persistence/save-game-service';
import { systemTimeProvider } from '../platform/system-time';
import { useGameStore } from '../state/game-store';
import type { BootResult } from '../application/game-app';

export const saves = new SaveGameService(new IndexedDbSaveAdapter(), () => Date.now());
export const gameApp = new GameApp(systemTimeProvider, saves);

// The canonical state flows into the store on every discrete change; React
// and Phaser both subscribe to the store (react-phaser-bridge rule 8).
gameApp.onStateChange((state) => {
  useGameStore.getState().setGameState(state);
});

// One boot per page load; StrictMode remounts and panel re-renders reuse it.
export const bootPromise: Promise<BootResult> = gameApp.boot();
