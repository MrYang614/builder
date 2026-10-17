import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** Hardware validation is explicit: it never counts an unavailable adapter as a passing test. */
export default defineConfig({
  ...base,
  testMatch: ['**/*.hardware.ts', '**/environment-pathtrace.browser.spec.ts'],
  metadata: { rendererBackend: 'webgpu' },
  timeout: 120000,
  use: {
    ...base.use,
    channel: 'chromium',
    baseURL: 'http://127.0.0.1:1423',
    launchOptions: {
      // Full Chromium's headless mode supplies Dawn's DXIL libraries on Windows.
      // Playwright's default headless-shell fails requestDevice before shader compilation here.
      // These flags do not bypass shader or GPU resource validation or force a software GPU.
      args: [
        '--enable-unsafe-webgpu',
        ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []),
      ],
    },
  },
  outputDir: '.test-artifacts/playwright/webgpu/results',
  reporter: [['list'], ['json', { outputFile: '.test-artifacts/playwright/webgpu/report.json' }]],
  webServer: {
    command: 'npm run dev -- --port 1423 --mode e2e',
    url: 'http://127.0.0.1:1423',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
