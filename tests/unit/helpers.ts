// Deterministic helpers for unit tests: fake clock, frozen state fixture.
// No real timers, no uncontrolled randomness (tech doc 12.1).

import type { TimeProvider } from '../../src/domain/shared/time';
import { createInitialGameState } from '../../src/domain/state/initial-state';
import type { GameState } from '../../src/domain/types';

export class FakeClock implements TimeProvider {
  constructor(public current: number) {}
  now(): number {
    return this.current;
  }
  advance(ms: number): void {
    this.current += ms;
  }
}

export function initialFrozenState(hour = 0): GameState {
  return deepFreeze(createInitialGameState(new FakeClock(hour * 3_600_000)));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.values(value as any).forEach(deepFreeze);
    Object.freeze(value as object);
  }
  return value;
}
