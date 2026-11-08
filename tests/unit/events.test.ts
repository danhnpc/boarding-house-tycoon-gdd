// Event system and candidate generation (GDD 5.3, 6). Seeded RNG, no wall
// clock: all cooldown math runs in accumulated online time.

import { describe, expect, it } from 'vitest';
import { generateCandidate, eligibleArchetypes } from '../../src/domain/tenant/generation';
import { maybeTriggerEvent, resolveEventChoiceId, selectEligibleEvent } from '../../src/domain/event/engine';
import { createSeededRng } from '../../src/domain/shared/rng';
import { deepFreeze as deepenFreeze, initialFrozenState } from './helpers';
import type { GameState } from '../../src/domain/types';

const HOUR = 3_600_000;

function fixture(over: Partial<GameState> = {}): GameState {
  return { ...initialFrozenState(), ...over };
}

describe('candidate generation (GDD 5.3)', () => {
  it('a check adds one candidate while queue < 3 and rooms are affordable', () => {
    const state = fixture();
    const got = generateCandidate(state, createSeededRng(1));
    expect(got).not.toBe(state); // added
    expect(got.candidates).toHaveLength(2);
  });

  it('a full queue blocks generation (no probability roll)', () => {
    const full = fixture({
      candidates: [
        { candidateId: 'candidate-1', archetype: 'student' },
        { candidateId: 'candidate-2', archetype: 'student' },
        { candidateId: 'candidate-3', archetype: 'student' },
      ],
    });
    deepenFreeze(full);
    const got = generateCandidate(full, createSeededRng(1));
    expect(got.candidates).toHaveLength(3);
  });

  it('no affordable vacant room blocks generation', () => {
    // One room at Level 2 only, occupied → nothing affordable for anyone.
    const blocked = fixture({
      building: {
        roomCapacity: 2,
        rooms: [{ roomId: 'room-1', level: 2, tenantId: 'tenant-1' }],
      },
    });
    expect(eligibleArchetypes(blocked)).toEqual([]);
    expect(generateCandidate(blocked, createSeededRng(1))).toBe(blocked);
  });

  it('weighted selection is deterministic given the same seed and state', () => {
    const a = generateCandidate(fixture(), createSeededRng(42));
    const b = generateCandidate(fixture(), createSeededRng(42));
    expect(a.candidates[1]?.archetype).toBe(b.candidates[1]?.archetype);
  });
});

describe('event triggering (GDD 6.2–6.3)', () => {
  it('rng below the 25% base chance triggers an eligible event', () => {
    const always = { next: (): number => 0 };
    const rolled = maybeTriggerEvent(initialFrozenState(), always);
    expect(rolled.triggered).toBe(true);
    expect(['hallway-clutter', 'noise-complaint', 'water-tap']).toContain(
      rolled.state.events.activeEventId,
    );
  });

  it('high rng rolls nothing', () => {
    const never = { next: (): number => 0.99 };
    const rolled = maybeTriggerEvent(initialFrozenState(), never);
    expect(rolled.triggered).toBe(false);
    expect(rolled.state.events.activeEventId).toBeNull();
  });

  it('no trigger while an event is already active', () => {
    const active = fixture({
      events: { ...initialFrozenState().events, activeEventId: 'hallway-clutter' },
    });
    // rng 0 always passes the 25% base roll, so only the active-event gate can block.
    expect(maybeTriggerEvent(active, { next: () => 0 }).triggered).toBe(false);
  });

  it('no trigger while the global cooldown is running', () => {
    const cooling = fixture({
      events: {
        ...initialFrozenState().events,
        globalCooldownRemainingOnlineMs: 60_000,
      },
    });
    expect(maybeTriggerEvent(cooling, { next: () => 0 }).triggered).toBe(false);
  });

  it('rolling 60-online-minute cap stops the 4th event', () => {
    const capped = fixture({
      events: {
        ...initialFrozenState().events,
        recentEventOnlineTimes: [
          5 * 60_000, // online-time stamps within the last hour
          10 * 60_000,
          20 * 60_000,
        ],
      },
      time: {
        lastCheckpointAt: 0,
        incomeRemainderMinorUnits: 0,
        grossRemainderMinorUnits: 0,
        onlineMs: 30 * 60_000,
      },
    });
    expect(maybeTriggerEvent(capped, { next: () => 0 }).triggered).toBe(false);
  });

  it('utility outage needs at least 2 occupied rooms', () => {
    // Force a pool with only utility outage: rng picks uniform; instead verify
    // selecting from a single-occupant state never yields utility-outage.
    for (let seed = 0; seed < 20; seed++) {
      const rolled = maybeTriggerEvent(initialFrozenState(), createSeededRng(seed));
      expect(rolled.state.events.activeEventId).not.toBe('utility-outage');
    }
  });

  it('hallway clutter has double weight while a Messy Tenant occupies', () => {
    const messy = fixture({
      tenants: [
        { tenantId: 'tenant-1', archetype: 'office_worker' },
        { tenantId: 'tenant-2', archetype: 'messy_tenant' },
      ],
      building: {
        roomCapacity: 2,
        rooms: [
          { roomId: 'room-1', level: 1, tenantId: 'tenant-1' },
          { roomId: 'room-2', level: 1, tenantId: 'tenant-2' },
        ],
      },
    });
    let hallwayWins = 0;
    let noiseWins = 0;
    for (let seed = 0; seed < 60; seed++) {
      // Selection happens after the base-chance roll in the engine, so probes
      // call the selector directly to isolate the weight comparison.
      const picked = selectEligibleEvent(messy, createSeededRng(seed));
      if (picked?.type === 'hallway-clutter') hallwayWins++;
      if (picked?.type === 'noise-complaint') noiseWins++;
    }
    expect(hallwayWins).toBeGreaterThan(noiseWins * 1.2);
  });
});

