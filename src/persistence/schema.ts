// Save envelope, validation, and the sequential migration chain (ADR 0002,
// local-first-save-migration skill). Every schema change adds `vN -> vN+1`
// here (and stamps schemaVersion = N+1 in the output) plus a fixture test.

import { SCHEMA_VERSION } from '../domain/config/balance';
import type { GameState, RoomLevel } from '../domain/types';

export { SCHEMA_VERSION };

export interface SaveRecord {
  schemaVersion: number;
  savedAt: number;
  state: GameState;
}

export type HydrateOutcome =
  | { kind: 'ok'; record: SaveRecord; state: GameState }
  | { kind: 'no-save' }
  | { kind: 'corrupt'; note: string }
  | { kind: 'newer-version'; version: number };

const LEVELS: readonly number[] = [1, 2, 3];
const ARCHETYPES: readonly string[] = ['student', 'office_worker', 'messy_tenant'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isLevel(value: unknown): value is RoomLevel {
  return typeof value === 'number' && LEVELS.includes(value);
}

export function validateCoreState(raw: unknown, version: number): raw is Record<string, unknown> {
  if (!isRecord(raw) || raw.schemaVersion !== version) {
    return false;
  }
  const { player, building, tenants, candidates, missions, progression, modifiers, time } = raw;
  if (!isRecord(player) || !isInteger(player.cashMinorUnits)) {
    return false;
  }
  if (!isRecord(building) || !Array.isArray(building.rooms)) {
    return false;
  }
  for (const room of building.rooms) {
    if (
      !isRecord(room) ||
      typeof room.roomId !== 'string' ||
      !isLevel(room.level) ||
      !(room.tenantId === null || typeof room.tenantId === 'string')
    ) {
      return false;
    }
  }
  if (!Array.isArray(tenants) || !Array.isArray(candidates)) {
    return false;
  }
  for (const entry of [...tenants, ...candidates]) {
    const tenantId = entry.tenantId;
    const candidateId = entry.candidateId;
    const archetype = entry.archetype;
    if (
      !(typeof tenantId === 'string' || typeof candidateId === 'string') ||
      typeof archetype !== 'string' ||
      !ARCHETYPES.includes(archetype)
    ) {
      return false;
    }
  }
  if (!isRecord(missions) || !Array.isArray(missions.completedMissionNumbers)) {
    return false;
  }
  if (
    !isRecord(progression) ||
    !isInteger(progression.roomCapacity) ||
    !isLevel(progression.unlockedMaxLevel)
  ) {
    return false;
  }
  if (!isRecord(modifiers) || !Array.isArray(modifiers.incomeReductions)) {
    return false;
  }
  if (!isRecord(time) || !isInteger(time.lastCheckpointAt)) {
    return false;
  }
  return true;
}

/** Full validation of a current-version state after migrations run. */
export function validateState(raw: unknown): raw is GameState {
  if (!validateCoreState(raw, SCHEMA_VERSION)) {
    return false;
  }
  const state = raw as unknown as GameState;
  if (!isInteger(state.time.onlineMs as unknown)) {
    return false;
  }
  if (typeof state.time.grossRemainderMinorUnits !== 'number') {
    return false;
  }
  const { events } = state as { events?: unknown };
  if (!isRecord(events)) {
    return false;
  }
  if (!Array.isArray(events.recentEventOnlineTimes)) {
    return false;
  }
  if (
    !isRecord(events.perEventCooldownOnlineMs) ||
    !isRecord(events.noiseTargetCooldownOnlineMsRecord) ||
    !isRecord(events.suppressedOnlineMs)
  ) {
    return false;
  }
  if (
    !(events.activeEventId === null || typeof events.activeEventId === 'string') ||
    !(events.eventPayload === null || isRecord(events.eventPayload))
  ) {
    return false;
  }
  if (
    !isInteger(events.globalCooldownRemainingOnlineMs as unknown) ||
    !isInteger(events.lastCheckOnlineMs as unknown)
  ) {
    return false;
  }
  return true;
}

/**
 * Sequential migrations. Each entry upgrades GameState shape one version.
 * Never skip steps; never edit a migration after release — append a new one.
 */
const MIGRATIONS: Record<number, (state: Record<string, unknown>) => Record<string, unknown>> = {
  // v1 → v2: event system fields + online-time clock (Phase 3).
  1: (state) => ({
    ...state,
    schemaVersion: 2,
    events: {
      activeEventId: null,
      eventPayload: null,
      globalCooldownRemainingOnlineMs: 0,
      perEventCooldownOnlineMs: {},
      recentEventOnlineTimes: [],
      noiseTargetCooldownOnlineMsRecord: {},
      suppressedOnlineMs: {},
      lastCheckOnlineMs: 0,
    },
    time: {
      ...(state.time as Record<string, unknown>),
      onlineMs: 0,
    },
  }),
  // v2 → v3: fractional gross-income remainder (income accounting fix).
  2: (state) => ({
    ...state,
    schemaVersion: 3,
    time: {
      ...(state.time as Record<string, unknown>),
      grossRemainderMinorUnits: 0,
    },
  }),
};

/**
 * Hydrate a parsed save envelope into a validated current-version state.
 * Garbage input → 'corrupt'. A save written by a newer build → 'newer-version'
 * (rejected, never migrated backwards). The stored record is never touched.
 */
export function hydrateSave(raw: unknown): HydrateOutcome {
  if (!isRecord(raw)) {
    return { kind: 'corrupt', note: 'envelope is not an object' };
  }
  const version = raw.schemaVersion;
  if (version !== undefined && typeof version === 'number' && version > SCHEMA_VERSION) {
    return { kind: 'newer-version', version };
  }
  if (!isInteger(version) || version < 1) {
    return { kind: 'corrupt', note: 'missing or invalid schemaVersion' };
  }
  let state: unknown = raw.state;
  for (let v = version; v < SCHEMA_VERSION; v++) {
    const migration = MIGRATIONS[v];
    if (migration === undefined) {
      return { kind: 'corrupt', note: `missing migration from version ${v}` };
    }
    if (!validateCoreState(state, v)) {
      return { kind: 'corrupt', note: `state invalid at version ${v}` };
    }
    state = migration(state);
  }
  if (!validateState(state)) {
    return { kind: 'corrupt', note: 'state failed validation' };
  }
  const record: SaveRecord = {
    schemaVersion: SCHEMA_VERSION,
    savedAt: isInteger(raw.savedAt) ? raw.savedAt : 0,
    state: state as GameState,
  };
  return { kind: 'ok', record, state: record.state };
}
