import { useEffect, useRef } from 'react';
import { createGame } from '../game/bootstrap/createGame';
import { useUiStore } from '../state/game-store';
import { RoomDetailPanel } from './components/RoomDetailPanel';

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldReady = useUiStore((state) => state.worldReady);
  const selectedRoomId = useUiStore((state) => state.selectedRoomId);

  // StrictMode intentional: it mounts, cleans up and remounts this effect,
  // which is exactly the duplicate-instance risk the spike must disprove
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
          {worldReady ? 'World ready' : 'Loading…'}
        </span>
      </header>
      {selectedRoomId !== null ? <RoomDetailPanel roomId={selectedRoomId} /> : null}
    </div>
  );
}
