import { evidencePath } from './evidence-path';
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { FloatType } from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { validateBytes } from 'gltf-validator';
import type { ProjectDocument } from '@building/editor-core';
import type { ThreeRuntime } from '@building/three-runtime';

type Diagnostics = ReturnType<ThreeRuntime['diagnostics']>;
type Instrumented = {
  __editor: {
    document(): ProjectDocument;
    diagnostics(): Diagnostics;
    history(): { undoCount: number; redoCount: number };
    project(point: { x: number; y: number; z: number }): { x: number; y: number };
  };
};
const snapshot = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.document());
const diagnostics = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.diagnostics());
const history = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.history());

async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
async function setNumber(page: Page, label: string, value: number) {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(String(value));
  await input.press('Enter');
}
async function settings(page: Page, open: boolean) {
  await page.getByRole('button', { name: open ? '设置' : '关闭', exact: true }).click();
  if (open) {
    await expect(page.getByRole('dialog')).toBeVisible();
  } else {
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
}
async function idle(page: Page) {
  await page.waitForFunction(() => {
    const state = (window as unknown as Instrumented).__editor.diagnostics();
    return !state.pendingFrame && !state.render.switching && !state.render.environmentLoading;
  });
}
async function clickWorld(page: Page, x: number, z: number, y = 0) {
  const point = await page.evaluate(
    (point) => (window as unknown as Instrumented).__editor.project(point),
    { x, y, z },
  );
  await page.mouse.click(point.x, point.y);
}

/** The model is drawn through real tools; it is not installed with a document command. */
async function drawBuilding(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Instrumented).__editor);
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await clickWorld(page, -2, -1);
  await clickWorld(page, 2, -1);
  await clickWorld(page, 2, 1);
  await page.keyboard.press('Escape');
  await page.getByRole('radio', { name: '楼板', exact: true }).click();
  await clickWorld(page, -2, -1);
  await clickWorld(page, 2, 1);
  await page.keyboard.press('Escape');
  await page.getByRole('radio', { name: '门', exact: true }).click();
  await clickWorld(page, -0.83, -0.9, 1.13);
  await page.getByRole('radio', { name: '选择', exact: true }).click();
  const document = await snapshot(page);
  expect(document.walls).toHaveLength(2);
  expect(document.slabs).toHaveLength(1);
  expect(document.openings).toHaveLength(1);
  await page.getByRole('button', { name: '查看整栋', exact: true }).click();
  await idle(page);
  return document;
}

/**
 * Original deterministic 32×16 linear panorama, encoded with genuine RGBE pixels and
 * four-channel scanline literal RLE. Radiance format: header + dimensions + complete payload.
 * https://floyd.lbl.gov/radiance/refer/Notes/picture_format.html
 * The real Three HDRLoader decodes it before it is used by the actual file-input path.
 */
