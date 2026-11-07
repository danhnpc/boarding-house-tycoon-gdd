// Pacing simulation (open-questions F1 gate, tech doc 12). A deterministic
// greedy agent plays 30 game days using ONLY domain rules and prints a pacing
// report. Not an assertion test: it gates Phase 3 balance tuning and doubles
// as a regression harness for the economy pool.

import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { accrueIncome, toWholeCash } from '../../src/domain/economy/rent';
import { buildRoom, upgradeRoom } from '../../src/domain/building/rooms';
import { acceptCandidate, moveOutTenant } from '../../src/domain/tenant/candidates';
import { generateCandidate } from '../../src/domain/tenant/generation';
import { maybeTriggerEvent, resolveEventChoiceId } from '../../src/domain/event/engine';
import { evaluateMissions, activeMission } from '../../src/domain/mission/missions';
import { createInitialGameState } from '../../src/domain/state/initial-state';
import { createSeededRng } from '../../src/domain/shared/rng';
import {
  BUILD_COST_MINOR,
  TENANT_BUDGET_PER_GAME_DAY_MINOR,
  UPGRADE_COST_MINOR,
  INITIAL_ROOM_COUNT,
} from '../../src/domain/config/balance';

/** Mirrors GameApp.tick online housekeeping for the check gap (5 min). */
function advanceOnlineTime(state: GameState, gapMs: number): GameState {
  const dec = (value: number): number => Math.max(0, value - gapMs);
  const decMap = (map: Record<string, number>): Record<string, number> =>
    Object.fromEntries(Object.entries(map).map(([k, v]) => [k, dec(v as number)] as const));
  const onlineMs = state.time.onlineMs + gapMs;
  return {
    ...state,
    time: { ...state.time, onlineMs },
    events: {
      ...state.events,
      globalCooldownRemainingOnlineMs: dec(state.events.globalCooldownRemainingOnlineMs),
      perEventCooldownOnlineMs: decMap(state.events.perEventCooldownOnlineMs),
      noiseTargetCooldownOnlineMsRecord: decMap(
        state.events.noiseTargetCooldownOnlineMsRecord,
      ),
      suppressedOnlineMs: decMap(state.events.suppressedOnlineMs),
      recentEventOnlineTimes: state.events.recentEventOnlineTimes.filter(
        (stamp) => onlineMs - stamp < 60 * 60_000,
      ),
    },
  };
}
import type { TimeProvider } from '../../src/domain/shared/time';
import type { GameState } from '../../src/domain/types';

const SEED = 2026_11;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const SIM_MINUTES = 30 * 24 * 60; // 30 game days
const CHECK_EVERY_MINUTES = 5;

const zeroClock: TimeProvider = { now: () => 0 };

function firstVacantAffordableRoom(state: GameState, candidateArchetype: string) {
  const budget =
    TENANT_BUDGET_PER_GAME_DAY_MINOR[candidateArchetype as keyof typeof TENANT_BUDGET_PER_GAME_DAY_MINOR];
  if (budget === undefined) return null;
  return (
    state.building.rooms.find(
      (room) => room.tenantId === null && room.level >= 1 && budget >= RENT_BY[room.level],
    ) ?? null
  );
}

const RENT_BY: Record<number, number> = { 1: 12_000, 2: 21_000, 3: 35_000 };

function nextUnbuiltRoomNumber(state: GameState): number | null {
  for (let n = INITIAL_ROOM_COUNT + 1; n <= 6; n++) {
    if (!state.building.rooms.some((r) => r.roomId === `room-${n}`)) {
      return n;
    }
  }
  return null;
}

function h(ms: number): number {
  return Math.round(ms / HOUR_MS);
}

