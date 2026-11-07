// Phase 0/2 bootstrap (tech doc 15). Creates exactly one Phaser game per host;
// the caller (React) owns the lifecycle: create on mount, destroy on unmount.
// State flows one-way: React forwards canonical snapshots into the scene; the
// scene never reads global stores (react-phaser-bridge rules 7–8).

import Phaser from 'phaser';
import { WorldScene } from '../scenes/WorldScene';
import type { GameState } from '../../domain/types';

export interface GameHandle {
  game: Phaser.Game;
  forwardGameState: (state: GameState) => void;
  forwardSelection: (roomId: string | null) => void;
  destroy: () => void;
}

export function createGame(host: HTMLElement): GameHandle {
  let lastState: GameState | null = null;
  let lastSelection: string | null = null;

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    backgroundColor: '#9ed0b1',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoRound: true,
      width: '100%',
      height: '100%',
      parent: host,
    },
    scene: [WorldScene],
  });

  const getScene = (): WorldScene | null => {
    const scene = game.scene?.getScene ? game.scene.getScene('WorldScene') : null;
    return (scene as WorldScene | null | undefined) ?? null;
  };

  const apply = () => {
    const scene = getScene();
    if (scene === null) {
      return;
    }
    if (lastState !== null) {
      scene.updateFromState(lastState);
    }
    scene.updateSelection(lastSelection);
  };

  // The world may not exist yet on the first forwarded snapshot (Phaser boot
  // is asynchronous); re-apply the last known state as soon as it is ready.
  game.events.once('ready', apply);
  // Phaser may emit 'ready' before the listener attaches; a fast fallback tick
  // covers that race without spinning a permanent timer.
  const retryToken = window.setTimeout(apply, 250);

  return {
    game,
    forwardGameState: (state) => {
      lastState = state;
      apply();
    },
    forwardSelection: (roomId) => {
      lastSelection = roomId;
      apply();
    },
    destroy: () => {
      window.clearTimeout(retryToken);
      game.destroy(true, false);
    },
  };
}
