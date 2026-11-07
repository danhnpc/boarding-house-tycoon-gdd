// Minimal UI-side store for the Phase 0 spike. The canonical GameState
// (tech doc 5.1) arrives in Phase 1; this store only mirrors what the
// Phaser world reports plus local UI-only state.

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