describe('pacing simulation (30 game days, greedy agent)', () => {
  it('runs and prints the report', () => {
    const rng = createSeededRng(SEED);
    let state = createInitialGameState(zeroClock);
    let now = 0;
    let sinceCheck = CHECK_EVERY_MINUTES; // check on the first minute

    const marks: Record<string, number | null> = {
      firstL2: null,
      firstBuild3: null,
      mission1: null,
      mission2: null,
      mission3: null,
      chainDone: null,
      capacity4: null,
    };
    let events = 0;
    let candidatesGenerated = 0;
    let buys = { upgrades: 0, builds: 0 };

    for (let minute = 1; minute <= SIM_MINUTES; minute++) {
      now += MINUTE_MS;
      const accrued = accrueIncome(state, now);
      if (accrued.ok) {
        state = accrued.state;
      }

      sinceCheck += 1;
      if (sinceCheck < CHECK_EVERY_MINUTES) {
        continue;
      }
      const gapMinutes = sinceCheck;
      sinceCheck = 0;

      // 0. Mission evaluation mirrors GameApp.execute; online-time
      // housekeeping mirrors GameApp.tick (cooldowns live in online time).
      state = evaluateMissions(state);
      state = advanceOnlineTime(state, gapMinutes * MINUTE_MS);

      // 1. Candidate supply + acceptance
      const before = state.candidates.length;
      state = generateCandidate(state, rng);
      candidatesGenerated += state.candidates.length - before;
      for (const candidate of [...state.candidates]) {
        const room = firstVacantAffordableRoom(state, candidate.archetype);
        if (room !== null) {
          const accepted = acceptCandidate(state, candidate.candidateId, room.roomId);
          if (accepted.ok) {
            state = accepted.state;
          }
        }
      }

      // 2. Events: agent pays when affordable on paying choices, else free.
      const rolled = maybeTriggerEvent(state, rng);
      state = rolled.state;
      if (rolled.triggered) {
        events += 1;
        let choice = 'warn';
        if (rolled.state.events.activeEventId === 'utility-outage') {
          choice = state.player.cashMinorUnits >= 12_000 ? 'pay' : 'wait';
        } else if (rolled.state.events.activeEventId === 'water-tap') {
          choice = state.player.cashMinorUnits >= 15_000 ? 'repair' : 'delay';
        } else if (rolled.state.events.activeEventId === 'group-of-students') {
          choice = 'accept';
        }
        const resolved = resolveEventChoiceId(state, choice, now);
        if (resolved.ok) {
          state = resolved.state;
        }
      }

      state = evaluateMissions(state);

      // 3. Investment: prefer upgrading (best payback) then building. A
      // budget-blocked upgrade evicts the blocking tenant (free, GDD 5.4)
      // once, then re-tries the upgrade at the next check.
      const nextLevel = 2;
      const unlockedMax = state.progression.unlockedMaxLevel;
      const upgradeCandidates = state.building.rooms.filter((r) => r.level < unlockedMax);
      const canUpgradeAny =
        unlockedMax >= nextLevel &&
        state.player.cashMinorUnits >= UPGRADE_COST_MINOR[2] &&
        upgradeCandidates.length > 0;
      const unbuilt = nextUnbuiltRoomNumber(state);
      const unbuiltCost = unbuilt === null ? null : (BUILD_COST_MINOR[unbuilt] ?? null);
      const canBuild =
        unbuilt !== null &&
        unbuiltCost !== null &&
        state.building.rooms.length + 1 <= state.progression.roomCapacity &&
        state.player.cashMinorUnits >= unbuiltCost;

      if (canUpgradeAny) {
        const target = upgradeCandidates.find(
          (r) => r.tenantId === null,
        );
        const tenantOk = upgradeCandidates.find(
          (r) =>
            r.tenantId !== null &&
            TENANT_BUDGET_PER_GAME_DAY_MINOR[
              state.tenants.find((t) => t.tenantId === r.tenantId)?.archetype ??
                'student'
            ] >= RENT_BY[unlockedMax],
        );
        const chosen = target ?? tenantOk;
        if (chosen !== undefined) {
          const result = upgradeRoom(state, chosen.roomId);
          if (result.ok) {
            state = result.state;
            buys.upgrades += 1;
          } else {
            // Budget-blocked: free the room (open-questions A1 default flow),
            // the candidate queue refills on a later check.
            const evicted = moveOutTenant(state, chosen.roomId);
            if (evicted.ok) {
              state = evicted.state;
            }
          }
        } else if (upgradeCandidates.length > 0 && state.player.cashMinorUnits >= UPGRADE_COST_MINOR[2]) {
          // Every remaining upgradeable room is student-blocked: evict one per
          // check so the next check can upgrade the now-vacant room.
          const evicted = moveOutTenant(state, upgradeCandidates[0].roomId);
          if (evicted.ok) {
            state = evicted.state;
          }
        } else if (canBuild && unbuilt !== null) {
          // No upgradeable room right now: spend the check on capacity.
          const result = buildRoom(state, `room-${unbuilt}`);
          if (result.ok) {
            state = result.state;
            buys.builds += 1;
          }
        }
      } else if (canBuild && unbuilt !== null) {
        const result = buildRoom(state, `room-${unbuilt}`);
        if (result.ok) {
          state = result.state;
          buys.builds += 1;
        }
      }
      state = evaluateMissions(state);

      // 4. Milestone watermark logging (marks are wall-sim hours).
      if (marks.firstL2 === null && state.building.rooms.some((r) => r.level >= 2)) {
        marks.firstL2 = h(now);
      }
      if (marks.firstBuild3 === null && state.building.rooms.some((r) => r.roomId === 'room-3')) {
        marks.firstBuild3 = h(now);
      }
      if (marks.capacity4 === null && state.progression.roomCapacity >= 4) {
        marks.capacity4 = h(now);
      }
      for (const missionNumber of [1, 2, 3]) {
        const key = `mission${missionNumber}`;
        if (marks[key] === null && state.missions.completedMissionNumbers.includes(missionNumber)) {
          marks[key] = h(now);
        }
      }
      if (marks.chainDone === null && activeMission(state) === null) {
        marks.chainDone = h(now);
      }
    }

    state = evaluateMissions(state);

    const lines: string[] = [
      '# Pacing simulation report',
      '',
      `- Seed: ${SEED}`,
      `- Horizon: ${SIM_MINUTES / (24 * 60)} game days (greedy agent, domain rules only)`,
      `- Capacity 4 milestone: ${fmt(marks.capacity4)} h`,
      `- First Level 2 room: ${fmt(marks.firstL2)} h`,
      `- Room 3 built: ${fmt(marks.firstBuild3)} h`,
      `- Mission 1 (2nd tenant): ${fmt(marks.mission1)} h`,
      `- Mission 2 (first L2): ${fmt(marks.mission2)} h`,
      `- Mission 3 (room 3): ${fmt(marks.mission3)} h`,
      `- Mission chain complete: ${fmt(marks.chainDone)} h`,
      `- Events spawned: ${events}`,
      `- Candidates generated: ${candidatesGenerated} (+1 initial)`,
      `- Rooms built: ${buys.builds}`,
      `- Upgrades bought: ${buys.upgrades}`,
      `- Final cash (whole units): ${toWholeCash(state.player.cashMinorUnits)}`,
      `- Final rooms: ${state.building.rooms
        .map((r) => `${r.roomId}L${r.level}${r.tenantId ? 'T' : 'v'}`)
        .join(' ')}`,
      '',
    ];
    writeFileSync('pacing-report.md', lines.join('\n'), 'utf8');
    console.log(lines.join('\n'));
  });
});

function fmt(value: number | null): string {
  return value === null ? 'not yet' : String(value);
}
