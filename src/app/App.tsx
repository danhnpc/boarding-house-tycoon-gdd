import { useEffect, useRef, useState } from 'react';
import { startOrResume } from '../application/game-service';
import { createGame } from '../game/bootstrap/createGame';
import { systemTimeProvider } from '../platform/system-time';
import { IndexedDbSaveAdapter, requestPersistentStorage } from '../persistence/indexeddb-adapter';
import { SaveGameService } from '../persistence/save-game-service';
import { useGameStore, useUiStore } from '../state/game-store';
import { formatCash } from './format/cash';
import { RoomDetailPanel } from './components/RoomDetailPanel';

const saves = new SaveGameService(new IndexedDbSaveAdapter(), () => Date.now());

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldReady = useUiStore((state) => state.worldReady);
  const selectedRoomId = useUiStore((state) => state.selectedRoomId);
  const gameState = useGameStore((state) => state.gameState);
  const bootError = useGameStore((state) => state.bootError);
  const [bootStarted, setBootStarted] = useState(false);

  // Boot the canonical state once (guard against StrictMode double-mount).
  // Phase 2 replaces this toast canvas with the recoverable error screen.
  useEffect(() => {
    if (bootStarted) {
      return;
    }
    setBootStarted(true);
    void requestPersistentStorage();
    startOrResume(systemTimeProvider, saves)
      .then((boot) => useGameStore.getState().setGameState(boot.state))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'GameUnrecoverableError') {
          const kind = (error as unknown as { kind: 'corrupt' | 'newer-version' }).kind;
          useGameStore.getState().setBootError(kind);
        }
      });
  }, [bootStarted]);

  // StrictMode intentional: it mounts, cleans up and remounts this effect,
  // which is exactly the duplicate-instance risk the spike disproved
  // (tech doc 3.3, 17).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }
    const game = createGame(host);
    return () => {
      game.destroy();
    };
  }, []);

  return (
    <div className="app" aria-label="Main Property View">
      <div ref={hostRef} className="game-host" />
      <header className="hud-top">
        <span className="hud-title">Boarding House Tycoon</span>
        <span className="hud-status">
          {bootError !== null
            ? 'Save error — recoverable screen comes in Phase 2'
            : gameState !== null
              ? `Cash: ${formatCash(gameState.player.cashMinorUnits)}`
              : worldReady
                ? 'World ready'
                : 'Loading…'}
        </span>
      </header>
      {selectedRoomId !== null ? <RoomDetailPanel roomId={selectedRoomId} /> : null}
    </div>
  );
}
