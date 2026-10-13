import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ProjectDocument } from '@building/editor-core';
import type { ThreeRuntime } from '@building/three-runtime';
import { choose } from './browser-controls';
import { evidencePath } from './evidence-path';
import { hdrPanorama } from './environment-fixtures';

type Probe = {
  __editor: {
    document(): ProjectDocument;
    history(): { undoCount: number; redoCount: number };
    diagnostics(): ReturnType<ThreeRuntime['diagnostics']>;
    project(point: { x: number; y: number; z: number }): { x: number; y: number };
  };
  __backgroundGpuErrors: string[];
};
const diagnostics = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__editor.diagnostics());
const documentOf = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__editor.document());
const history = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__editor.history());

async function idle(page: Page) {
  await page.waitForFunction(() => {
    const state = (window as unknown as Probe).__editor.diagnostics();
    return !state.pendingFrame && !state.render.switching && !state.render.environmentLoading;
  });
}

/** Reads actual screenshot pixels; the histogram excludes no rendered colors or geometry. */
async function pixels(page: Page, bytes: Buffer) {
  return page.evaluate(
    async (bytes) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
      );
      const surface = document.createElement('canvas');
      surface.width = bitmap.width;
      surface.height = bitmap.height;
      const context = surface.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const data = context.getImageData(0, 0, surface.width, surface.height).data;
      const frequencies = new Map<string, number>();
      for (let offset = 0; offset < data.length; offset += 4) {
        const rgb = `${data[offset]},${data[offset + 1]},${data[offset + 2]}`;
        frequencies.set(rgb, (frequencies.get(rgb) ?? 0) + 1);
      }
      const [color, count] = [...frequencies].sort((a, b) => b[1] - a[1])[0]!;
      return {
        dominant: color.split(',').map(Number),
        dominantFraction: count / (data.length / 4),
        width: surface.width,
        height: surface.height,
      };
    },
    [...bytes],
  );
}

/** Captures the real primary Canvas after complete GPU work and retains pixels before assertions. */
async function capture(page: Page, name: string, testInfo: TestInfo) {
  await idle(page);
  const directory = evidencePath('webgpu-theme-background');
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, `${name}.png`);
  const png = await page.locator('.viewport canvas').screenshot({ path });
  const record = {
    name,
    path,
    theme: await page.locator('html').getAttribute('data-theme'),
    diagnostic: await diagnostics(page),
    pixels: await pixels(page, png),
  };
  await writeFile(resolve(directory, `${name}.json`), `${JSON.stringify(record, null, 2)}\n`);
  await testInfo.attach(name, { path, contentType: 'image/png' });
  return record;
}