async function panorama(testInfo: TestInfo) {
  const width = 32;
  const height = 16;
  const payload: number[] = [];
  for (let y = 0; y < height; y++) {
    const pixels: number[][] = [];
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      const v = y / (height - 1);
      const sun = 4 * Math.exp(-((u - 0.27) ** 2 + (v - 0.28) ** 2) / 0.025);
      const rgb = [0.12 + 0.8 * u + sun, 0.18 + 0.8 * (1 - v) + sun * 0.7, 0.22 + v + sun * 0.3];
      const exponent = Math.floor(Math.log2(Math.max(...rgb))) + 1;
      const scale = 256 / 2 ** exponent;
      pixels.push([...rgb.map((value) => Math.floor(value * scale)), exponent + 128]);
    }
    payload.push(2, 2, width >> 8, width & 255);
    for (let channel = 0; channel < 4; channel++) {
      payload.push(width, ...pixels.map((pixel) => pixel[channel]!));
    }
  }
  const header = new TextEncoder().encode(
    [
      '#?RADIANCE',
      '# Original procedural browser test panorama',
      'FORMAT=32-bit_rle_rgbe',
      '',
      `-Y ${height} +X ${width}`,
      '',
    ].join('\n'),
  );
  const bytes = new Uint8Array(header.length + payload.length);
  bytes.set(header);
  bytes.set(payload, header.length);
  const decoded = new HDRLoader().setDataType(FloatType).parse(bytes.buffer);
  expect(decoded.width).toBe(width);
  expect(decoded.height).toBe(height);
  expect(decoded.data).toHaveLength(width * height * 4);
  if (!decoded.data) {
    throw new Error('Real HDRLoader did not return panorama pixels');
  }
  const range = [Math.min(...decoded.data), Math.max(...decoded.data)];
  expect(range[0]).toBeGreaterThan(0);
  expect(range[1]).toBeGreaterThan(1);
  const file = testInfo.outputPath('original panorama/environment-panorama.hdr');
  await mkdir(resolve(file, '..'), { recursive: true });
  await writeFile(file, bytes);
  return {
    file,
    bytes,
    width,
    height,
    range,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function importPanorama(page: Page, file: string) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '导入全景贴图', exact: true }).click();
  await chooser;
  const input = page.locator('input[data-testid=environment-file-input]');
  await expect(input).toHaveCount(1);
  await input.setInputFiles(file);
  await expect.poll(async () => (await snapshot(page)).environmentResources?.length).toBe(1);
  await page.waitForFunction(() => {
    const d = (window as unknown as Instrumented).__editor.diagnostics();
    return !d.render.environmentLoading && !!d.environment.textureId;
  });
}
async function actualDownload(page: Page, button: string, file: string) {
  const wait = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  await (await wait).saveAs(file);
  return readFile(file);
}
async function evidence(name: string, value: unknown, testInfo: TestInfo) {
  const content = JSON.stringify(value, null, 2);
  await writeFile(testInfo.outputPath(`${name}.json`), content);
  await mkdir(evidencePath('theme-toggle/evidence'), { recursive: true });
  await writeFile(evidencePath(`theme-toggle/evidence/${name}.json`), content);
}

