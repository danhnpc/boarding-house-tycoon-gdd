// Application service (tech doc 6): owns the in-memory canonical state,
// routes commands through domain rules, evaluates missions after each change,
// and coordinates persistence. Rendering layers subscribe via a listener.
// Online-time rules (GDD 8.1): foreground ticks accrue income and advance
// online-only timers (candidate/event checks, cooldowns); hidden time is
// caught up through the capped offline integration on the next tick.

import { buildRoom, upgradeRoom } from '../domain/building/rooms';
import { accrueIncome, applyIntegration } from '../domain/economy/rent';
import { integrateOffline } from '../domain/economy/offline';
import { evaluateMissions } from '../domain/mission/missions';
import { acceptCandidate, moveOutTenant, rejectCandidate } from '../domain/tenant/candidates';
import { generateCandidate } from '../domain/tenant/generation';
import { maybeTriggerEvent, resolveEventChoiceId } from '../domain/event/engine';
import { createInitialGameState } from '../domain/state/initial-state';
import type { CommandResult } from '../domain/shared/result';
import type { TimeProvider } from '../domain/shared/time';
import type { Rng } from '../domain/shared/rng';
import type { CandidateId, GameState, RoomId } from '../domain/types';
import type { OnlineProvider } from '../platform/visibility';
import type { SaveGameService } from '../persistence/save-game-service';
import { BootFailure } from './boot-failure';

export type GameCommand =
  | { type: 'BUILD_ROOM'; roomId: RoomId }
  | { type: 'UPGRADE_ROOM'; roomId: RoomId }
  | { type: 'ACCEPT_CANDIDATE'; candidateId: CandidateId; roomId: RoomId }
  | { type: 'REJECT_CANDIDATE'; candidateId: CandidateId }
  | { type: 'MOVE_OUT'; roomId: RoomId }
  | { type: 'RESOLVE_EVENT'; choiceId: string };

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

export interface TickNotice {
  nowMs: number;
  offlineCreditedMinor: number;
  candidateAdded: boolean;
  eventTriggered: boolean;
}

const AUTOSAVE_INTERVAL_MS = 60_000;
/** Foreground gaps longer than this are treated as a slept machine: capped. */
const FOREGROUND_GAP_OFFLINE_THRESHOLD_MS = 30_000;
const ONLINE_CHECK_INTERVAL_MS = 5 * 60_000;

