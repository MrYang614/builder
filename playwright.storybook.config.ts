import { defineConfig, devices } from '@playwright/test';

/** Owns a separate HMR-enabled development server; it never reuses the user's Storybook. */
export default defineConfig({
  testDir: './apps/storybook/tests',
  testMatch: '**/*.spec.ts',
  timeout: 60000,
  expect: { timeout: 10000 },
  workers: 1,
  retries: 0,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:6007',
    viewport: { width: 1440, height: 960 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  outputDir: 'test-results/ui-foundation-2026-10-13/storybook-browser',
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/ui-foundation-2026-10-13/storybook-results.json' }],
  ],
  webServer: {
    env: { BUILDING_STORYBOOK_E2E: '1' },
    command: 'npm run storybook -- --port 6007 --ci',
    url: 'http://127.0.0.1:6007',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