test('real HDR environment import settings history and portable project roundtrip leave GLB clean', async ({
  page,
}, testInfo) => {
  const document = await drawBuilding(page);
  const initial = await diagnostics(page);
  const fixture = await panorama(testInfo);
  const count = (await history(page)).undoCount;
  await settings(page, true);
  await importPanorama(page, fixture.file);
  expect((await history(page)).undoCount).toBe(count + 1);
  await setNumber(page, '环境强度', 1.7);
  await setNumber(page, '环境旋转（°）', 123);
  await page.getByRole('checkbox', { name: '将全景显示为背景', exact: true }).check();
  const changed = await snapshot(page);
  const environmentId = changed.environmentResources![0]!.id;
  expect(changed.environment).toEqual({
    resourceId: environmentId,
    intensity: 1.7,
    rotation: 123,
    background: true,
  });
  const applied = await diagnostics(page);
  expect(applied.environment).toMatchObject({
    resourceId: environmentId,
    width: 32,
    height: 16,
    intensity: 1.7,
    background: true,
  });
  expect(applied.environment.rotation).toBeCloseTo((123 * Math.PI) / 180, 8);
  await settings(page, false);
  for (let index = 0; index < 4; index++) {
    await page.getByRole('button', { name: '撤销', exact: true }).click();
  }
  const undone = await snapshot(page);
  expect(undone).toEqual({ ...document, revision: changed.revision + 4 });
  for (let index = 0; index < 4; index++) {
    await page.getByRole('button', { name: '重做', exact: true }).click();
  }
  const restored = await snapshot(page);
  expect(restored.revision).toBe(changed.revision + 8);
  expect(restored).toEqual({ ...changed, revision: changed.revision + 8 });
  await idle(page);
  const projectFile = testInfo.outputPath('moved folder 中文/portable-environment.building');
  const saved = await actualDownload(page, '保存', projectFile);
  const zip = unzipSync(saved);
  const embeddedNames = Object.keys(zip).filter((name) =>
    name.startsWith('environment-resources/'),
  );
  expect(embeddedNames).toHaveLength(1);
  expect(zip[embeddedNames[0]!]).toEqual(fixture.bytes);
  expect(embeddedNames[0]).toContain(fixture.sha256);
  await unlink(fixture.file);
  await page.getByRole('button', { name: '新建', exact: true }).click();
  expect((await snapshot(page)).id).not.toBe(document.id);
  await page.waitForFunction(
    () => !(window as unknown as Instrumented).__editor.diagnostics().environment.textureId,
  );
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await (await chooser).setFiles(projectFile);
  await expect(page.getByText('工程已打开', { exact: true })).toBeVisible();
  expect(await snapshot(page)).toEqual(restored);
  await page.waitForFunction(() => {
    const d = (window as unknown as Instrumented).__editor.diagnostics();
    return !!d.environment.textureId && !d.render.environmentLoading;
  });
  const reopened = await diagnostics(page);
  expect(reopened.environment).toMatchObject({
    resourceId: environmentId,
    width: 32,
    height: 16,
    intensity: 1.7,
    background: true,
  });
  expect(reopened.sceneId).toBe(initial.sceneId);
  expect(reopened.cameraId).toBe(initial.cameraId);
  const glb = await actualDownload(
    page,
    '导出 GLB',
    testInfo.outputPath('clean-environment-building.glb'),
  );
  const validator = await validateBytes(glb, { uri: 'clean-environment-building.glb' });
  expect(validator.issues.numErrors).toBe(0);
  expect(validator.issues.numWarnings).toBe(0);
  const jsonLength = new DataView(glb.buffer, glb.byteOffset, glb.byteLength).getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))) as {
    nodes: { name?: string; extras?: Record<string, unknown> }[];
    images?: unknown[];
  };
  expect(JSON.stringify(json)).not.toContain(environmentId);
  expect(JSON.stringify(json)).not.toContain('environment-panorama');
  expect(json.images ?? []).toEqual([]);
  expect(
    json.nodes.some((node) => /grid|selection|preview|boundsTree|snap/i.test(node.name ?? '')),
  ).toBe(false);
  const loader = `/@fs/${resolve('node_modules/three/examples/jsm/loaders/GLTFLoader.js').replaceAll('\\', '/')}`;
  const independent = await page.evaluate(
    async ({ loader, bytes }) => {
      const { GLTFLoader } = await import(loader);
      const loaded = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
      const names: string[] = [];
      loaded.scene.traverse((object: import('three').Object3D) => names.push(object.name));
      return {
        animations: loaded.animations.map((clip: import('three').AnimationClip) => clip.name),
        names,
        environment: loaded.scene.environment?.uuid ?? null,
        background: loaded.scene.background ?? null,
      };
    },
    { loader, bytes: [...glb] },
  );
  expect(independent.environment).toBeNull();
  expect(independent.background).toBeNull();
  expect(independent.animations).toHaveLength(2);
  expect(await snapshot(page)).toEqual(restored);
  await evidence(
    'rendering-environment-validation',
    {
      platform: 'Windows Chromium browser; no native or macOS inference',
      path: 'Actual mouse building → settings file input HDR import → intensity/rotation/background → four undo/redo commands → actual ZIP download → delete original HDR → New/Open moved saved ZIP → actual GLB download and independent GLTFLoader',
      fixture: {
        width: fixture.width,
        height: fixture.height,
        decodedLinearRange: fixture.range,
        bytes: fixture.bytes.length,
        sha256: fixture.sha256,
      },
      embeddedNames,
      originalHDRDeleted: true,
      historyRevisions: {
        configured: changed.revision,
        undone: undone.revision,
        restored: restored.revision,
      },
      initial,
      applied,
      reopened,
      validator: { errors: validator.issues.numErrors, warnings: validator.issues.numWarnings },
      independent,
      formalDocumentUnchangedByExport: true,
    },
    testInfo,
  );
});