export class GameApp {
  private state: GameState | null = null;
  private dirty = false;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private autosaveTimer: ReturnType<typeof setInterval> | null = null;
  private stateListener: ((state: GameState) => void) | null = null;
  private tickListener: ((notice: TickNotice) => void) | null = null;
  /** False after a hidden tick, so the first visible tick credits via the offline path. */
  private lastTickWasForeground = true;
  /** Serializes saves so an older snapshot can never overwrite a newer one. */
  private saveChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly time: TimeProvider,
    private readonly saves: SaveGameService,
    private readonly online: OnlineProvider,
    private readonly rng: Rng,
  ) {}

  /** Rendering layers subscribe here; discrete state changes only (skill rule 6). */
  onStateChange(listener: (state: GameState) => void): void {
    this.stateListener = listener;
  }

  /** UI subscribes for tick notices (offline toast, event appearance). */
  onTickNotice(listener: (notice: TickNotice) => void): void {
    this.tickListener = listener;
  }

  publish(): void {
    if (this.state !== null) {
      this.stateListener?.(this.state);
    }
  }

  async boot(): Promise<BootResult> {
    const outcome = await this.saves.loadState();
    if (outcome.kind === 'no-save') {
      const state = createInitialGameState(this.time);
      this.state = state;
      await this.saves.saveState(state);
      this.publish();
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
      throw new BootFailure(
        outcome.kind,
        outcome.kind === 'corrupt' ? outcome.note : `schemaVersion ${outcome.version}`,
      );
    }

    // Resume: credit offline income once and move the checkpoint in the same
    // updated snapshot, persisted before anything else runs (ADR 0002).
    const resumed = outcome.state;
    const now = this.time.now();
    const offline = integrateOffline(resumed, now);
    // Checkpoint always advances to the wall-clock resume time: the excess
    // beyond the 8-hour cap is lost per interval, never carried over
    // (GDD 8.1, open-questions B3 default).
    this.state = applyIntegration(resumed, offline, now);
    await this.saves.saveState(this.state);
    this.publish();
    this.startTimers();
    return {
      state: this.state,
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
      case 'RESOLVE_EVENT': {
        const resolved = resolveEventChoiceId(before, command.choiceId, this.time.now());
        result = resolved;
        break;
      }
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
    this.publish();
    void this.saveNow();
    return result;
  }

  /**
   * Online tick. Only runs while the app is foregrounded; hidden time is
   * credited through the capped offline path on the next foreground tick.
   */
  tick(): void {
    if (this.state === null) {
      return;
    }
    // Backgrounded: online-only rules pause; nothing accrues here (GDD 8.1).
    if (!this.online.isForeground()) {
      this.lastTickWasForeground = false;
      return;
    }
    const resumedFromHidden = !this.lastTickWasForeground;
    this.lastTickWasForeground = true;

    const now = this.time.now();
    const state = this.state;
    const gapMs = now - state.time.lastCheckpointAt;
    if (gapMs < 0) {
      // Clock moved backwards during a session: zero income, restart clock.
      this.state = {
        ...state,
        time: { ...state.time, lastCheckpointAt: now },
      };
      this.publish();
      void this.saveNow();
      return;
    }
    const notice: TickNotice = {
      nowMs: now,
      offlineCreditedMinor: 0,
      candidateAdded: false,
      eventTriggered: false,
    };

    if (resumedFromHidden || gapMs >= FOREGROUND_GAP_OFFLINE_THRESHOLD_MS) {
      // Hidden time, or a long foreground gap (machine slept while visible):
      // capped offline catch-up; online timers do not advance.
      const off = integrateOffline(state, now);
      this.state = applyIntegration(state, off, now);
      notice.offlineCreditedMinor = off.creditedMinorUnits;
      this.finishTick(notice, true);
      return;
    }

    // Normal online tick: income + online-time advance + cooldown decrements.
    const accrued = accrueIncome(state, now);
    if (!accrued.ok) {
      return;
    }
    let next = accrued.state;
    const onlineNow = next.time.onlineMs + gapMs;
    next = {
      ...next,
      time: { ...next.time, onlineMs: onlineNow },
      events: decrementCooldowns(next.events, gapMs, onlineNow),
    };

    // 5-active-minute cadence (GDD 5.3, 6.2): candidate check then event roll.
    if (next.time.onlineMs - next.events.lastCheckOnlineMs >= ONLINE_CHECK_INTERVAL_MS) {
      const generated = generateCandidate(next, this.rng);
      notice.candidateAdded = generated !== next;
      next = generated;
      const rolled = maybeTriggerEvent(next, this.rng);
      notice.eventTriggered = rolled.triggered;
      next = {
        ...rolled.state,
        events: { ...rolled.state.events, lastCheckOnlineMs: next.time.onlineMs },
      };
    }

    this.state = next;
    this.finishTick(notice, true);
  }

  private finishTick(notice: TickNotice, dirty: boolean): void {
    this.dirty = dirty || this.dirty;
    this.publish();
    this.tickListener?.(notice);
  }

  saveNow(): Promise<void> {
    if (this.state === null) {
      return Promise.resolve();
    }
    this.dirty = false;
    const snapshot = this.state;
    const run = this.saveChain.then(() => this.saves.saveState(snapshot));
    // A failed write re-arms the dirty flag so autosave retries it; the chain
    // itself keeps going so later saves still run in order.
    this.saveChain = run.catch(() => {
      this.dirty = true;
    });
    // Fire-and-forget callers (autosave, command saves) do not observe `run`;
    // this handler keeps a failed write from surfacing as an unhandled
    // rejection. Awaiting callers still receive the rejection.
    run.catch(() => undefined);
    return run;
  }

  /**
   * DEV/TEST only seam: route an external state patch through the standard
   * mission evaluation + publish + save pipeline. Never used by gameplay code;
   * powers pacing simulation and Playwright assertions.
   */
  applyExternalPatch(fn: (state: GameState) => GameState): void {
    if (this.state === null) {
      return;
    }
    this.state = evaluateMissions(fn(this.state));
    this.dirty = true;
    this.publish();
    void this.saveNow();
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

function decrementCooldowns(
  events: GameState['events'],
  gapMs: number,
  onlineMs: number,
): GameState['events'] {
  const dec = (value: number): number => Math.max(0, value - gapMs);
  const decMap = (map: Record<string, number>): Record<string, number> =>
    Object.fromEntries(
      Object.entries(map).map(([key, raw]) => [key, dec(raw as number)] as const),
    );
  return {
    ...events,
    globalCooldownRemainingOnlineMs: dec(events.globalCooldownRemainingOnlineMs),
    perEventCooldownOnlineMs: decMap(events.perEventCooldownOnlineMs),
    noiseTargetCooldownOnlineMsRecord: decMap(events.noiseTargetCooldownOnlineMsRecord),
    suppressedOnlineMs: decMap(events.suppressedOnlineMs),
    recentEventOnlineTimes: events.recentEventOnlineTimes.filter(
      // Rolling 60-minute-online window trim (GDD 6.2 / tech doc 6.4).
      (stamp) => onlineMs - stamp < 60 * 60_000,
    ),
  };
}
