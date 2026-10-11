import { evidencePath } from './evidence-path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type Instrumented = {
  __editor: {
    diagnostics(): {
      pendingFrame: boolean;
      render: {
        postProcessing: Record<string, unknown>;
        switching: boolean;
        environmentLoading: boolean;
      };
      frameCount: number;
    };
  };
};

const diagnostics = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.diagnostics());

async function idle(page: Page) {
  await page.waitForFunction(() => {
    const state = (window as unknown as Instrumented).__editor.diagnostics();
    return !state.pendingFrame && !state.render.switching && !state.render.environmentLoading;
  });
}

async function waitPostProcessingStable(page: Page) {
  await page.waitForFunction(() => {
    const state = (window as unknown as Instrumented).__editor.diagnostics();
    return state.render.postProcessing.history === 'stable';
  });
}

async function settings(page: Page, open: boolean) {
  if (open) {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  } else {
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
}

async function toggle(page: Page, name: string, checked: boolean) {
  const checkbox = page.getByRole('checkbox', { name, exact: true });
  if ((await checkbox.isChecked()) !== checked) {
    await checkbox.click();
  }
  await expect(checkbox).toBeChecked({ checked });
}

async function cameraInteraction(page: Page) {
  const canvas = page.getByTestId('viewport-canvas');
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('viewport canvas is not visible');
  }
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.54, { steps: 8 });
  await page.mouse.up();
  await idle(page);
}

test('real-time GTAO and temporal AA toggles render, reset history, and survive resize', async ({
  page,
}, testInfo: TestInfo) => {
  test.setTimeout(90000);
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('favicon')) {
      consoleErrors.push(message.text());
    }
  });
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Instrumented).__editor);
  await page.getByRole('button', { name: '可编辑示例', exact: true }).click();
  await idle(page);

  const initial = await diagnostics(page);
  expect(initial.render.postProcessing).toMatchObject({
    available: true,
    gtao: true,
    taa: true,
  });
  const initialViewport = await page.evaluate(() => ({
    scenario: 'editable example',
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio,
  }));
  const evidence: Record<string, unknown> = {
    initial: initial.render.postProcessing,
    performanceContext: initialViewport,
  };
  const initialScreenshot = testInfo.outputPath('realtime-gtao-taa-on.png');
  await page.getByTestId('viewport-canvas').screenshot({ path: initialScreenshot });
  evidence.initialScreenshot = initialScreenshot;
  await settings(page, true);
  await expect(page.getByRole('checkbox', { name: '接触阴影（GTAO）', exact: true })).toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: '时间抗锯齿（TAA / TRAA）', exact: true }),
  ).toBeChecked();

  await toggle(page, '接触阴影（GTAO）', false);
  await settings(page, false);
  await idle(page);
  const gtaoOff = await diagnostics(page);
  expect(gtaoOff.render.postProcessing).toMatchObject({ gtao: false, available: true });
  evidence.gtaoOff = gtaoOff.render.postProcessing;
  const gtaoOffScreenshot = testInfo.outputPath('realtime-gtao-off.png');
  await page.getByTestId('viewport-canvas').screenshot({ path: gtaoOffScreenshot });
  evidence.gtaoOffScreenshot = gtaoOffScreenshot;

  await settings(page, true);
  await toggle(page, '时间抗锯齿（TAA / TRAA）', false);
  await settings(page, false);
  await idle(page);
  const taaOff = await diagnostics(page);
  expect(taaOff.render.postProcessing).toMatchObject({ taa: false, available: true });
  evidence.taaOff = taaOff.render.postProcessing;
  const taaOffScreenshot = testInfo.outputPath('realtime-gtao-taa-off.png');
  await page.getByTestId('viewport-canvas').screenshot({ path: taaOffScreenshot });
  evidence.taaOffScreenshot = taaOffScreenshot;

  await settings(page, true);
  await toggle(page, '接触阴影（GTAO）', true);
  await toggle(page, '时间抗锯齿（TAA / TRAA）', true);
  await settings(page, false);
  await cameraInteraction(page);
  const settled = await diagnostics(page);
  expect(settled.render.postProcessing).toMatchObject({
    available: true,
    gtao: true,
    taa: true,
    history: 'stable',
  });
  evidence.afterCamera = settled.render.postProcessing;

  const frameSamples: Record<string, number> = {};
  for (const enabled of [true, false]) {
    await settings(page, true);
    await toggle(page, '时间抗锯齿（TAA / TRAA）', enabled);
    await settings(page, false);
    await idle(page);
    const before = (await diagnostics(page)).frameCount;
    const started = Date.now();
    await cameraInteraction(page);
    frameSamples[enabled ? 'taaOn' : 'taaOff'] = (await diagnostics(page)).frameCount - before;
    frameSamples[`${enabled ? 'taaOn' : 'taaOff'}ElapsedMs`] = Date.now() - started;
  }
  evidence.frameSamples = frameSamples;
  await settings(page, true);
  await toggle(page, '时间抗锯齿（TAA / TRAA）', true);
  await toggle(page, '接触阴影（GTAO）', false);
  await settings(page, false);
  await idle(page);
  const gtaoOffBefore = (await diagnostics(page)).frameCount;
  const gtaoOffStarted = Date.now();
  await cameraInteraction(page);
  frameSamples.gtaoOff = (await diagnostics(page)).frameCount - gtaoOffBefore;
  frameSamples.gtaoOffElapsedMs = Date.now() - gtaoOffStarted;
  await settings(page, true);
  await toggle(page, '接触阴影（GTAO）', true);
  await settings(page, false);
  await idle(page);
  const gtaoOnBefore = (await diagnostics(page)).frameCount;
  const gtaoOnStarted = Date.now();
  await cameraInteraction(page);
  frameSamples.gtaoOn = (await diagnostics(page)).frameCount - gtaoOnBefore;
  frameSamples.gtaoOnElapsedMs = Date.now() - gtaoOnStarted;
  evidence.frameSamples = frameSamples;
  await settings(page, true);
  await toggle(page, '时间抗锯齿（TAA / TRAA）', true);
  await toggle(page, '接触阴影（GTAO）', true);
  await settings(page, false);
  await idle(page);
  await page.setViewportSize({ width: 1100, height: 700 });
  await idle(page);
  await waitPostProcessingStable(page);
  const resized = await diagnostics(page);
  expect(resized.render.postProcessing.available).toBe(true);
  evidence.resized = resized.render.postProcessing;
  evidence.resizedViewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio,
  }));
  const screenshot = testInfo.outputPath('realtime-postprocessing.png');
  await page.getByTestId('viewport-canvas').screenshot({ path: screenshot });
  evidence.screenshot = screenshot;
  expect(consoleErrors.filter((message) => /WebGLProgram|TSL|validation/i.test(message))).toEqual(
    [],
  );
  evidence.consoleErrors = consoleErrors;
  await mkdir(resolve(evidencePath('postprocessing')), { recursive: true });
  await writeFile(
    resolve(evidencePath('postprocessing/evidence.json')),
    `${JSON.stringify({ measuredAt: new Date().toISOString(), evidence }, null, 2)}\n`,
  );
});
