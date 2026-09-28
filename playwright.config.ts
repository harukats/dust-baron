import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:8080',
    viewport: { width: 1280, height: 720 },
    trace: { mode: 'retain-on-failure', screenshots: false, snapshots: false, sources: true },
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    env: { PLAYWRIGHT_TEST: '1' },
  },
});
