import { expect, test, type Page } from '@playwright/test';
import { startPathTracing } from './render-controls';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import type { ProjectDocument } from '@building/editor-core';
import type { ThreeRuntime } from '@building/three-runtime';

type Diagnostics = ReturnType<ThreeRuntime['diagnostics']>;
interface Injection {
  label: string;
  originalSampler: string;
  originalCode: string;
  injectedCode: string;
}
interface GPUErrorProof {
  injection: Injection | null;
  injectionCount: number;
  moduleCount: number;
  features: string[];
  errors: { name: string; message: string }[];
}
interface Instrumented {
  __editor: {
    document(): ProjectDocument;
    diagnostics(): Diagnostics;
    project(point: { x: number; y: number; z: number }): { x: number; y: number };
  };
  __gpuErrorProof: GPUErrorProof;
}

const diagnostics = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.diagnostics());
const snapshot = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.document());
async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('a real invalid WebGPU environment shader stops sampling, preserves its first error and recovers on retry', async ({
  page,
}, testInfo) => {
  test.setTimeout(180000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const proof: GPUErrorProof = {
      injection: null,
      injectionCount: 0,
      moduleCount: 0,
      features: [],
      errors: [],
    };
    (window as unknown as Instrumented).__gpuErrorProof = proof;
    if (!navigator.gpu) {
      return;
    }
    const createModule = GPUDevice.prototype.createShaderModule;
    GPUDevice.prototype.createShaderModule = function (descriptor) {
      proof.moduleCount++;
      const environmentCall =
        /(textureSampleLevel\(\s*\w+\s*,\s*)(\w+_sampler)(\s*,\s*uv\s*,\s*0\s*\)\.rgb)/.exec(
          descriptor.code,
        );
      if (!proof.injection && /@compute\b/.test(descriptor.code) && environmentCall) {
        const injectedCall =
          environmentCall[1]! + 'intentionallyMissingEnvironmentSampler' + environmentCall[3]!;
        const injectedCode =
          descriptor.code.slice(0, environmentCall.index) +
          injectedCall +
          descriptor.code.slice(environmentCall.index + environmentCall[0].length);
        proof.injection = {
          label: descriptor.label ?? '',
          originalSampler: environmentCall[2]!,
          originalCode: descriptor.code,
          injectedCode,
        };
        proof.injectionCount++;
        // Submit through the genuine device: no fake module, GPU error, runtime or status callback.
        return createModule.call(this, { ...descriptor, code: injectedCode });
      }
      return createModule.call(this, descriptor);
    };
    const requestDevice = GPUAdapter.prototype.requestDevice;
    GPUAdapter.prototype.requestDevice = async function (descriptor) {
      const device = await requestDevice.call(this, descriptor);
      proof.features = [...device.features];
      device.addEventListener('uncapturederror', (event) => {
        proof.errors.push({ name: event.error.constructor.name, message: event.error.message });
      });
      return device;
    };
  });

  let evidence: Record<string, unknown> = {
    scope: 'Actual hardware WebGPU browser; no native desktop or macOS inference',
    status: 'incomplete',
    fault: 'One environment compute sampler identifier changed before genuine createShaderModule',
  };
  try {
    await page.goto('/');
    await page.waitForFunction(() => !!(window as unknown as Instrumented).__editor);
    const capability = await page.evaluate(async () => {
      const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
      return {
        adapter: !!adapter,
        vendor: adapter?.info.vendor,
        architecture: adapter?.info.architecture,
        device: adapter?.info.device,
        description: adapter?.info.description,
      };
    });
    evidence.capability = capability;
    expect(capability.adapter, 'This suite requires a real supported WebGPU adapter').toBe(true);

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
    const document = await snapshot(page);
    expect(document.walls).toHaveLength(2);
    expect(document.environment?.resourceId).toBeUndefined();
    const initial = await diagnostics(page);
    evidence.initial = initial;
    evidence.documentBefore = document;

    await choose(page, '实时渲染器', 'WebGPU');
    await page.waitForFunction(() => {
      const state = (window as unknown as Instrumented).__editor.diagnostics();
      return !state.render.switching;
    });
    expect((await diagnostics(page)).actualBackend).toBe('webgpu');
    await startPathTracing(page, 16);
    await page.waitForFunction(
      () => {
        const state = (window as unknown as Instrumented).__editor.diagnostics();
        return state.render.mode === 'raster' && state.render.pathStatus === 'error';
      },
      undefined,
      { timeout: 90000 },
    );
    const errorAlert = page.getByRole('alert').filter({ hasText: /无法启动光追/ });
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText('intentionallyMissingEnvironmentSampler');
    const firstAlert = await errorAlert.innerText();
    const proof = await page.evaluate(() => (window as unknown as Instrumented).__gpuErrorProof);
    expect(proof.injectionCount).toBe(1);
    expect(proof.injection).not.toBeNull();
    expect(proof.injection!.originalCode).toMatch(
      new RegExp(`var\\s+${proof.injection!.originalSampler}\\s*:\\s*sampler\\s*;`),
    );
    expect(proof.injection!.originalCode).not.toContain('intentionallyMissingEnvironmentSampler');
    expect([
      ...proof.injection!.injectedCode.matchAll(/intentionallyMissingEnvironmentSampler/g),
    ]).toHaveLength(1);
    expect(proof.errors[0]?.name).toBe('GPUValidationError');
    expect(proof.errors[0]?.message).toContain('intentionallyMissingEnvironmentSampler');
    expect(proof.errors[0]?.message).toMatch(/unresolved value|undeclared identifier/i);
    evidence.firstGPUError = proof.errors[0];
    evidence.firstVisibleError = firstAlert;
    const failed = await diagnostics(page);
    expect(failed).toMatchObject({
      actualBackend: 'webgpu',
      render: { mode: 'raster', pathStatus: 'error', error: 'render.pathFailed' },
      pathTracing: { activeSession: 0, cleanBuilding: false, stats: null },
    });
    expect(failed.sceneId).toBe(initial.sceneId);
    expect(failed.cameraId).toBe(initial.cameraId);
    expect(await snapshot(page)).toEqual(document);
    evidence.failed = failed;

    // Observe real browser frames after the error's raster redraw, without invoking runtime methods.
    await expect.poll(async () => (await diagnostics(page)).pendingFrame).toBe(false);
    const settled = await diagnostics(page);
    await page.evaluate(async () => {
      for (let frame = 0; frame < 8; frame++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    });
    const afterFrames = await diagnostics(page);
    expect(afterFrames.frameCount).toBe(settled.frameCount);
    expect(afterFrames.pendingFrame).toBe(false);
    expect(afterFrames.render.samples).toBe(settled.render.samples);
    expect(afterFrames.pathTracing).toEqual(settled.pathTracing);
    expect(afterFrames.render).toEqual(settled.render);
    expect(await errorAlert.innerText()).toBe(firstAlert);
    expect(await snapshot(page)).toEqual(document);
    evidence.afterEightBrowserFrames = afterFrames;
    const errorsBeforeRetry = await page.evaluate(
      () => (window as unknown as Instrumented).__gpuErrorProof.errors.length,
    );

    await startPathTracing(page);
    await page.waitForFunction(
      () => {
        const state = (window as unknown as Instrumented).__editor.diagnostics();
        return state.pathTracing.stats?.complete || !!state.render.error;
      },
      undefined,
      { timeout: 90000 },
    );
    const recovered = await diagnostics(page);
    expect(recovered.actualBackend).toBe('webgpu');
    expect(recovered.render.error).toBeUndefined();
    expect(recovered.render).toMatchObject({ mode: 'pathtrace', pathStatus: 'complete' });
    expect(recovered.pathTracing.stats).toMatchObject({
      backend: 'webgpu',
      complete: true,
      targetSamples: 16,
    });
    expect(recovered.pathTracing.stats!.minSamples).toBeGreaterThanOrEqual(16);
    expect(recovered.pathTracing.activeSession).toBe(1);
    expect(recovered.sceneId).toBe(initial.sceneId);
    expect(recovered.cameraId).toBe(initial.cameraId);
    expect(await snapshot(page)).toEqual(document);
    const recoveredProof = await page.evaluate(
      () => (window as unknown as Instrumented).__gpuErrorProof,
    );
    expect(recoveredProof.injectionCount).toBe(1);
    expect(recoveredProof.errors).toHaveLength(errorsBeforeRetry);
    evidence.recovered = recovered;
    evidence.gpuErrorsBeforeRetry = errorsBeforeRetry;
    evidence.gpuErrorsAfterSuccessfulRetry = recoveredProof.errors.length;

    await page.getByRole('button', { name: '返回实时编辑', exact: true }).click();
    await expect.poll(async () => (await diagnostics(page)).pathTracing.activeSession).toBe(0);
    expect((await diagnostics(page)).render.mode).toBe('raster');
    expect(await snapshot(page)).toEqual(document);
    await page.getByRole('button', { name: '墙体 1', exact: true }).click();
    const lengthInput = page.getByLabel('轴线长度（m）', { exact: true });
    await lengthInput.fill('4.4');
    await lengthInput.press('Enter');
    const edited = await snapshot(page);
    expect(edited.walls).toHaveLength(2);
    expect(edited.walls[0]!.id).toBe(document.walls[0]!.id);
    expect(
      Math.hypot(
        edited.walls[0]!.end.x - edited.walls[0]!.start.x,
        edited.walls[0]!.end.z - edited.walls[0]!.start.z,
      ),
    ).toBeCloseTo(4.4, 5);
    expect(edited.revision).toBe(document.revision + 1);
    await expect(page.locator('canvas')).toHaveCount(1);
    expect(pageErrors).toEqual([]);
    evidence = {
      ...evidence,
      status: 'passed',
      documentUnchangedByFailureAndRetry: true,
      noAdditionalSamplingAfterError: true,
      formalEditingAfterRecovery: edited,
      final: await diagnostics(page),
    };
  } finally {
    await mkdir(testInfo.outputDir, { recursive: true });
    const proof = await page
      .evaluate(() => (window as unknown as Instrumented).__gpuErrorProof)
      .catch(() => null);
    let shaderEvidence: Record<string, unknown> | null = null;
    if (proof?.injection) {
      const { originalCode, injectedCode, ...metadata } = proof.injection;
      const originalFile = testInfo.outputPath('original-environment-compute.wgsl');
      const injectedFile = testInfo.outputPath('injected-environment-compute.wgsl');
      await writeFile(originalFile, originalCode);
      await writeFile(injectedFile, injectedCode);
      shaderEvidence = {
        ...metadata,
        originalFile,
        injectedFile,
        originalSha256: createHash('sha256').update(originalCode).digest('hex'),
        injectedSha256: createHash('sha256').update(injectedCode).digest('hex'),
      };
    }
    await writeFile(
      testInfo.outputPath('webgpu-error-recovery.json'),
      JSON.stringify(
        {
          ...evidence,
          browserVersion: page.context().browser()?.version(),
          shaderEvidence,
          injectionCount: proof?.injectionCount,
          moduleCount: proof?.moduleCount,
          features: proof?.features,
          actualGPUErrors: proof?.errors,
          actualFirstGPUError: proof?.errors[0] ?? null,
          consoleErrors,
          pageErrors,
        },
        null,
        2,
      ),
    );
  }
});
