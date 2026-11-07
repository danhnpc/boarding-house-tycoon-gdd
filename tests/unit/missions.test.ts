// Main Mission chain (GDD 7.1): progress derived from state, credited once.

import { describe, expect, it } from 'vitest';
import { acceptCandidate } from '../../src/domain/tenant/candidates';
import { upgradeRoom } from '../../src/domain/building/rooms';
import {
  MAIN_MISSIONS,
  activeMission,
  evaluateMissions,
} from '../../src/domain/mission/missions';
import { initialFrozenState } from './helpers';
import type { GameState, RoomLevel } from '../../src/domain/types';

const L2 = 2 as RoomLevel;
const L3 = 3 as RoomLevel;

describe('mission chain', () => {
  it('mission 1 completes when the second tenant is accepted, +100 Cash', () => {
    const state = initialFrozenState();
    const accepted = acceptCandidate(state, 'candidate-1', 'room-2');
    if (!accepted.ok) throw new Error(accepted.reason);
    const result = evaluateMissions(accepted.state);
    expect(result.missions.completedMissionNumbers).toEqual([1]);
    expect(result.missions.nextMissionNumber).toBe(2);
    expect(result.player.cashMinorUnits).toBe(100_000 + 10_000);
    expect(result.building.rooms[1].tenantId).not.toBeNull();
  });

  it('rewards are credited exactly once (idempotent re-evaluation)', () => {
    const state = initialFrozenState();
    const accepted = acceptCandidate(state, 'candidate-1', 'room-2');
    if (!accepted.ok) throw new Error(accepted.reason);
    const first = evaluateMissions(accepted.state);
    const second = evaluateMissions(first);
    expect(second).toEqual(first);
    expect(second.missions.completedMissionNumbers).toEqual([1]);
  });

  it('mission 2: first upgrade to Level 2, +150 (milestone unlock allows it)', () => {
    let state = initialFrozenState();
    const accepted = acceptCandidate(state, 'candidate-1', 'room-2');
    if (!accepted.ok) throw new Error(accepted.reason);
    state = accepted.state;
    // room-1 tenant is office_worker (380 >= 210): legal upgrade.
    const upgraded = upgradeRoom(state, 'room-1');
    if (!upgraded.ok) throw new Error(upgraded.reason);
    const missions = evaluateMissions(upgraded.state);
    expect(missions.missions.completedMissionNumbers).toEqual([1, 2]);
    expect(missions.player.cashMinorUnits).toBe(100_000 + 10_000 - 65_000 + 15_000);
  });

  it('failed commands never progress missions (tech doc 6.5)', () => {
    const state = initialFrozenState();
    const blocked = upgradeRoom(state, 'room-1'); // Level 2 locked
    expect(blocked.ok).toBe(false);
    expect(state.missions.completedMissionNumbers).toEqual([]);
  });

  it('the chain is linear: no skipping ahead via unrelated state', () => {
    // A rich instant save does not skip missions: mission 1 still pending.
    const rich: GameState = {
      ...initialFrozenState(),
      building: {
        roomCapacity: 6,
        rooms: [
          { roomId: 'room-1', level: L3, tenantId: 'tenant-1' },
          { roomId: 'room-2', level: L3, tenantId: null },
        ],
      },
    };
    const result = evaluateMissions(rich);
    // Mission 1 still needs a second tenant, and this fixture counts only
    // what is in state: one tenant, two rooms, one occupied → not complete.
    expect(result.missions.nextMissionNumber).toBe(1);
  });

  it('cascade completes consecutive already-satisfied objectives once each', () => {
    const state: GameState = {
      ...initialFrozenState(),
      building: {
        roomCapacity: 6,
        rooms: [
          { roomId: 'room-1', level: L2, tenantId: 'tenant-1' },
          { roomId: 'room-2', level: L2, tenantId: 'tenant-a' },
          { roomId: 'room-3', level: L3, tenantId: 'tenant-b' },
          { roomId: 'room-4', level: 1, tenantId: 'tenant-c' },
          { roomId: 'room-5', level: 1, tenantId: null },
          { roomId: 'room-6', level: 1, tenantId: null },
        ],
      },
      tenants: [
        { tenantId: 'tenant-1', archetype: 'office_worker' },
        { tenantId: 'tenant-a', archetype: 'office_worker' },
        { tenantId: 'tenant-b', archetype: 'office_worker' },
        { tenantId: 'tenant-c', archetype: 'office_worker' },
      ],
      missions: { completedMissionNumbers: [1, 2, 3], nextMissionNumber: 4 },
    };
    const result = evaluateMissions(state);
    expect(result.missions.completedMissionNumbers).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // Rewards 4..7 = 150+250+300+400 Cash.
    expect(result.player.cashMinorUnits).toBe(100_000 + 15_000 + 25_000 + 30_000 + 40_000);
    expect(activeMission(result)).toBeNull();
  });

  it('exactly seven main missions exist (GDD 7.1)', () => {
    expect(MAIN_MISSIONS).toHaveLength(7);
    expect(MAIN_MISSIONS.map((m) => m.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(MAIN_MISSIONS.map((m) => m.rewardMinor)).toEqual([
      10_000, 15_000, 20_000, 15_000, 25_000, 30_000, 40_000,
    ]);
  });
});
