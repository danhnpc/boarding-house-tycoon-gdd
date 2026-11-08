// Event system (GDD 6): online-only checks, cooldowns/caps in online-time,
// selection weighted (Hallway clutter ×2 while a Messy Tenant occupies),
// deterministic outcomes from a data-driven catalog.

import {
  EVENT_BASE_CHANCE,
  EVENT_COST_MINOR,
  EVENT_GLOBAL_COOLDOWN_ONLINE_MS,
  EVENT_MAX_PER_ROLLING_WINDOW,
  EVENT_PER_EVENT_COOLDOWN_ONLINE_MS,
  EVENT_ROLLING_WINDOW_ONLINE_MS,
  ONE_GAME_DAY_MS,
} from '../config/balance';
import type { Rng } from '../shared/rng';
import { applyProgression } from '../progression/milestones';
import type { GameState, TenantId } from '../types';

export type EventType =
  | 'utility-outage'
  | 'hallway-clutter'
  | 'water-tap'
  | 'noise-complaint'
  | 'group-of-students';

export interface EventDefinition {
  type: EventType;
  /** Eligibility from current state. */
  isEligible(state: GameState): boolean;
  /** Double weight while at least one Messy Tenant occupies (GDD 6.3 step 4). */
  weight(state: GameState): number;
  /** Target selection (noise picks one occupied tenant uniformly). */
  pickTarget?(state: GameState, rng: Rng): TenantId | undefined;
}

const CATALOG: EventDefinition[] = [
  {
    type: 'utility-outage',
    isEligible: (state) => state.building.rooms.filter((r) => r.tenantId !== null).length >= 2,
    weight: () => 1,
  },
  {
    type: 'hallway-clutter',
    isEligible: (state) => state.building.rooms.some((r) => r.tenantId !== null),
    weight: (state) =>
      state.tenants.some((t) => t.archetype === 'messy_tenant') ? 2 : 1,
  },
  {
    type: 'water-tap',
    isEligible: (state) => state.building.rooms.some((r) => r.tenantId !== null),
    weight: () => 1,
  },
  {
    type: 'noise-complaint',
    isEligible: (state) =>
      state.building.rooms.some(
        (r) =>
          r.tenantId !== null &&
          (state.events.noiseTargetCooldownOnlineMsRecord[r.tenantId] ?? 0) <= 0 &&
          (state.events.suppressedOnlineMs['noise-complaint'] ?? 0) <= 0 &&
          !isTenantNoiseSuppressed(state, r.tenantId),
      ),
    weight: () => 1,
    pickTarget: (state, rng) => {
      const candidates = state.building.rooms
        .map((r) => r.tenantId)
        .filter((tenantId): tenantId is TenantId => tenantId !== null)
        .filter((tenantId) => !isTenantNoiseSuppressed(state, tenantId));
      if (candidates.length === 0) {
        return undefined;
      }
      return candidates[Math.floor(rng.next() * candidates.length)];
    },
  },
  {
    type: 'group-of-students',
    isEligible: (state) =>
      state.building.rooms.filter((r) => r.tenantId === null && r.level === 1).length >= 2,
    weight: () => 1,
  },
];

function isTenantNoiseSuppressed(state: GameState, tenantId: TenantId): boolean {
  return (state.events.noiseTargetCooldownOnlineMsRecord[tenantId] ?? 0) > 0;
}

/** Per-event online cooldown (GDD 6.2 table). */
export function perEventCooldown(): number {
  return EVENT_PER_EVENT_COOLDOWN_ONLINE_MS;
}

export function selectEligibleEvent(state: GameState, rng: Rng): EventDefinition | null {
  const eligible = CATALOG.filter((definition) => {
    if (state.events.activeEventId !== null) {
      return false;
    }
    if ((state.events.suppressedOnlineMs[definition.type] ?? 0) > 0) {
      return false;
    }
    if ((state.events.perEventCooldownOnlineMs[definition.type] ?? 0) > 0) {
      return false;
    }
    return definition.isEligible(state);
  });
  if (eligible.length === 0) {
    return null;
  }
  const total = eligible.reduce((sum, def) => sum + def.weight(state), 0);
  let roll = rng.next() * total;
  for (const def of eligible) {
    roll -= def.weight(state);
    if (roll < 0) {
      return def;
    }
  }
  return eligible[eligible.length - 1];
}

