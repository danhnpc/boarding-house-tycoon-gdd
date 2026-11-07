// Application service (tech doc 6): owns the in-memory canonical state,
// routes commands through domain rules, evaluates missions after each change,
// and coordinates persistence. Rendering layers subscribe via a listener.

import { buildRoom, upgradeRoom } from '../domain/building/rooms';
import { accrueIncome } from '../domain/economy/rent';
import { integrateOffline } from '../domain/economy/offline';
import { evaluateMissions } from '../domain/mission/missions';
import { acceptCandidate, moveOutTenant, rejectCandidate } from '../domain/tenant/candidates';
import { createInitialGameState } from '../domain/state/initial-state';
import type { CommandResult } from '../domain/shared/result';
import type { TimeProvider } from '../domain/shared/time';import type { CandidateId, GameState, RoomId } from '../domain/types';
import type { SaveGameService } from '../persistence/save-game-service';

export type GameCommand =
  | { type: 'BUILD_ROOM'; roomId: RoomId }
  | { type: 'UPGRADE_ROOM'; roomId: RoomId }
  | { type: 'ACCEPT_CANDIDATE'; candidateId: CandidateId; roomId: RoomId }
  | { type: 'REJECT_CANDIDATE'; candidateId: CandidateId }
  | { type: 'MOVE_OUT'; roomId: RoomId };

export interface OfflineSummary {
  creditedMinor: number;
  cappedAt8Hours: boolean;
  clockMovedBackwards: boolean;
  elapsedMs: number;
}

export interface BootResult {
  state: GameState;
  created: boolean;
  offline: OfflineSummary | null;
}

const AUTOSAVE_INTERVAL_MS = 60_000;

export class GameApp {
  private state: GameState | null = null;
  private dirty = false;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private autosaveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly time: TimeProvider,
    private readonly saves: SaveGameService,
  ) {}

  async boot(): Promise<BootResult> {
    const outcome = await this.saves.loadState();
    if (outcome.kind === 'no-save') {
      const state = createInitialGameState(this.time);
      this.state = state;
      await this.saves.saveState(state);
      this.startTimers();
      return {
        state,
        created: true,
        offline: null,
      };
    }
    if (outcome.kind !== 'ok') {
      // Corrupt ('corrupt') or newer build ('newer-version'): the raw record
      // stays on disk; the UI must present the recoverable path, never reset.
      throw new Error(
        outcome.kind === 'corrupt'
          ? `SAVE_CORRUPT: ${outcome.note}`
          : `SAVE_NEWER_VERSION: ${outcome.version}`,
      );
    }

    // Resume: credit offline income once and move the checkpoint in the same
    // updated snapshot, persisted before anything else runs (ADR 0002).
    const resumed = outcome.state;
    const offline = integrateOffline(resumed, this.time.now());
    let state: GameState;
    if (offline.creditedMinorUnits > 0) {
      state = {
        ...resumed,
        player: {
          ...resumed.player,
          cashMinorUnits: resumed.player.cashMinorUnits + offline.creditedMinorUnits,
          lifetimeGrossIncomeMinorUnits:
            resumed.player.lifetimeGrossIncomeMinorUnits +
            Math.floor(offline.grossFloatMinorUnits),
        },
        time: {
          // Checkpoint always advances to the wall-clock resume time, never to
          // the credited window's end: the excess beyond the 8-hour cap is
          // lost per interval, it must not be credited on the next resume
          // (GDD 8.1, open-questions B3 default).
          lastCheckpointAt: this.time.now(),
          incomeRemainderMinorUnits: offline.remainderMinorUnits,
        },
      };
    } else {
      // Backwards clock or zero elapsed: checkpoint resets to now, no income.
      state = {
        ...resumed,
        time: {
          lastCheckpointAt: this.time.now(),
          incomeRemainderMinorUnits: offline.remainderMinorUnits,
        },
      };
    }
    this.state = state;
    await this.saves.saveState(state);
    this.startTimers();
    return {
      state,
      created: false,
      offline: {
        creditedMinor: offline.creditedMinorUnits,
        cappedAt8Hours: offline.cappedAt8Hours,
        clockMovedBackwards: offline.clockMovedBackwards,
        elapsedMs: offline.toMs - offline.fromMs,
      },
    };
  }
  getState(): GameState {
    if (this.state === null) {
      throw new Error('GameApp used before boot');
    }
    return this.state;
  }

  execute(command: GameCommand): CommandResult<GameState> {
    if (this.state === null) {
      return { ok: false, reason: 'APP_NOT_BOOTED' };
    }
    const before = this.state;
    let result: CommandResult<GameState>;
    switch (command.type) {
      case 'BUILD_ROOM':
        result = buildRoom(before, command.roomId);
        break;
      case 'UPGRADE_ROOM':
        result = upgradeRoom(before, command.roomId);
        break;
      case 'ACCEPT_CANDIDATE':
        result = acceptCandidate(before, command.candidateId, command.roomId);
        break;
      case 'REJECT_CANDIDATE':
        result = rejectCandidate(before, command.candidateId);
        break;
      case 'MOVE_OUT':
        result = moveOutTenant(before, command.roomId);
        break;
    }
    if (!result.ok) {
      return result;
    }
    // Mission progress derives from state transitions, not UI events
    // (tech doc 6.5): a failed command never progresses a mission.
    this.state = evaluateMissions(result.state);
    this.dirty = true;
    void this.saveNow();
    return result;
  }

  /** Online tick: same integration as offline, short interval, no events. */
  tick(): void {
    if (this.state === null) {
      return;
    }
    const result = accrueIncome(this.state, this.time.now());
    if (result.ok) {
      this.state = result.state;
      this.dirty = true;
    } else {
      // Backwards-moving device clock: checkpoint resets to now, zero income
      // (GDD 8.3). No mission-eligible evidence existed anyway.
      this.state = {
        ...this.state,
        time: { lastCheckpointAt: this.time.now(), incomeRemainderMinorUnits: 0 },
      };
    }
  }

  async saveNow(): Promise<void> {
    if (this.state === null) {
      return;
    }
    this.dirty = false;
    await this.saves.saveState(this.state);
  }

  startTimers(): void {
    if (this.tickTimer === null) {
      this.tickTimer = setInterval(() => this.tick(), 1_000);
    }
    if (this.autosaveTimer === null) {
      this.autosaveTimer = setInterval(() => {
        if (this.dirty) {
          void this.saveNow();
        }
      }, AUTOSAVE_INTERVAL_MS);
    }
  }

  stopTimers(): void {
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.autosaveTimer !== null) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }
}
