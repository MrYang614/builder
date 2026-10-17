import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch({
  args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:1420');
await page.waitForSelector('canvas');
await page.waitForTimeout(200);
mkdirSync('.test-artifacts/smoke', { recursive: true });
await page.screenshot({ path: '.test-artifacts/smoke/editor-initial.png' });
console.log(
  JSON.stringify({
    errors,
    buttons: await page
      .locator('button')
      .evaluateAll((nodes) =>
        nodes.map((n) => ({ text: n.textContent, role: n.getAttribute('role') })),
      ),
    canvas: await page.locator('canvas').count(),
  }),
);
await browser.close();