test('actual UI renderer switch preserves scene camera and editable data or exposes an honest WebGPU failure', async ({
  page,
}, testInfo) => {
  const document = await drawBuilding(page);
  const initial = await diagnostics(page);
  const capability = await page.evaluate(async () => {
    if (!navigator.gpu) {
      return { api: false, adapter: false };
    }
    const adapter = await navigator.gpu.requestAdapter();
    return {
      api: true,
      adapter: !!adapter,
      info: adapter?.info
        ? {
            vendor: adapter.info.vendor,
            architecture: adapter.info.architecture,
            device: adapter.info.device,
            description: adapter.info.description,
          }
        : null,
    };
  });
  await choose(page, '实时渲染器', 'WebGPU');
  await page.waitForFunction(
    () => !(window as unknown as Instrumented).__editor.diagnostics().render.switching,
    undefined,
    { timeout: 60000 },
  );
  const requested = await diagnostics(page);
  const succeeded = requested.actualBackend === 'webgpu';
  if (succeeded) {
    expect(requested.render.backend).toBe('webgpu');
    expect(requested.rendererId).not.toBe(initial.rendererId);
    expect(requested.render.error).toBeUndefined();
    await idle(page);
    await page.screenshot({ path: testInfo.outputPath('actual-webgpu.png') });
    await choose(page, '实时渲染器', 'WebGL');
    await page.waitForFunction(() => {
      const d = (window as unknown as Instrumented).__editor.diagnostics();
      return d.actualBackend === 'webgl' && !d.render.switching;
    });
  } else {
    expect(requested.actualBackend).toBe('webgl');
    expect(requested.render.backend).toBe('webgl');
    expect(requested.rendererId).toBe(initial.rendererId);
    await expect(
      page.getByRole('alert').filter({ hasText: '此设备无法启动 WebGPU' }),
    ).toBeVisible();
  }
  const final = await diagnostics(page);
  expect(final.sceneId).toBe(initial.sceneId);
  expect(final.cameraId).toBe(initial.cameraId);
  expect(final.camera).toEqual(initial.camera);
  expect(await snapshot(page)).toEqual(document);
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();
  await setNumber(page, '轴线长度（m）', 4.4);
  expect(
    Math.hypot(
      (await snapshot(page)).walls[0]!.end.x - document.walls[0]!.start.x,
      (await snapshot(page)).walls[0]!.end.z - document.walls[0]!.start.z,
    ),
  ).toBeCloseTo(4.4, 5);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect(await snapshot(page)).toEqual({ ...document, revision: document.revision + 2 });
  await evidence(
    'rendering-backend-validation',
    {
      platform: 'Windows Chromium browser; actual device result recorded',
      capability,
      webgpu: succeeded
        ? 'actual WebGPU initialization and rendered screenshot verified'
        : 'unavailable initialization; visible error and retained editable WebGL verified, WebGPU rendering remains unverified',
      initial,
      requested,
      final,
      selectionAndFormalEditAfterSwitchPassed: true,
    },
    testInfo,
  );
});

