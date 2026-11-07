import { useEffect, useRef, useState } from 'react';
import { bootPromise, gameApp } from './game-bootstrap';
import { createGame } from '../game/bootstrap/createGame';
import { netRentPerGameDayMinor } from '../domain/economy/rent';
import { installLifecycleFlush, removeLifecycleFlush } from '../platform/lifecycle';
import { useGameStore, useOfflineToastStore, useUiStore } from '../state/game-store';
import { formatCash } from './format/cash';
import { t } from './i18n';
import { MissionCard } from './components/MissionCard';
import { OfflineToast } from './components/OfflineToast';
import { RoomDetailPanel } from './components/RoomDetailPanel';
import { TenantPanel } from './components/TenantPanel';

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameState = useGameStore((s) => s.gameState);
  const selectedRoomId = useUiStore((s) => s.selectedRoomId);
  const [bootStarted, setBootStarted] = useState(false);

  // Boot once; StrictMode remounts reuse the module-level bootPromise.
  useEffect(() => {
    if (bootStarted) {
      return;
    }
    setBootStarted(true);
    void bootPromise
      .then((boot) => {
        if (boot.offline !== null) {
          const creditedCash = Math.floor(boot.offline.creditedMinor / 100);
          if (creditedCash > 0) {
            useOfflineToastStore.getState().setOfflineToast(creditedCash);
          }
        }
      })
      .catch((error: unknown) => console.error('boot failed', error));
    installLifecycleFlush(gameApp, window);
    return () => {
      removeLifecycleFlush(window);
    };
  }, [bootStarted]);

  // StrictMode intentional: it mounts, cleans up and remounts this effect,
  // which is exactly the duplicate-instance risk the spike disproved.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }
    const handle = createGame(host);
    // State flows one-way into the scene; the subscriptions live in this
    // effect's closure and are removed in cleanup (react-phaser-bridge
    // rules 7 and 8). A destroyed game's forwarding is skipped.
    const forwardStore = useGameStore.subscribe((s) => {
      if (handle.game.isRunning && s.gameState !== null) {
        handle.forwardGameState(s.gameState);
      }
    });
    const forwardSelection = useUiStore.subscribe((s) => {
      if (handle.game.isRunning) {
        handle.forwardSelection?.(s.selectedRoomId);
      }
    });
    return () => {
      forwardStore();
      forwardSelection();
      handle.destroy();
    };
  }, []);

  // HUD-only derived read: the rate per Game Day (which is one real hour).
  const netIncomeMinor =
    gameState === null ? 0 : netRentPerGameDayMinor(gameState, Date.now());

  return (
    <div className="app" aria-label="Main Property View">
      <div ref={hostRef} className="game-host" />
      <header className="hud-top">
        <span className="hud-title">{t('app.title')}</span>
        <span className="hud-cash">
          {gameState !== null ? `💵 ${formatCash(gameState.player.cashMinorUnits)}` : ''}
        </span>
        <span className="hud-status">
          {gameState !== null
            ? t('hud.netIncome', { amount: formatCash(netIncomeMinor) })
            : t('hud.loading')}
        </span>
      </header>
      {gameState !== null ? (
        <div className="media-strip">
          <OfflineToast />
          <MissionCard />
        </div>
      ) : null}
      {gameState !== null && selectedRoomId !== null ? (
        <RoomDetailPanel roomId={selectedRoomId} />
      ) : null}
      {gameState !== null && selectedRoomId === null ? <TenantPanel /> : null}
    </div>
  );
}
