import { defineConfig } from '@playwright/test';

// E2E suite (tech doc 12.3). Runs against the Vite dev server so the
// window.__bht dev hooks are available for deterministic event forcing.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173/',
    viewport: { width: 420, height: 900 }, // portrait phone frame
  },
  webServer: {
    command: 'pnpm dev --port 5173 --strictPort',
    port: 5173,
    timeout: 60_000,
    reuseExistingServer: true,
  },
});
