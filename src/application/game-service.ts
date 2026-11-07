// Application service: start a new game or resume the existing save
// (tech doc 6; the Phase 2 loop command layer grows out of this file).

import { createInitialGameState } from '../domain/state/initial-state';
import type { TimeProvider } from '../domain/shared/time';
import type { GameState } from '../domain/types';
import type { SaveGameService } from '../persistence/save-game-service';

export interface GameBootResult {
  state: GameState;
  created: boolean;
}

export class GameUnrecoverableError extends Error {
  readonly kind: 'corrupt' | 'newer-version';
  constructor(kind: 'corrupt' | 'newer-version', detail: string) {
    super(detail);
    this.name = 'GameUnrecoverableError';
    this.kind = kind;
  }
}

/**
 * Resume the persisted state, or create and immediately persist a fresh game.
 * A corrupt or newer save raises GameUnrecoverableError — a recoverable error
 * screen (Phase 2, skill rule 8) must handle it; the stored save is preserved.
 */
export async function startOrResume(
  time: TimeProvider,
  saves: SaveGameService,
): Promise<GameBootResult> {
  const outcome = await saves.loadState();
  if (outcome.kind === 'ok') {
    return { state: outcome.state, created: false };
  }
  if (outcome.kind === 'no-save') {
    const state = createInitialGameState(time);
    await saves.saveState(state);
    return { state, created: true };
  }
  if (outcome.kind === 'corrupt') {
    throw new GameUnrecoverableError('corrupt', outcome.note);
  }
  throw new GameUnrecoverableError(
    'newer-version',
    `save schemaVersion ${outcome.version} is newer than this build`,
  );
}
