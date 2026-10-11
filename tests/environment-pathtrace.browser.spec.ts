import { test, expect, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { ProjectDocument } from '@building/editor-core';
import type { ThreeRuntime } from '@building/three-runtime';

type Diagnostics = ReturnType<ThreeRuntime['diagnostics']>;
interface BorrowedEnvironment {
  textureId: string;
  sourceId: string;
  version: number;
  sourceVersion: number;
  imageUrl: string;
  width: number;
  height: number;
  colorSpace: string;
  type: number;
  minFilter: number;
  magFilter: number;
  flipY: boolean;
  disposed: number;
}
type Instrumented = {
  __editor: {
    document(): ProjectDocument;
    diagnostics(): Diagnostics;
    project(point: { x: number; y: number; z: number }): { x: number; y: number };
  };
  __borrowedEnvironment(): BorrowedEnvironment | null;
};
const snapshot = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.document());
const diagnostics = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.diagnostics());
const borrowed = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__borrowedEnvironment());
async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
async function idle(page: Page) {
  await page.waitForFunction(() => {
    const state = (window as unknown as Instrumented).__editor.diagnostics();
    return !state.pendingFrame && !state.render.switching && !state.render.environmentLoading;
  });
}
async function clickWorld(page: Page, x: number, z: number) {
  const point = await page.evaluate(
    (point) => (window as unknown as Instrumented).__editor.project(point),
    { x, y: 0, z },
  );
  await page.mouse.click(point.x, point.y);
}

async function observeBorrowedEnvironment(page: Page) {
  // Observe the actual rendered scene and original texture's real dispose event. The renderer,
  // image decoder, path tracer, formal commands and texture pixels are never replaced.
  await page.evaluate(async () => {
    const moduleUrl = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((name) => /\/three\.js(?:\?|$)/.test(name));
    if (!moduleUrl) {
      throw new Error('The rendered Three.js module was not loaded');
    }
    const THREE = await import(moduleUrl);
    const original = THREE.Scene.prototype.onBeforeRender;
    let texture: import('three').Texture | null = null;
    let disposed = 0;
    THREE.Scene.prototype.onBeforeRender = function (
      this: import('three').Scene,
      renderer: import('three').WebGLRenderer,
      scene: import('three').Scene,
      camera: import('three').Camera,
      ...rest: unknown[]
    ) {
      original.call(this, renderer, scene, camera, ...rest);
      if (
        !texture &&
        scene.uuid === (window as unknown as Instrumented).__editor.diagnostics().sceneId &&
        scene.environment
      ) {
        texture = scene.environment;
        texture.addEventListener('dispose', () => {
          disposed++;
        });
      }
    };
    Object.assign(window, {
      __borrowedEnvironment: (): BorrowedEnvironment | null => {
        if (!texture) {
          return null;
        }
        const image = texture.image as HTMLImageElement;
        return {
          textureId: texture.uuid,
          sourceId: texture.source.uuid,
          version: texture.version,
          sourceVersion: texture.source.version,
          imageUrl: image.src,
          width: image.naturalWidth,
          height: image.naturalHeight,
          colorSpace: texture.colorSpace,
          type: texture.type,
          minFilter: texture.minFilter,
          magFilter: texture.magFilter,
          flipY: texture.flipY,
          disposed,
        };
      },
    });
  });
}

