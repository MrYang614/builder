import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** Owns an isolated UI review server and preserves this run's evidence separately. */
export default defineConfig({
  ...base,
  testMatch: '**/uiux.browser.spec.ts',
  outputDir: '.test-artifacts/uiux-20261013/flow-after/results',
  use: { ...base.use, baseURL: 'http://127.0.0.1:1424', viewport: { width: 1600, height: 900 } },
  reporter: [
    ['list'],
    ['json', { outputFile: '.test-artifacts/uiux-20261013/flow-after/results.json' }],
  ],
  webServer: {
    command: 'npm run dev -- --port 1424 --mode e2e',
    url: 'http://127.0.0.1:1424',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
