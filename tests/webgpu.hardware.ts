import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { ProjectDocument } from '@building/editor-core';
import type { ThreeRuntime } from '@building/three-runtime';

type Diagnostics = ReturnType<ThreeRuntime['diagnostics']>;
type Probe = {
  errors: string[];
  shaders: { label: string; code: string }[];
  features: string[];
  requests: { options: unknown; available: boolean; error?: string }[];
  textures: {
    label: string;
    width: number;
    height: number;
    depth: number;
    format: string;
    destroyed: boolean;
  }[];
};
type Instrumented = {
  __editor: {
    document(): ProjectDocument;
    diagnostics(): Diagnostics;
    project(point: { x: number; y: number; z: number }): { x: number; y: number };
  };
  __gpuProof: Probe;
};

const diagnostics = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.diagnostics());
const snapshot = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.document());
async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('actual WebGPU default environment compiles samples and exports PNG without missing samplers', async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    const proof: Probe = { errors: [], shaders: [], features: [], requests: [], textures: [] };
    (window as unknown as Instrumented).__gpuProof = proof;
    if (!navigator.gpu) {
      return;
    }
    const requestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
    navigator.gpu.requestAdapter = async (options) => {
      try {
        const adapter = await requestAdapter(options);
        proof.requests.push({ options, available: !!adapter });
        return adapter;
      } catch (error) {
        proof.requests.push({ options, available: false, error: String(error) });
        throw error;
      }
    };
    const createModule = GPUDevice.prototype.createShaderModule;
    const createdTextures = new WeakMap<GPUTexture, Probe['textures'][number]>();
    const createTexture = GPUDevice.prototype.createTexture;
    GPUDevice.prototype.createTexture = function (descriptor) {
      const texture = createTexture.call(this, descriptor);
      const record = {
        label: texture.label,
        width: texture.width,
        height: texture.height,
        depth: texture.depthOrArrayLayers,
        format: texture.format,
        destroyed: false,
      };
      createdTextures.set(texture, record);
      proof.textures.push(record);
      return texture;
    };
    const destroyTexture = GPUTexture.prototype.destroy;
    GPUTexture.prototype.destroy = function () {
      const record = createdTextures.get(this);
      if (record) {
        record.destroyed = true;
      }
      destroyTexture.call(this);
    };
    GPUDevice.prototype.createShaderModule = function (descriptor) {
      proof.shaders.push({ label: descriptor.label ?? '', code: descriptor.code });
      return createModule.call(this, descriptor);
    };
    const requestDevice = GPUAdapter.prototype.requestDevice;
    GPUAdapter.prototype.requestDevice = async function (descriptor) {
      let device: GPUDevice;
      try {
        device = await requestDevice.call(this, descriptor);
      } catch (error) {
        proof.errors.push(`requestDevice: ${String(error)}`);
        throw error;
      }
      proof.features = [...device.features];
      device.addEventListener('uncapturederror', (event) => {
        proof.errors.push(event.error.message);
      });
      return device;
    };
  });
  try {
    await page.goto('/');
    await page.waitForFunction(() => !!(window as unknown as Instrumented).__editor);
    const capability = await page.evaluate(async () => {
      const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
      return {
        adapter: !!adapter,
        vendor: adapter?.info.vendor,
        architecture: adapter?.info.architecture,
      };
    });
    expect(
      capability.adapter,
      'A real supported WebGPU adapter is required by this hardware suite',
    ).toBe(true);
    await page.getByRole('radio', { name: '墙体', exact: true }).click();
    for (const point of [
      { x: -2, y: 0, z: -1 },
      { x: 2, y: 0, z: -1 },
      { x: 2, y: 0, z: 1 },
    ]) {
      const projected = await page.evaluate(
        (point) => (window as unknown as Instrumented).__editor.project(point),
        point,
      );
      await page.mouse.click(projected.x, projected.y);
    }
    await page.keyboard.press('Escape');
    await page.getByRole('radio', { name: '选择', exact: true }).click();
    const projectDocument = await snapshot(page);
    expect(projectDocument.walls).toHaveLength(2);
    expect(projectDocument.environment?.resourceId).toBeUndefined();
    const initial = await diagnostics(page);
    await choose(page, '实时渲染器', 'WebGPU');
    await expect.poll(async () => (await diagnostics(page)).actualBackend).toBe('webgpu');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await choose(page, '目标采样数', '16');
    await page.getByRole('button', { name: '开始光追', exact: true }).click();
    await page.waitForFunction(
      () => {
        const state = (window as unknown as Instrumented).__editor.diagnostics();
        return (
          state.pathTracing.stats?.complete ||
          state.render.error ||
          (window as unknown as Instrumented).__gpuProof.errors.length > 0
        );
      },
      undefined,
      { timeout: 90000 },
    );
    const proof = await page.evaluate(() => (window as unknown as Instrumented).__gpuProof);
    expect(proof.errors, 'Actual GPU validation must succeed').toEqual([]);
    expect(proof.shaders.length).toBeGreaterThan(0);
    const environmentShaders = proof.shaders.filter((shader) =>
      /textureSampleLevel\([^\n]+,\s*uv,\s*0\s*\)\.rgb/.test(shader.code),
    );
    expect(environmentShaders.length).toBeGreaterThan(0);
    for (const shader of environmentShaders) {
      for (const match of shader.code.matchAll(
        /textureSampleLevel\(\s*\w+\s*,\s*(\w+_sampler)\s*,/g,
      )) {
        expect(shader.code).toMatch(new RegExp(`var\\s+${match[1]}\\s*:\\s*sampler\\s*;`));
      }
    }
    const complete = await diagnostics(page);
    expect(complete.render.error).toBeUndefined();
    expect(complete.pathTracing.stats).toMatchObject({ backend: 'webgpu', complete: true });
    expect(complete.pathTracing.stats!.minSamples).toBeGreaterThanOrEqual(16);
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await expect.poll(async () => (await diagnostics(page)).pathTracing.stats?.paused).toBe(true);
    const paused = (await diagnostics(page)).pathTracing.stats!.samples;
    await page.waitForTimeout(300);
    expect((await diagnostics(page)).pathTracing.stats!.samples).toBe(paused);
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await expect.poll(async () => (await diagnostics(page)).pathTracing.stats?.paused).toBe(false);
    expect(complete.sceneId).toBe(initial.sceneId);
    expect(complete.cameraId).toBe(initial.cameraId);
    expect(complete.pathTracing.auxiliaryObjects).toBe(0);
    expect(complete.pathTracing.displayMaterialOverrides).toBe(0);
    expect(await snapshot(page)).toEqual(projectDocument);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '保存渲染 PNG', exact: true }).click();
    const pngPath = testInfo.outputPath('actual-webgpu-default-environment.png');
    await (await download).saveAs(pngPath);
    const bytes = await readFile(pngPath);
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const pixels = await page.evaluate(
      async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const data = context.getImageData(0, 0, image.width, image.height).data;
        const colors = new Set<number>();
        for (let index = 0; index < data.length; index += 4) {
          colors.add((data[index]! << 16) | (data[index + 1]! << 8) | data[index + 2]!);
        }
        return { width: image.width, height: image.height, colors: colors.size };
      },
      `data:image/png;base64,${bytes.toString('base64')}`,
    );
    expect(pixels.width).toBeGreaterThan(500);
    expect(pixels.height).toBeGreaterThan(400);
    expect(pixels.colors).toBeGreaterThan(100);
    await page.getByRole('button', { name: '返回实时编辑', exact: true }).click();
    await expect.poll(async () => (await diagnostics(page)).pathTracing.activeSession).toBe(0);
    expect(await snapshot(page)).toEqual(projectDocument);
    await expect.poll(async () => (await diagnostics(page)).pendingFrame).toBe(false);
    const baseline = await diagnostics(page);
    const releasedCycles = [baseline];
    for (let cycle = 0; cycle < 2; cycle++) {
      await page.getByRole('button', { name: '开始光追', exact: true }).click();
      await page.waitForFunction(() => {
        const state = (window as unknown as Instrumented).__editor.diagnostics();
        return state.pathTracing.stats?.complete || state.render.error;
      });
      const sampled = await diagnostics(page);
      expect(sampled.render.error).toBeUndefined();
      expect(sampled.pathTracing.stats!.minSamples).toBeGreaterThanOrEqual(16);
      await page.getByRole('button', { name: '返回实时编辑', exact: true }).click();
      await expect.poll(async () => (await diagnostics(page)).pendingFrame).toBe(false);
      const released = await diagnostics(page);
      expect(released.pathTracing.activeSession).toBe(0);
      expect(released.pathTracing.cleanBuilding).toBe(false);
      expect(released.geometries).toBe(baseline.geometries);
      expect(released.textures).toBe(baseline.textures);
      releasedCycles.push(released);
    }
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await choose(page, '实时渲染器', 'WebGL');
    await expect.poll(async () => (await diagnostics(page)).actualBackend).toBe('webgl');
    await choose(page, '实时渲染器', 'WebGPU');
    await expect.poll(async () => (await diagnostics(page)).actualBackend).toBe('webgpu');
    const final = await diagnostics(page);
    expect(final.sceneId).toBe(initial.sceneId);
    expect(final.cameraId).toBe(initial.cameraId);
    expect(await snapshot(page)).toEqual(projectDocument);
    await expect(page.locator('canvas')).toHaveCount(1);
    expect(
      await page.evaluate(() => (window as unknown as Instrumented).__gpuProof.errors),
    ).toEqual([]);
    await writeFile(
      testInfo.outputPath('validated-samples.json'),
      JSON.stringify(
        {
          capability,
          complete,
          pixels,
          releasedCycles,
          final,
          environmentShaders: environmentShaders.length,
          consoleErrors,
        },
        null,
        2,
      ),
    );
  } finally {
    await mkdir(testInfo.outputDir, { recursive: true });
    const proof = await page
      .evaluate(() => (window as unknown as Instrumented).__gpuProof)
      .catch(() => null);
    await writeFile(
      testInfo.outputPath('gpu-validation.json'),
      JSON.stringify({ proof, consoleErrors }, null, 2),
    );
  }
});
