import { defineConfig } from 'vitest/config';

// Unit tests must not depend on real timers or randomness (tech doc 12.1).
// These are pure Node tests; the IndexedDB adapter is exercised through
// fake-indexeddb in the persistence tests.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
