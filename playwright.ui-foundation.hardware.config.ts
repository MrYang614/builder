import { defineConfig } from '@playwright/test';
import base from './playwright.ui-foundation.config';

/** Uses the installed D3D11 adapter for the same browser assertions, timeouts and isolated server. */
export default defineConfig({
  ...base,
  use: {
    ...base.use,
    channel: 'chromium',
    launchOptions: { args: ['--enable-unsafe-webgpu', '--use-angle=d3d11'] },
  },
  outputDir: 'test-results/ui-foundation-2026-10-13/editor-hardware',
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/ui-foundation-2026-10-13/editor-hardware-results.json' }],
  ],
});
