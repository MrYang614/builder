import { defineConfig, devices } from '@playwright/test';

const hardware = process.env.BUILDING_E2E_HARDWARE === '1';
const output = '.test-artifacts/playwright/editor';

/** Editor tests own an isolated server; hardware mode preserves the same assertions and timeouts. */
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL: 'http://127.0.0.1:1421',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    channel: hardware ? 'chromium' : undefined,
    launchOptions: {
      args: hardware
        ? ['--enable-unsafe-webgpu', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])]
        : ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  workers: 1,
  outputDir: `${output}/results`,
  reporter: [['list'], ['json', { outputFile: `${output}/report.json` }]],
  webServer: {
    command: 'npm run dev -- --port 1421 --mode e2e',
    url: 'http://127.0.0.1:1421',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