test('hardware raster WebGPU preserves semantic theme background and formal panorama policy across real UI changes', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    const errors: string[] = [];
    (window as unknown as Probe).__backgroundGpuErrors = errors;
    if (typeof GPUAdapter === 'undefined') {
      return;
    }
    const request = GPUAdapter.prototype.requestDevice;
    GPUAdapter.prototype.requestDevice = async function (descriptor) {
      const device = await request.call(this, descriptor);
      device.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
      return device;
    };
  });
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Probe).__editor);
  const adapter = await page.evaluate(
    async () => !!(await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' })),
  );
  expect(adapter, 'This regression requires a real supported WebGPU adapter').toBe(true);
  await choose(page, '外观', '亮色');
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  for (const point of [
    { x: -2, y: 0, z: -1 },
    { x: 2, y: 0, z: -1 },
  ]) {
    const pixel = await page.evaluate(
      (point) => (window as unknown as Probe).__editor.project(point),
      point,
    );
    await page.mouse.click(pixel.x, pixel.y);
  }
  await page.keyboard.press('Escape');
  await page.getByRole('radio', { name: '选择', exact: true }).click();
  const formal = await documentOf(page),
    formalHistory = await history(page);
  expect(formal.walls).toHaveLength(1);
  const tokens = JSON.parse(
    await readFile(resolve('packages/ui/src/tokens/source.json'), 'utf8'),
  ) as Record<'light' | 'dark', Record<string, string>>;
  const expected = (theme: 'light' | 'dark') =>
    tokens[theme]!['viewport-background']!.slice(1)
      .match(/.{2}/g)!
      .map((channel) => Number.parseInt(channel, 16));
  const baseline = await capture(page, 'webgl-light-baseline', testInfo);
  expect(baseline.pixels.dominantFraction).toBeGreaterThan(0.2);
  expect(baseline.pixels.dominant).toEqual(expected('light'));
  await choose(page, '实时渲染器', 'WebGPU');
  await expect.poll(async () => (await diagnostics(page)).actualBackend).toBe('webgpu');
  const gpuLight = await capture(page, 'webgpu-light-default', testInfo);
  expect(gpuLight.pixels.dominantFraction).toBeGreaterThan(0.2);
  expect(gpuLight.pixels.dominant).toEqual(expected('light'));
  expect(gpuLight.pixels.dominant).toEqual(baseline.pixels.dominant);
  const rendererId = gpuLight.diagnostic.rendererId;
  await choose(page, '外观', '暗色');
  const gpuDark = await capture(page, 'webgpu-dark-theme', testInfo);
  expect(gpuDark.pixels.dominant).toEqual(expected('dark'));
  expect(gpuDark.diagnostic.rendererId).toBe(rendererId);
  await choose(page, '外观', '亮色');
  const gpuRestored = await capture(page, 'webgpu-light-restored', testInfo);
  expect(gpuRestored.pixels.dominant).toEqual(expected('light'));
  expect(gpuRestored.diagnostic.rendererId).toBe(rendererId);
  expect(await documentOf(page)).toEqual(formal);
  expect(await history(page)).toEqual(formalHistory);
  for (const [gtaoEnabled, taaEnabled] of [
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ] as const) {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page
      .getByRole('checkbox', { name: '接触阴影（GTAO）', exact: true })
      .setChecked(gtaoEnabled);
    await page
      .getByRole('checkbox', { name: '时间抗锯齿（TAA / TRAA）', exact: true })
      .setChecked(taaEnabled);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    const option = await capture(
      page,
      `webgpu-post-gtao-${Number(gtaoEnabled)}-taa-${Number(taaEnabled)}`,
      testInfo,
    );
    expect(option.pixels.dominant).toEqual(expected('light'));
    expect(option.diagnostic.rendererId).toBe(rendererId);
    expect(option.diagnostic.render.postProcessing).toMatchObject({
      gtao: gtaoEnabled,
      taa: taaEnabled,
    });
    expect(await documentOf(page)).toEqual(formal);
    expect(await history(page)).toEqual(formalHistory);
  }
  const directory = evidencePath('webgpu-theme-background');
  const panoramaPath = resolve(directory, 'actual-background-panorama.hdr');
  await writeFile(panoramaPath, hdrPanorama());
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '导入全景贴图', exact: true }).click();
  await (await chooser).setFiles(panoramaPath);
  await page.waitForFunction(() => {
    const state = (window as unknown as Probe).__editor.diagnostics();
    return !!state.environment.textureId && !state.render.environmentLoading;
  });
  await page.getByRole('checkbox', { name: '将全景显示为背景', exact: true }).uncheck();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  const environmentOff = await capture(page, 'webgpu-panorama-lighting-only', testInfo);
  expect(environmentOff.pixels.dominant).toEqual(expected('light'));
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('checkbox', { name: '将全景显示为背景', exact: true }).check();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  const environmentOn = await capture(page, 'webgpu-panorama-background', testInfo);
  expect(environmentOn.diagnostic.environment.background).toBe(true);
  expect(environmentOn.pixels.dominant).not.toEqual(expected('light'));
  const panoramaDocument = await documentOf(page),
    panoramaHistory = await history(page);
  await choose(page, '外观', '暗色');
  const panoramaDark = await capture(page, 'webgpu-panorama-preserved-after-theme', testInfo);
  expect(panoramaDark.diagnostic.rendererId).toBe(rendererId);
  expect(panoramaDark.diagnostic.environment.textureId).toBe(
    environmentOn.diagnostic.environment.textureId,
  );
  expect(panoramaDark.diagnostic.environment.background).toBe(true);
  expect(panoramaDark.pixels.dominant).toEqual(environmentOn.pixels.dominant);
  expect(await documentOf(page)).toEqual(panoramaDocument);
  expect(await history(page)).toEqual(panoramaHistory);
  await choose(page, '实时渲染器', 'WebGL');
  await expect.poll(async () => (await diagnostics(page)).actualBackend).toBe('webgl');
  await idle(page);
  expect(await documentOf(page)).toEqual(panoramaDocument);
  expect(await history(page)).toEqual(panoramaHistory);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as Probe).__backgroundGpuErrors)).toEqual([]);
});