export interface EventCheckResult {
  state: GameState;
  triggered: boolean;
}

/**
 * Roll the 25% base chance and select an event when one is possible
 * (GDD 6.3 steps 2–5). Events never change rent outcomes here: the outcome
 * applies only when the player resolves a choice.
 */
export function maybeTriggerEvent(state: GameState, rng: Rng): EventCheckResult {
  const { events } = state;
  if (
    events.activeEventId !== null ||
    events.globalCooldownRemainingOnlineMs > 0 ||
    events.recentEventOnlineTimes.filter(
      (stamp) => stamp > onlineNow(state) - EVENT_ROLLING_WINDOW_ONLINE_MS,
    ).length >= EVENT_MAX_PER_ROLLING_WINDOW
  ) {
    return { state, triggered: false };
  }
  if (rng.next() >= EVENT_BASE_CHANCE) {
    return { state, triggered: false };
  }
  const definition = selectEligibleEvent(state, rng);
  if (definition === null || (definition.type === 'noise-complaint' && definition.pickTarget === undefined)) {
    return { state, triggered: false };
  }
  const target = definition.pickTarget !== undefined ? definition.pickTarget(state, rng) : undefined;
  if (definition.type === 'noise-complaint' && target === undefined) {
    return { state, triggered: false };
  }
  return {
    state: {
      ...state,
      events: {
        ...events,
        activeEventId: definition.type,
        eventPayload: target ? { targetTenantId: target } : null,
      },
    },
    triggered: true,
  };
}

function onlineNow(state: GameState): number {
  return state.time.onlineMs;
}

/**
 * Deterministic outcome application (GDD 6.4). The player picks A or B; costs
 * are paid, modifiers/tenants applied as plain data, and the event closes with
 * its cooldown updates. Choice ids match the catalog-and-locale table.
 */