for (const format of [
  { mime: 'image/png', extension: 'png', signature: [137, 80, 78, 71, 13, 10, 26, 10] },
  { mime: 'image/jpeg', extension: 'jpg', signature: [255, 216, 255] },
]) {
  test(`actual ${format.mime} environment import traces 16 samples and preserves the borrowed image and project`, async ({
    page,
  }, testInfo) => {
    // The complete published shader compiles on the actual selected backend. Software WebGL
    // compilation can exceed a normal UI timeout; no error or unavailable GPU becomes a skip.
    test.setTimeout(180000);
    const backend = testInfo.config.metadata.rendererBackend === 'webgpu' ? 'webgpu' : 'webgl';
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.waitForFunction(() => !!(window as unknown as Instrumented).__editor);
    await observeBorrowedEnvironment(page);
    await page.getByRole('radio', { name: '墙体', exact: true }).click();
    await clickWorld(page, -2, -1);
    await clickWorld(page, 2, -1);
    await clickWorld(page, 2, 1);
    await page.keyboard.press('Escape');
    expect((await snapshot(page)).walls).toHaveLength(2);
    await page.getByRole('button', { name: '查看整栋', exact: true }).click();
    await idle(page);

    // Browser Canvas2D genuinely encodes the original 2:1 gradient. The file input, native
    // browser PNG/JPEG decoder and production path-tracing pixel conversion are all exercised.
    const dataUrl = await page.evaluate((mime) => {
      const canvas = window.document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 16;
      const context = canvas.getContext('2d')!;
      const image = context.createImageData(canvas.width, canvas.height);
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const index = (y * canvas.width + x) * 4;
          image.data[index] = 40 + Math.floor((190 * x) / (canvas.width - 1));
          image.data[index + 1] = 30 + Math.floor(180 * (1 - y / (canvas.height - 1)));
          image.data[index + 2] = 60 + Math.floor((140 * y) / (canvas.height - 1));
          image.data[index + 3] = 255;
        }
      }
      context.putImageData(image, 0, 0);
      const encoded = canvas.toDataURL(mime, 0.95);
      canvas.width = 0;
      canvas.height = 0;
      return encoded;
    }, format.mime);
    expect(dataUrl.startsWith(`data:${format.mime};base64,`)).toBe(true);
    const bytes = Buffer.from(dataUrl.split(',')[1]!, 'base64');
    expect([...bytes.subarray(0, format.signature.length)]).toEqual(format.signature);
    const file = testInfo.outputPath(`original-environment.${format.extension}`);
    await writeFile(file, bytes);
    if (backend === 'webgpu') {
      await choose(page, '实时渲染器', 'WebGPU');
      await idle(page);
      expect((await diagnostics(page)).actualBackend).toBe('webgpu');
      expect((await diagnostics(page)).render.error).toBeUndefined();
    }
    await page.getByRole('button', { name: '设置', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '导入全景贴图', exact: true }).click();
    await chooser;
    await page.locator('input[data-testid=environment-file-input]').setInputFiles(file);
    await expect.poll(async () => (await snapshot(page)).environmentResources?.length).toBe(1);
    await page.waitForFunction(() => {
      const state = (window as unknown as Instrumented).__editor.diagnostics();
      return !state.render.environmentLoading && !!state.environment.textureId;
    });
    await idle(page);
    await expect.poll(() => borrowed(page)).not.toBeNull();
    const document = await snapshot(page);
    const original = await borrowed(page);
    const initial = await diagnostics(page);
    expect(original).toMatchObject({ width: 32, height: 16, disposed: 0 });
    expect(initial.actualBackend).toBe(backend);
    expect(initial.render.error).toBeUndefined();
    expect(original!.textureId).toBe(initial.environment.textureId);
    const resource = document.environmentResources![0]!;
    expect(resource.mime).toBe(format.mime);
    expect(Buffer.from(resource.dataUrl.split(',')[1]!, 'base64')).toEqual(bytes);
    await choose(page, '目标采样数', '16');
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    const started = Date.now();
    await page.getByRole('button', { name: '开始光追', exact: true }).click();
    await page.waitForFunction(
      () => {
        const state = (window as unknown as Instrumented).__editor.diagnostics();
        return !!state.pathTracing.stats?.complete || !!state.render.error;
      },
      undefined,
      { timeout: 120000 },
    );
    const complete = await diagnostics(page);
    expect(complete.render.error).toBeUndefined();
    expect(complete.actualBackend).toBe(backend);
    expect(complete.pathTracing.activeSession).toBe(1);
    expect(complete.pathTracing.stats).toMatchObject({
      backend,
      ready: true,
      complete: true,
      targetSamples: 16,
    });
    expect(complete.pathTracing.stats!.minSamples).toBeGreaterThanOrEqual(16);
    expect(complete.pathTracing.stats!.samples).toBeGreaterThanOrEqual(16);
    expect(complete.pathTracing.auxiliaryObjects).toBe(0);
    expect(await borrowed(page)).toEqual(original);
    expect(await snapshot(page)).toEqual(document);
    await page.getByRole('button', { name: '返回实时编辑', exact: true }).click();
    await idle(page);
    const released = await diagnostics(page);
    expect(released.pathTracing.activeSession).toBe(0);
    expect(released.pathTracing.stats).toBeNull();
    expect(released.pathTracing.resources).toBeNull();
    expect(released.pathTracing.cleanBuilding).toBe(false);
    expect(released.pathTracing.meshes).toBe(0);
    expect(released.resources).toEqual(initial.resources);
    expect(released.bvh).toEqual(initial.bvh);
    expect(released.rendererId).toBe(initial.rendererId);
    expect(released.sceneId).toBe(initial.sceneId);
    expect(released.cameraId).toBe(initial.cameraId);
    expect(await borrowed(page)).toEqual(original);
    expect(await snapshot(page)).toEqual(document);
    expect(errors).toEqual([]);
    const report = {
      backend,
      platform:
        'Actual Chromium browser shader rendering; no native desktop or hardware claim beyond the selected test configuration',
      input: {
        mime: format.mime,
        width: 32,
        height: 16,
        path: file,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        originalLicense: 'CC0-1.0',
      },
      path: 'Actual mouse two-wall drawing → genuine browser PNG/JPEG encoding → real file input/decoding → actual target16/start → complete → return to realtime',
      elapsedMs: Date.now() - started,
      initial,
      complete,
      released,
      borrowedEnvironment: original,
      borrowedTextureAndSourceUnchanged: true,
      projectAndEmbeddedBytesUnchanged: true,
      decoderAndShaderUnmocked: true,
    };
    await writeFile(
      testInfo.outputPath(`environment-pathtrace-${format.extension}-${backend}-validation.json`),
      JSON.stringify(report, null, 2),
    );
  });
}
