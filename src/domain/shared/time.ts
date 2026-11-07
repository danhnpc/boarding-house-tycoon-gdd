// Time abstraction only. The concrete system-clock adapter lives outside the
// domain in src/platform/ (the import guard forbids reading wall-clock time
// or calling random sources from inside src/domain).

export interface TimeProvider {
  /** Current time in epoch milliseconds. */
  now(): number;
}
