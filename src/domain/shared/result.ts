// Rules that can fail return explicit typed results, never thrown errors for
// normal gameplay outcomes (tech doc 6.1, game-domain-pure-logic skill).

export type CommandResult<T> =
  | { ok: true; state: T }
  | { ok: false; reason: string };

export const ok = <T>(state: T): CommandResult<T> => ({ ok: true, state });
export const fail = <T>(reason: string): CommandResult<T> => ({
  ok: false,
  reason,
});