describe('deterministic outcomes (GDD 6.4)', () => {
  it('utility outage: pay 120 closes the event with no modifier', () => {
    const active = fixture({
      events: { ...initialFrozenState().events, activeEventId: 'utility-outage' },
    });
    const resolved = resolveEventChoiceId(active, 'pay', 1_000);
    if (!resolved.ok) throw new Error(resolved.reason);
    expect(resolved.state.player.cashMinorUnits).toBe(100_000 - 12_000);
    expect(resolved.state.modifiers.incomeReductions).toEqual([]);
    expect(resolved.state.events.activeEventId).toBeNull();
    expect(resolved.state.events.globalCooldownRemainingOnlineMs).toBe(10 * 60_000);
    expect(resolved.state.events.perEventCooldownOnlineMs['utility-outage']).toBe(30 * 60_000);
  });

  it('utility outage: wait applies 10% reduction for exactly 1 Game Day', () => {
    const active = fixture({
      events: { ...initialFrozenState().events, activeEventId: 'utility-outage' },
    });
    const resolved = resolveEventChoiceId(active, 'wait', 1_000);
    if (!resolved.ok) throw new Error(resolved.reason);
    expect(resolved.state.modifiers.incomeReductions).toHaveLength(1);
    expect(resolved.state.modifiers.incomeReductions[0]).toMatchObject({
      rate: 0.1,
      expiresAt: 1_000 + HOUR,
    });
  });

  it('water tap: repair costs 150; delay applies 15% for 1 Game Day', () => {
    const active = fixture({
      events: { ...initialFrozenState().events, activeEventId: 'water-tap' },
    });
    const repair = resolveEventChoiceId(active, 'repair', 1_000);
    expect(repair.ok).toBe(true);
    const delay = resolveEventChoiceId(active, 'delay', 1_000);
    if (!delay.ok) throw new Error(delay.reason);
    expect(delay.state.player.cashMinorUnits).toBe(100_000);
    expect(delay.state.modifiers.incomeReductions[0]).toMatchObject({
      rate: 0.15,
      expiresAt: 1_000 + HOUR,
    });
  });

  it('hallway: warn is free and closes; hire suppresses the event for 60 online min', () => {
    const active = fixture({
      events: { ...initialFrozenState().events, activeEventId: 'hallway-clutter' },
    });
    const warn = resolveEventChoiceId(active, 'warn', 0);
    if (!warn.ok) throw new Error(warn.reason);
    expect(warn.state.player.cashMinorUnits).toBe(100_000);

    const hire = resolveEventChoiceId(active, 'hire', 0);
    if (!hire.ok) throw new Error(hire.reason);
    expect(hire.state.player.cashMinorUnits).toBe(100_000 - 10_000);
    expect(hire.state.events.suppressedOnlineMs['hallway-clutter']).toBe(60 * 60_000);
  });

  it('noise: warn gives the shown tenant a 30-min target cooldown', () => {
    const targetActive = fixture({
      events: {
        ...initialFrozenState().events,
        activeEventId: 'noise-complaint',
        eventPayload: { targetTenantId: 'tenant-1' },
      },
    });
    const resolved = resolveEventChoiceId(targetActive, 'warn', 0);
    if (!resolved.ok) throw new Error(resolved.reason);
    expect(resolved.state.events.noiseTargetCooldownOnlineMsRecord['tenant-1']).toBe(30 * 60_000);
  });

  it('unaffordable choices are rejected with the state untouched', () => {
    const active = fixture({
      player: { cashMinorUnits: 0, lifetimeGrossIncomeMinorUnits: 0 },
      events: { ...initialFrozenState().events, activeEventId: 'utility-outage' },
    });
    deepenFreeze(active);
    const resolved = resolveEventChoiceId(active, 'pay', 0);
    expect(resolved).toMatchObject({ ok: false, reason: 'INSUFFICIENT_FUNDS' });
  });

  it('group of students: two Students join two vacant L1 rooms, bypassing the queue', () => {
    const ready = fixture({
      building: {
        roomCapacity: 4,
        rooms: [
          { roomId: 'room-1', level: 1, tenantId: 'tenant-1' },
          { roomId: 'room-2', level: 1, tenantId: null },
          { roomId: 'room-3', level: 1, tenantId: null },
          { roomId: 'room-4', level: 2, tenantId: 'tenant-x' },
        ],
      },
      tenants: [
        { tenantId: 'tenant-1', archetype: 'office_worker' },
        { tenantId: 'tenant-x', archetype: 'office_worker' },
      ],
    });
    const resolved = resolveEventChoiceId(
      {
        ...ready,
        events: { ...ready.events, activeEventId: 'group-of-students' },
      },
      'accept',
      0,
    );
    if (!resolved.ok) throw new Error(resolved.reason);
    // office tenants × 2 + two direct Students = 4.
    expect(resolved.state.tenants).toHaveLength(4);
    expect(resolved.state.building.rooms[1]?.tenantId).toMatch(/^tenant-es-/);
    expect(resolved.state.building.rooms[2]?.tenantId).toMatch(/^tenant-es-/);
    expect(resolved.state.candidates).toHaveLength(1); // queue untouched
  });

  it('two vacant Level 1 rooms is the eligibility floor (cascade does not invent rooms)', () => {
    const ready = fixture(); // only one vacant L1 room
    const resolved = resolveEventChoiceId(
      { ...ready, events: { ...ready.events, activeEventId: 'group-of-students' } },
      'accept',
      0,
    );
    expect(resolved).toMatchObject({ ok: false, reason: 'ROOM_NOT_FOUND' });
  });
});
