import { defineConfig } from 'vitest/config';

// Unit tests must not depend on real timers or randomness (tech doc 12.1).
// These are pure Node tests; the IndexedDB adapter is exercised through
// fake-indexeddb in the persistence tests. Pacing sim lives in tests/pacing
// and prints its report; it runs on demand (`pnpm pacing`).
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/pacing/**/*.test.ts'],
    environment: 'node',
  },
});
