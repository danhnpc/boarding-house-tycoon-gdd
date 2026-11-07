// Typed bridge between Phaser and React (tech doc 8.2).
// Only meaningful state changes cross this bridge: never Phaser object
// references, never per-frame values.

export type GameToUiEvent =
  | { type: 'WORLD_READY' }
  | { type: 'ROOM_SELECTED'; roomId: string }
  | { type: 'SELECTION_CLEARED' };

export type UiToGameCommand =
  | { type: 'SELECT_ROOM'; roomId: string }
  | { type: 'CLEAR_SELECTION' };

type GameToUiHandler = (event: GameToUiEvent) => void;
type UiToGameHandler = (command: UiToGameCommand) => void;

export class GameBridge {
  private gameToUiListeners = new Set<GameToUiHandler>();
  private uiToGameListeners = new Set<UiToGameHandler>();

  onGameEvent(listener: GameToUiHandler): () => void {
    this.gameToUiListeners.add(listener);
    return () => {
      this.gameToUiListeners.delete(listener);
    };
  }

  onGameCommand(listener: UiToGameHandler): () => void {
    this.uiToGameListeners.add(listener);
    return () => {
      this.uiToGameListeners.delete(listener);
    };
  }

  emitGameEvent(event: GameToUiEvent): void {
    for (const listener of this.gameToUiListeners) {
      listener(event);
    }
  }

  sendCommand(command: UiToGameCommand): void {
    for (const listener of this.uiToGameListeners) {
      listener(command);
    }
  }
}

// One instance per app. Scenes attach/detach their own listeners on
// create/shutdown so React remounts (StrictMode, HMR) cannot accumulate them.
export const gameBridge = new GameBridge();
