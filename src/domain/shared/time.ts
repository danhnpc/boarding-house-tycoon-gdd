// Time and the current clock schema are injected, never read from globals
// inside a rule (game-domain-pure-logic skill, rule 4).

export interface TimeProvider {
  /** Current time in epoch milliseconds. */
  now(): number;
}
