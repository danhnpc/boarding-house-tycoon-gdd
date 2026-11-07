// System clock adapter (TimeProvider implementation lives outside the domain;
// domain rules never read global time directly).

import type { TimeProvider } from '../domain/shared/time';

export const systemTimeProvider: TimeProvider = {
  now: () => Date.now(),
};
