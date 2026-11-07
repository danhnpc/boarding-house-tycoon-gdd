// Canonical, serializable game state (tech doc 5.1). Plain data only: no
// class instances, functions, DOM/Phaser objects, or Date values. Timestamps
// are epoch-millisecond integers; money is integer minor units (100 = 1 Cash).

export type RoomId = string; // "room-1" .. "room-6"
export type TenantId = string; // stable, unique
export type CandidateId = string; // stable, unique
export type RoomLevel = 1 | 2 | 3;

export type TenantArchetype = 'student' | 'office_worker' | 'messy_tenant';

export interface RoomState {
  roomId: RoomId;
  level: RoomLevel;
  /** null = vacant. Occupancy is explicit state, never inferred from visuals. */
  tenantId: TenantId | null;
}

export interface TenantState {
  tenantId: TenantId;
  archetype: TenantArchetype;
}

export interface TenantCandidate {
  candidateId: CandidateId;
  archetype: TenantArchetype;
}

export interface PlayerState {
  cashMinorUnits: number;
  lifetimeGrossIncomeMinorUnits: number;
}

export interface BuildingState {
  roomCapacity: number;
  rooms: RoomState[];
}

export interface MissionState {
  /** 1-based numbers of completed main missions (GDD 7.1). */
  completedMissionNumbers: number[];
  nextMissionNumber: number;
}

export interface ProgressionState {
  roomCapacity: number;
  /** Highest room level the player may build/upgrade to right now. */
  unlockedMaxLevel: RoomLevel;
}

export interface IncomeModifier {
  modifierId: string;
  /** Fraction of gross rent removed while active, e.g. 0.15. */
  rate: number;
  /** Absolute expiry (epoch ms). Modifiers keep elapsing offline (GDD 8.1). */
  expiresAt: number;
}

export interface ModifiersState {
  incomeReductions: IncomeModifier[];
}

export interface EventState {
  activeEventId: string | null;
}

export interface TimeState {
  /** Last successfully credited checkpoint (epoch ms). */
  lastCheckpointAt: number;
  /** Fractional minor units carried between accrual ticks. */
  incomeRemainderMinorUnits: number;
}

export interface GameState {
  schemaVersion: number;
  player: PlayerState;
  building: BuildingState;
  tenants: TenantState[];
  candidates: TenantCandidate[];
  missions: MissionState;
  progression: ProgressionState;
  modifiers: ModifiersState;
  events: EventState;
  time: TimeState;
}
