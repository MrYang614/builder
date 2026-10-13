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
    diagnostics(): ReturnType<ThreeRuntime['diagnostics']>;
    project(point: { x: number; y: number; z: number }): { x: number; y: number };
  };
  __lightingGpuErrors: string[];
};
const diagnostics = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__editor.diagnostics());

/** Replicates the same legal RGBE pixels at PMREM's minimum supported panorama size. */
function controlPanorama(): Uint8Array {
  const data = Buffer.alloc(64 * 32 * 4);
  const source = hdrPanorama().slice(-32);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 64; x++) {
      const offset = (Math.floor(y / 16) * 4 + Math.floor(x / 16)) * 4;
      data.set(source.slice(offset, offset + 4), (y * 64 + x) * 4);
    }
  }
  return Buffer.concat([Buffer.from('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 32 +X 64\n'), data]);
}

async function idle(page: Page) {
  await page.waitForFunction(() => {
    const state = (window as unknown as Probe).__editor.diagnostics();
    return !state.pendingFrame && !state.render.switching && !state.render.environmentLoading;
  });
}

/** Imports a real file through Settings, preserving the original formal bytes and dimensions. */
async function importPanorama(page: Page, path: string, width: number, height: number) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '导入全景贴图', exact: true }).click();
  await (await chooser).setFiles(path);
  await expect
    .poll(async () => (await diagnostics(page)).environment.textureName)
    .toBe(path.split(/[\\/]/).at(-1));
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await idle(page);
  expect((await diagnostics(page)).environment).toMatchObject({ width, height });
  const document = await page.evaluate(() => (window as unknown as Probe).__editor.document());
  const resource = document.environmentResources!.find(
    (resource) => resource.id === document.environment!.resourceId,
  )!;
  expect(Buffer.from(resource.dataUrl.split(',')[1]!, 'base64')).toEqual(await readFile(path));
}

/** Samples the real wall face in an actual screenshot; no renderer, texture or pixel is replaced. */
async function captureWall(page: Page, name: string, testInfo: TestInfo) {
  await idle(page);
  const directory = evidencePath('tiny-environment-lighting');
  const path = resolve(directory, `${name}.png`);
  const canvas = page.locator('.viewport canvas');
  const bounds = (await canvas.boundingBox())!;
  const center = await page.evaluate(
    (point) => (window as unknown as Probe).__editor.project(point),
    { x: 0, y: 1.4, z: -1 },
  );
  const bytes = await canvas.screenshot({ path });
  const pixel = await page.evaluate(
    async ({ bytes, x, y }) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
      );
      const surface = document.createElement('canvas');
      surface.width = bitmap.width;
      surface.height = bitmap.height;
      const context = surface.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const region = context.getImageData(Math.round(x) - 2, Math.round(y) - 2, 5, 5).data;
      const rgb = [0, 0, 0];
      for (let index = 0; index < region.length; index += 4) {
        for (let channel = 0; channel < 3; channel++) {
          rgb[channel]! += region[index + channel]! / 25;
        }
      }
      return { rgb, x, y, region: '5x5 wall-face center' };
    },
    { bytes: [...bytes], x: center.x - bounds.x, y: center.y - bounds.y },
  );
  const record = { name, path, pixel, diagnostic: await diagnostics(page) };
  await writeFile(resolve(directory, `${name}.json`), `${JSON.stringify(record, null, 2)}\n`);
  await testInfo.attach(name, { path, contentType: 'image/png' });
  return record;
}

test('legal 4x2 HDR lights the actual wall on WebGL and WebGPU alongside the 64x32 control', async ({
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
    (window as unknown as Probe).__lightingGpuErrors = errors;
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
  const walls = await page.evaluate(() => (window as unknown as Probe).__editor.document().walls);
  expect(walls).toHaveLength(1);
  const directory = evidencePath('tiny-environment-lighting');
  await mkdir(directory, { recursive: true });
  const controlPath = resolve(directory, 'same-rgbe-64x32.hdr');
  const tinyPath = resolve(directory, 'same-rgbe-4x2.hdr');
  await writeFile(controlPath, controlPanorama());
  await writeFile(tinyPath, hdrPanorama());
  const actuals = [];
  for (const backend of ['WebGL', 'WebGPU'] as const) {
    await choose(page, '实时渲染器', backend);
    await expect
      .poll(async () => (await diagnostics(page)).actualBackend)
      .toBe(backend.toLowerCase());
    const rendererId = (await diagnostics(page)).rendererId;
    await importPanorama(page, controlPath, 64, 32);
    const control = await captureWall(page, `${backend.toLowerCase()}-64x32-control`, testInfo);
    await importPanorama(page, tinyPath, 4, 2);
    const tiny = await captureWall(page, `${backend.toLowerCase()}-4x2-lighting`, testInfo);
    expect(control.diagnostic.rendererId).toBe(rendererId);
    expect(tiny.diagnostic.rendererId).toBe(rendererId);
    expect(
      await page.evaluate(() => (window as unknown as Probe).__editor.document().walls),
    ).toEqual(walls);
    actuals.push({ backend, control: control.pixel, tiny: tiny.pixel });
  }
  await writeFile(
    resolve(directory, 'actual-lighting.json'),
    `${JSON.stringify({ actuals, errors }, null, 2)}\n`,
  );
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as Probe).__lightingGpuErrors)).toEqual([]);
  // Same camera, wall material and HDR energy: an original small image must not become black.
  for (const { backend, control, tiny } of actuals) {
    expect(
      Math.max(...control.rgb),
      `${backend} control wall must receive image-based lighting`,
    ).toBeGreaterThan(16);
    expect(
      Math.max(...tiny.rgb),
      `${backend} 4x2 wall must receive image-based lighting`,
    ).toBeGreaterThan(16);
  }
});
