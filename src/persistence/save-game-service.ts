// Save / load orchestration (ADR 0002). Corrupt or future-version saves are
// never silently replaced — the caller gets a typed outcome and decides.

import type { GameState } from '../domain/types';
import { hydrateSave, type HydrateOutcome, type SaveRecord } from './schema';
import type { SaveAdapter } from './indexeddb-adapter';

export class SaveGameService {
  constructor(
    private readonly adapter: SaveAdapter,
    private readonly now: () => number,
  ) {}

  /** Persist a full snapshot. Money and timestamps are already integers. */
  async saveState(state: GameState): Promise<void> {
    const record: SaveRecord = {
      schemaVersion: state.schemaVersion,
      savedAt: this.now(),
      state,
    };
    await this.adapter.write(record);
  }

  /**
   * Load the current save. Outcomes:
   * - 'ok' → validated state at the current schema version
   * - 'no-save' → fresh install
   * - 'corrupt' → raw record is preserved for diagnostics; player decides
   * - 'newer-version' → save written by a newer build; never migrate backwards
   */
  async loadState(): Promise<HydrateOutcome> {
    const raw = await this.adapter.read();
    if (raw === null) {
      return { kind: 'no-save' };
    }
    return hydrateSave(raw);
  }
}
