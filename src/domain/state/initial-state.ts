// The fresh-save baseline (GDD 3.4): 1,000 Cash, two Level 1 rooms with room 1
// occupied by an Office Worker, and one Student candidate in the queue.

import {
  INITIAL_CAPACITY,
  INITIAL_ROOM_COUNT,
  SCHEMA_VERSION,
  STARTING_CASH_MINOR,
} from '../config/balance';
import type { GameState, TenantState } from '../types';
import type { TimeProvider } from '../shared/time';

export function createInitialGameState(time: TimeProvider): GameState {
  const rooms = Array.from({ length: INITIAL_ROOM_COUNT }, (_, index) => ({
    roomId: `room-${index + 1}`,
    level: 1 as const,
    tenantId: null as string | null,
  }));

  const tenants: TenantState[] = [
    { tenantId: 'tenant-1', archetype: 'office_worker' },
  ];
  rooms[0].tenantId = 'tenant-1';

  return {
    schemaVersion: SCHEMA_VERSION,
    player: {
      cashMinorUnits: STARTING_CASH_MINOR,
      lifetimeGrossIncomeMinorUnits: 0,
    },
    building: {
      roomCapacity: INITIAL_CAPACITY,
      rooms,
    },
    tenants,
    candidates: [{ candidateId: 'candidate-1', archetype: 'student' }],
    missions: {
      completedMissionNumbers: [],
      nextMissionNumber: 1,
    },
    progression: {
      roomCapacity: INITIAL_CAPACITY,
      unlockedMaxLevel: 1,
    },
    modifiers: {
      incomeReductions: [],
    },
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
      lastCheckpointAt: time.now(),
      incomeRemainderMinorUnits: 0,
      onlineMs: 0,
    },
  };
}
