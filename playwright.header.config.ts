import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** Header verification owns its server/cache without refreshing another editor or regression run. */
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: 'http://127.0.0.1:1422' },
  reporter: [['list'], ['json', { outputFile: 'test-results/header-layout/e2e-results.json' }]],
  webServer: {
    command: 'npm run dev -- --port 1422 --mode e2e-header',
    url: 'http://127.0.0.1:1422',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
