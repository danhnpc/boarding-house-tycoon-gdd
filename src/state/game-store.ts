// Minimal UI-side state for the Phase 0 spike. Two slices live here:
// - ui: what only React cares about (selection, world ready).
// - game: a mirror of the canonical GameState snapshot (tech doc 5.1);
//   both React and Phaser read from this single source.

import { create } from 'zustand';
import { gameBridge } from '../game/bridge/gameBridge';

interface UiState {
  worldReady: boolean;
  selectedRoomId: string | null;
}

interface UiActions {
  setWorldReady: () => void;
  selectRoom: (roomId: string) => void;
  clearSelection: () => void;
}

export const useUiStore = create<UiState & UiActions>((set) => ({
  worldReady: false,
  selectedRoomId: null,

  setWorldReady: () => set({ worldReady: true }),
  selectRoom: (roomId) => set({ selectedRoomId: roomId }),
  clearSelection: () => set({ selectedRoomId: null }),
}));

interface GameStoreSlice {
  /** Canonical snapshot; null until the boot service hydrates it. */
  gameState: import('../domain/types').GameState | null;
  bootError: { kind: 'corrupt' | 'newer-version' } | null;
}

interface GameStoreActions {
  setGameState: (state: import('../domain/types').GameState) => void;
  setBootError: (kind: 'corrupt' | 'newer-version') => void;
}

export const useGameStore = create<GameStoreSlice & GameStoreActions>((set) => ({
  gameState: null,
  bootError: null,
  setGameState: (gameState) => set({ gameState }),
  setBootError: (kind) => set({ bootError: { kind } }),
}));

interface OfflineSlice {
  offlineToast: { creditedCash: number; capped: boolean } | null;
  setOfflineToast: (creditedCash: number) => void;
  dismissOfflineToast: () => void;
}

export const useOfflineToastStore = create<OfflineSlice>((set) => ({
  offlineToast: null,
  setOfflineToast: (creditedCash) =>
    set({ offlineToast: { creditedCash, capped: true } }),
  dismissOfflineToast: () => set({ offlineToast: null }),
}));

// Wire the bridge into the store once. Bridge is a singleton; the returned
// unsubscribe is a no-op here because nothing else ever replaces this wiring.
let wired = false;
if (!wired) {
  wired = true;
  gameBridge.onGameEvent((event) => {
    switch (event.type) {
      case 'WORLD_READY':
        useUiStore.getState().setWorldReady();
        break;
      case 'ROOM_SELECTED':
        useUiStore.getState().selectRoom(event.roomId);
        break;
      case 'SELECTION_CLEARED':
        useUiStore.getState().clearSelection();
        break;
    }
  });
}
