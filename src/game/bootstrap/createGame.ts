// Phase 0 spike bootstrap (tech doc 15, Phase 0).
// Creates exactly one Phaser game instance for a host element. The caller
// (React) owns the lifecycle: create on mount, destroy on unmount cleanup.
// React re-renders must not call this function again.

import Phaser from 'phaser';
import { WorldScene } from '../scenes/WorldScene';

export interface GameHandle {
  game: Phaser.Game;
  destroy: () => void;
}

export function createGame(host: HTMLElement): GameHandle {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    backgroundColor: '#9ed0b1',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoRound: true,
      // Phase 0 policy: authored placeholder shapes rendered by code, not
      // production assets. Stable asset keys arrive with the real pipeline.
      width: '100%',
      height: '100%',
      parent: host,
    },
    scene: [WorldScene],
  });

  return {
    game,
    destroy: () => {
      game.destroy(true, false);
    },
  };
}
