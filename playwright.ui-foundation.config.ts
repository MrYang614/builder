import { defineConfig } from '@playwright/test';
import base from './playwright.regression.config';

/** Runs the migrated editor paths with isolated evidence and a dedicated browser-only server. */
export default defineConfig({
  ...base,
  testMatch: [
    '**/numeric-display.browser.spec.ts',
    '**/repository-review.browser.spec.ts',
    '**/confirm-lifecycle.browser.spec.ts',
    '**/ui-states.browser.spec.ts',
    '**/header.browser.spec.ts',
    '**/window-header.browser.spec.ts',
    '**/uiux.browser.spec.ts',
    '**/runtime.browser.spec.ts',
    '**/snapshot.browser.spec.ts',
    '**/async-theme.browser.spec.ts',
    '**/rendering-ui.browser.spec.ts',
    '**/snapping.browser.spec.ts',
    '**/materials.browser.spec.ts',
    '**/rendering.browser.spec.ts',
  ],
  outputDir: 'test-results/ui-foundation-2026-10-13/editor-browser',
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/ui-foundation-2026-10-13/editor-results.json' }],
  ],
});