export function resolveEventChoiceId(
  state: GameState,
  choiceId: string,
  nowMs: number,
): { ok: true; state: GameState } | { ok: false; reason: string } {
  const { events } = state;
  const type = events.activeEventId;
  if (type === null) {
    return { ok: false, reason: 'NO_ACTIVE_EVENT' };
  }

  let resolved: GameState = state;
  const setEvents = (patch: Partial<GameState['events']>) => {
    resolved = { ...resolved, events: { ...resolved.events, ...patch } };
  };

  switch (type) {
    case 'utility-outage': {
      // A: pay 120 → no modifier; B: 10% of gross for 1 Game Day.
      if (choiceId === 'pay') {
        const cost = EVENT_COST_MINOR['utility-outage.pay'];
        if (state.player.cashMinorUnits < cost) return { ok: false, reason: 'INSUFFICIENT_FUNDS' };
        resolved = {
          ...resolved,
          player: { ...resolved.player, cashMinorUnits: resolved.player.cashMinorUnits - cost },
        };
      } else if (choiceId === 'wait') {
        resolved = {
          ...resolved,
          modifiers: {
            incomeReductions: [
              ...resolved.modifiers.incomeReductions,
              { modifierId: `${type}:${nowMs}`, rate: 0.1, expiresAt: nowMs + ONE_GAME_DAY_MS },
            ],
          },
        };
      } else {
        return { ok: false, reason: 'UNKNOWN_CHOICE' };
      }
      break;
    }
    case 'water-tap': {
      if (choiceId === 'repair') {
        const cost = EVENT_COST_MINOR['water-tap.repair'];
        if (state.player.cashMinorUnits < cost) return { ok: false, reason: 'INSUFFICIENT_FUNDS' };
        resolved = {
          ...resolved,
          player: { ...resolved.player, cashMinorUnits: resolved.player.cashMinorUnits - cost },
        };
      } else if (choiceId === 'delay') {
        resolved = {
          ...resolved,
          modifiers: {
            incomeReductions: [
              ...resolved.modifiers.incomeReductions,
              { modifierId: `${type}:${nowMs}`, rate: 0.15, expiresAt: nowMs + ONE_GAME_DAY_MS },
            ],
          },
        };
      } else {
        return { ok: false, reason: 'UNKNOWN_CHOICE' };
      }
      break;
    }
    case 'hallway-clutter': {
      if (choiceId === 'warn') {
        // Free; closes with no penalty and no extra cooldown (open-questions A6).
      } else if (choiceId === 'hire') {
        const cost = EVENT_COST_MINOR['hallway-clutter.hire'];
        if (state.player.cashMinorUnits < cost) return { ok: false, reason: 'INSUFFICIENT_FUNDS' };
        resolved = {
          ...resolved,
          player: { ...resolved.player, cashMinorUnits: resolved.player.cashMinorUnits - cost },
        };
        setEvents({
          suppressedOnlineMs: {
            ...resolved.events.suppressedOnlineMs,
            [type]: EVENT_PER_EVENT_COOLDOWN_ONLINE_MS * 2, // 60 online minutes
          },
        });
      } else {
        return { ok: false, reason: 'UNKNOWN_CHOICE' };
      }
      break;
    }
    case 'noise-complaint': {
      const target = events.eventPayload?.targetTenantId;
      if (!target) {
        return { ok: false, reason: 'NO_ACTIVE_EVENT' };
      }
      if (choiceId === 'warn') {
        setEvents({
          noiseTargetCooldownOnlineMsRecord: {
            ...resolved.events.noiseTargetCooldownOnlineMsRecord,
            [target]: 30 * 60_000, // 30 online minutes
          },
        });
      } else if (choiceId === 'mediator') {
        const cost = EVENT_COST_MINOR['noise-complaint.mediator'];
        if (state.player.cashMinorUnits < cost) return { ok: false, reason: 'INSUFFICIENT_FUNDS' };
        resolved = {
          ...resolved,
          player: { ...resolved.player, cashMinorUnits: resolved.player.cashMinorUnits - cost },
        };
        setEvents({
          noiseTargetCooldownOnlineMsRecord: {
            ...resolved.events.noiseTargetCooldownOnlineMsRecord,
            [target]: 60 * 60_000, // 60 online minutes
          },
        });
      } else {
        return { ok: false, reason: 'UNKNOWN_CHOICE' };
      }
      break;
    }
    case 'group-of-students': {
      // A: two Students assigned directly into the two vacant L1 rooms,
      // bypassing the queue (open-questions A8 default); B: no cost/penalty.
      if (choiceId === 'accept') {
        const vacantL1 = state.building.rooms
          .filter((room) => room.tenantId === null && room.level === 1)
          .slice(0, 2);
        if (vacantL1.length < 2) {
          return { ok: false, reason: 'ROOM_NOT_FOUND' };
        }
        const base = 100;
        const added = vacantL1.map((_, index) => ({
          tenantId: `tenant-es-${base + index + 1}`,
          archetype: 'student' as const,
        }));
        const assignmentMap = new Map<string, string>();
        vacantL1.forEach((room, index) => assignmentMap.set(room.roomId, added[index].tenantId));
        resolved = {
          ...resolved,
          tenants: [...state.tenants, ...added],
          building: {
            ...state.building,
            rooms: state.building.rooms.map((room) =>
              assignmentMap.has(room.roomId)
                ? { ...room, tenantId: assignmentMap.get(room.roomId) ?? null }
                : room,
            ),
          },
        };
        // Occupancy can complete a capacity milestone even though no player
        // command targeted a room (GDD 4.1 applies to any tenancy change).
        resolved = applyProgression(resolved);
      } else if (choiceId === 'decline') {
        // No cost, no penalty.
      } else {
        return { ok: false, reason: 'UNKNOWN_CHOICE' };
      }
      break;
    }
  }

  // Close the event and book cooldowns (global 10 min online, per-event 30 min).
  setEvents({
    activeEventId: null,
    eventPayload: null,
    globalCooldownRemainingOnlineMs: EVENT_GLOBAL_COOLDOWN_ONLINE_MS,
    perEventCooldownOnlineMs: {
      ...resolved.events.perEventCooldownOnlineMs,
      [type]: perEventCooldown(),
    },
    recentEventOnlineTimes: [
      ...resolved.events.recentEventOnlineTimes,
      onlineNow(state),
    ],
  });
  return { ok: true, state: resolved };
}