test('real WebGL path tracing reaches 16 samples pauses resumes downloads a nonuniform clean PNG and releases three cycles', async ({
  page,
}, testInfo) => {
  // SwiftShader compiles the real published path-tracing shader. Its first compile can
  // take substantially longer than a UI action; this bound does not turn errors into skips.
  test.setTimeout(180000);
  await drawBuilding(page);
  const fixture = await panorama(testInfo);
  await settings(page, true);
  await importPanorama(page, fixture.file);
  await setNumber(page, '环境强度', 1.3);
  await setNumber(page, '环境旋转（°）', 35);
  // Keep the loaded HDR as lighting while exercising the legacy tracer's
  // internally allocated Color-background texture on every enter/exit cycle.
  await expect(
    page.getByRole('checkbox', { name: '将全景显示为背景', exact: true }),
  ).not.toBeChecked();
  const document = await snapshot(page);
  const initial = await diagnostics(page);
  expect(initial.environment).toMatchObject({
    width: 32,
    height: 16,
    intensity: 1.3,
    background: false,
  });
  expect(initial.environment.resourceId).toBe(document.environment!.resourceId);
  await choose(page, '目标采样数', '16');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  const cycles: {
    start: Diagnostics;
    paused: Diagnostics;
    complete: Diagnostics;
    released: Diagnostics;
    elapsedMs: number;
  }[] = [];
  let png:
    | {
        width: number;
        height: number;
        uniqueColors: number;
        min: number;
        max: number;
        sha256?: string;
      }
    | undefined;
  for (let index = 0; index < 3; index++) {
    const started = Date.now();
    await page.getByRole('button', { name: '开始光追', exact: true }).click();
    await page.waitForFunction(
      () => {
        const state = (window as unknown as Instrumented).__editor.diagnostics();
        return state.pathTracing.stats?.ready || !!state.render.error;
      },
      undefined,
      { timeout: 120000 },
    );
    const start = await diagnostics(page);
    expect(start.render.error).toBeUndefined();
    expect(start.actualBackend).toBe('webgl');
    expect(start.pathTracing.activeSession).toBe(1);
    expect(start.pathTracing.stats?.backend).toBe('webgl');
    expect(start.pathTracing.cleanBuilding).toBe(true);
    expect(start.pathTracing.cleanGeometryObjects).toBe(
      document.walls.length + document.slabs.length + document.openings.length,
    );
    expect(start.pathTracing.auxiliaryObjects).toBe(0);
    expect(start.pathTracing.displayMaterialOverrides).toBe(0);
    expect(start.pathTracing.meshes).toBeGreaterThan(0);
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await page.waitForFunction(
      () =>
        (window as unknown as Instrumented).__editor.diagnostics().pathTracing.stats?.paused ===
        true,
    );
    await idle(page);
    const paused = await diagnostics(page);
    await page.waitForTimeout(300);
    expect((await diagnostics(page)).pathTracing.stats?.samples).toBe(
      paused.pathTracing.stats?.samples,
    );
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.waitForFunction(
      () => {
        const d = (window as unknown as Instrumented).__editor.diagnostics();
        return !!d.pathTracing.stats?.complete || !!d.render.error;
      },
      undefined,
      { timeout: 120000 },
    );
    const complete = await diagnostics(page);
    expect(complete.render.error).toBeUndefined();
    expect(complete.pathTracing.stats).toMatchObject({
      backend: 'webgl',
      targetSamples: 16,
      complete: true,
      ready: true,
    });
    expect(complete.pathTracing.stats!.minSamples).toBeGreaterThanOrEqual(16);
    expect(complete.pathTracing.stats!.samples).toBeGreaterThanOrEqual(16);
    if (index === 0) {
      const bytes = await actualDownload(
        page,
        '保存渲染 PNG',
        testInfo.outputPath('actual-16-sample-pathtrace.png'),
      );
      expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      png = await page.evaluate(
        async (bytes) => {
          const bitmap = await createImageBitmap(
            new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
          );
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext('2d')!;
          context.drawImage(bitmap, 0, 0);
          const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
          const colors = new Set<number>();
          let min = 255;
          let max = 0;
          for (let index = 0; index < data.length; index += 4) {
            colors.add(data[index]! * 65536 + data[index + 1]! * 256 + data[index + 2]!);
            const luminance = (data[index]! + data[index + 1]! + data[index + 2]!) / 3;
            min = Math.min(min, luminance);
            max = Math.max(max, luminance);
          }
          const result = {
            width: bitmap.width,
            height: bitmap.height,
            uniqueColors: colors.size,
            min,
            max,
          };
          bitmap.close();
          return result;
        },
        [...bytes],
      );
      png.sha256 = createHash('sha256').update(bytes).digest('hex');
      expect(png.width).toBeGreaterThan(0);
      expect(png.height).toBeGreaterThan(0);
      expect(png.uniqueColors).toBeGreaterThan(4);
      expect(png.max - png.min).toBeGreaterThan(20);
    }
    await page.getByRole('button', { name: '返回实时编辑', exact: true }).click();
    await idle(page);
    const released = await diagnostics(page);
    expect(released.pathTracing.activeSession).toBe(0);
    expect(released.pathTracing.stats).toBeNull();
    expect(released.pathTracing.cleanBuilding).toBe(false);
    expect(released.pathTracing.resources).toBeNull();
    expect(released.pathTracing.meshes).toBe(0);
    expect(released.bvh.geometries).toBe(initial.bvh.geometries);
    expect(released.bvh.meshes).toBe(initial.bvh.meshes);
    expect(released.bvh.references).toBe(initial.bvh.references);
    expect(released.resources).toEqual(initial.resources);
    if (index > 0) {
      expect(released.geometries).toBe(cycles[0]!.released.geometries);
      expect(released.textures).toBe(cycles[0]!.released.textures);
    }
    expect(released.rendererId).toBe(initial.rendererId);
    expect(released.sceneId).toBe(initial.sceneId);
    expect(released.cameraId).toBe(initial.cameraId);
    expect(await snapshot(page)).toEqual(document);
    cycles.push({ start, paused, complete, released, elapsedMs: Date.now() - started });
  }
  const projectPath = testInfo.outputPath('pathtrace-environment.building');
  const projectBytes = await actualDownload(page, '保存', projectPath);
  const archive = unzipSync(projectBytes);
  const embeddedEnvironmentPaths = Object.keys(archive).filter((name) =>
    name.startsWith('environment-resources/'),
  );
  expect(embeddedEnvironmentPaths).toHaveLength(1);
  expect(Buffer.from(archive[embeddedEnvironmentPaths[0]!]!)).toEqual(await readFile(fixture.file));
  const glbPath = testInfo.outputPath('pathtrace-environment.glb');
  const glbBytes = await actualDownload(page, '导出 GLB', glbPath);
  const validator = await validateBytes(glbBytes, { uri: 'pathtrace-environment.glb' });
  expect(validator.issues.numErrors).toBe(0);
  expect(validator.issues.numWarnings).toBe(0);
  expect(await snapshot(page)).toEqual(document);
  await evidence(
    'rendering-pathtrace-validation',
    {
      platform:
        'Windows Chromium WebGL browser; results are not native or Q5 performance certification',
      path: 'Actual mouse building → actual UI target16/start/pause/resume → real shader samples → actual PNG download and decoded pixel inspection → three return/start resource cycles',
      initial,
      cycles,
      png,
      editableArtifacts: {
        project: {
          path: projectPath,
          sha256: createHash('sha256').update(projectBytes).digest('hex'),
        },
        glb: {
          path: glbPath,
          sha256: createHash('sha256').update(glbBytes).digest('hex'),
          validatorErrors: validator.issues.numErrors,
          validatorWarnings: validator.issues.numWarnings,
        },
        png: { path: testInfo.outputPath('actual-16-sample-pathtrace.png'), sha256: png!.sha256 },
        embeddedPanoramaMatchesOriginalBytes: true,
        originalProceduralPanoramaLicense: 'CC0-1.0',
      },
      environmentFixture: {
        width: fixture.width,
        height: fixture.height,
        decodedLinearRange: fixture.range,
        sha256: fixture.sha256,
        environmentId: document.environment!.resourceId,
      },
      formalDocumentUnchanged: true,
      auxiliaryAbsenceEvidence:
        'Runtime traverses the actual independent path-tracing scene; grid/outline/preview/snap and display override counts are zero.',
      shaderCompilationTimeoutMs: 120000,
    },
    testInfo,
  );
});
