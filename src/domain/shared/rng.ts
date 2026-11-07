// Seeded, injectable randomness (game-domain-pure-logic rule 4; tech doc 6.4:
// randomness selects an event, never its outcome). Tests never call this
// provider with an unseeded source.

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
}

/** mulberry32: tiny, deterministic, good enough for gameplay rolls. */
export function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let outcome = state;
      outcome = Math.imul(outcome ^ (outcome >>> 15), outcome | 1);
      outcome ^= outcome + Math.imul(outcome ^ (outcome >>> 7), outcome | 61);
      return ((outcome ^ (outcome >>> 14)) >>> 0) / 4_294_967_296;
    },
  };
}
