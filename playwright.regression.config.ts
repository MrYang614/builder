import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** A regression run owns its server and never reuses the user's editor development session. */
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: 'http://127.0.0.1:1421' },
  reporter: [['list'], ['json', { outputFile: 'test-results/regression-e2e-results.json' }]],
  webServer: {
    command: 'npm run dev -- --port 1421 --mode e2e',
    url: 'http://127.0.0.1:1421',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
