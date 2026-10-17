import { evidencePath } from './evidence-path';
import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cpus, platform, release, totalmem } from 'node:os';
import type { ProjectDocument } from '@building/editor-core';
import { encodeProjectContainer } from '../apps/desktop/src/platform/container';
import { fixedProject } from '../scripts/benchmark-fixture';

interface Diagnostics {
  rendererId: string;
  frameCount: number;
  objects: number;
  geometries: number;
  textures: number;
  pendingFrame: boolean;
  resources: { materials: number; textures: number; references: number };
  eventListeners: number;
  lifecycle: { created: number; disposed: number; active: number };
}
interface EditSample {
  start: number;
  revision: number;
  frame: number;
}
interface Probe {
  camera: boolean;
  cameraFrames: number[];
  edits: number[];
  pending: EditSample[];
  cameraStart: number;
  lastFrameTime: number;
  lastFrame: number;
  stopped: boolean;
}
interface InstrumentedWindow extends Window {
  __editor: { document(): ProjectDocument; diagnostics(): Diagnostics };
  __performanceProbe: Probe;
}
const measured = (values: number[]) => {
  if (!values.length) {
    return { samples: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: values.length,
    minMs: sorted[0],
    meanMs: values.reduce((sum, value) => sum + value, 0) / values.length,
    p50Ms: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    maxMs: sorted.at(-1),
  };
};
const diagnostics = (page: Page) =>
  page.evaluate(() => (window as unknown as InstrumentedWindow).__editor.diagnostics());
async function settled(page: Page) {
  await page.waitForFunction(
    () => !(window as unknown as InstrumentedWindow).__editor.diagnostics().pendingFrame,
  );
  await page.waitForTimeout(100);
}

// This test operates the real app through file choosers, inputs, buttons and mouse events.
// The dev diagnostic surface is read-only; it never injects an editor command or a scene.
test('PRD workload: real file open, camera input, 50 resource cycles and 5 exports', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(600_000);
  const report: Record<string, unknown> = {
    measuredAt: new Date().toISOString(),
    status: 'running',
    scope:
      'Chromium browser development build with WebGL; actual device recorded below; not Tauri desktop or Q5 acceptance',
    targetStatus:
      'Q5 reference hardware/OS decision pending; measured results do not establish the PRD FPS/latency target',
    environment: {
      os: platform(),
      release: release(),
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      totalMemoryBytes: totalmem(),
      browserVersion: browser.version(),
      node: process.version,
      launchFlags: testInfo.project.use.launchOptions?.args ?? [],
    },
    methods: {
      load: 'From immediately before the real file chooser receives a .building ZIP until all objects and 20 textures are rendered; includes protocol file delivery and decoding/upload',
      camera:
        'Real right-button pointer drag with 100 moves and requested 15 ms waits, plus Playwright protocol delay. requestAnimationFrame observer reads renderer frameCount; durations are observed rendered-frame intervals, not maximum GPU throughput or GPU timer queries',
      property:
        'Capture-phase Enter key timestamp until changed document revision and first renderer frame are observed; includes command, scene update and render scheduling',
      resources:
        'Renderer.info.memory geometry and texture counts after the same selected wall is rendered at the end of each edit/delete/undo/floor cycle. GPU totals include Three.js internal DFG_LUT in addition to the 20 project textures; texture bytes and VRAM residency are not exposed by these counters',
      exports:
        'Five actual GLB downloads through the app export button, each validated independently with glTF Validator. Duration runs from before clicking Export to the browser download event; file copying and Validator execution are excluded',
    },
  };
  const resourceSamples: Array<Diagnostics & { cycle: number; jsHeapBytes?: number }> = [];
  const exports: Array<{
    cycle: number;
    bytes: number;
    durationMs: number;
    validatorErrors: number;
    validatorWarnings: number;
  }> = [];
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    const fixture = fixedProject(),
      encoded = await encodeProjectContainer(fixture);
    await mkdir(testInfo.outputDir, { recursive: true });
    const fixturePath = resolve(testInfo.outputDir, 'prd-workload.building');
    await writeFile(fixturePath, encoded);
    report.fixture = {
      levels: fixture.levels.length,
      walls: fixture.walls.length,
      openings: fixture.openings.length,
      slabs: fixture.slabs.length,
      images: fixture.resources.length,
      uniqueImageContents: new Set(fixture.resources.map((resource) => resource.dataUrl)).size,
      imageWidth: 2048,
      imageHeight: 2048,
      containerBytes: encoded.length,
      estimatedBaseRgbaBytes: 20 * 2048 * 2048 * 4,
      fixturePath,
      source: 'Original procedural brick PNGs; generated once per run, carried in the project ZIP',
    };
    await page.addInitScript(() => {
      localStorage.setItem(
        'building-editor.settings.v1',
        JSON.stringify({ themeMode: 'light', language: 'en' }),
      );
      localStorage.setItem('building-theme', 'light');
      localStorage.setItem('building-language', 'en');
    });
    await page.setViewportSize({ width: 2390, height: 1260 });
    await page.goto('/');
    await expect(page.locator('canvas')).toHaveCount(1);
    await page.waitForFunction(() => !!(window as unknown as InstrumentedWindow).__editor);
    // Match the PRD's canvas resolution instead of confusing browser viewport with canvas.
    const beforeSize = await page.locator('canvas').boundingBox();
    if (!beforeSize) {
      throw new Error('Canvas is not visible');
    }
    await page.setViewportSize({
      width: 2390 + Math.ceil(1920 - beforeSize.width),
      height: 1260 + Math.ceil(1080 - beforeSize.height),
    });
    // Fractional CSS rows are floored by WebGLRenderer when allocating its drawing buffer.
    // Verify the physical drawing size after ResizeObserver runs, rather than rounding CSS.
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas');
      return canvas?.width === 1920 && canvas.height === 1080;
    });
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    const fileChooser = await chooser;
    const loadStart = await page.evaluate(() => performance.now());
    await fileChooser.setFiles(fixturePath);
    await page.waitForFunction(
      () => {
        const editor = (window as unknown as InstrumentedWindow).__editor,
          document = editor.document(),
          runtime = editor.diagnostics();
        return (
          document.id === 'benchmark_project' &&
          document.walls.length === 100 &&
          runtime.objects === 184 &&
          runtime.resources.textures === 20 &&
          runtime.textures > 20 &&
          !runtime.pendingFrame
        );
      },
      undefined,
      { timeout: 90_000 },
    );
    await settled(page);
    report.loadMs = await page.evaluate((start) => performance.now() - start, loadStart);
    report.loadSamples = 1;
    report.loadDistribution =
      'One cold project-load observation; no load percentile distribution inferred';
    console.log(
      `PRD workload loaded 184 objects and 20 independent 2048 textures in ${Number(report.loadMs).toFixed(1)} ms`,
    );
    report.canvas = await page.locator('canvas').evaluate((canvas) => ({
      width: (canvas as HTMLCanvasElement).width,
      height: (canvas as HTMLCanvasElement).height,
      cssWidth: canvas.getBoundingClientRect().width,
      cssHeight: canvas.getBoundingClientRect().height,
      devicePixelRatio,
    }));
    report.webgl = await page.locator('canvas').evaluate((canvas) => {
      const gl = (canvas as HTMLCanvasElement).getContext('webgl2');
      if (!gl) {
        return { available: false };
      }
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = extension
        ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL))
        : String(gl.getParameter(gl.RENDERER));
      return {
        available: true,
        renderer,
        vendor: extension
          ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL)
          : gl.getParameter(gl.VENDOR),
        softwareWebGL: /swiftshader|software|llvmpipe/i.test(renderer),
        version: gl.getParameter(gl.VERSION),
      };
    });
    await page.getByRole('button', { name: 'Wall 1', exact: true }).click();
    await settled(page);
    let baseline = await diagnostics(page);
    report.initialBaseline = baseline;
    await page.evaluate(() => {
      const target = window as unknown as InstrumentedWindow;
      const probe: Probe = {
        camera: false,
        cameraFrames: [],
        edits: [],
        pending: [],
        cameraStart: 0,
        lastFrameTime: performance.now(),
        lastFrame: target.__editor.diagnostics().frameCount,
        stopped: false,
      };
      target.__performanceProbe = probe;
      document.addEventListener(
        'keydown',
        (event) => {
          if (
            event.key === 'Enter' &&
            event.target instanceof HTMLInputElement &&
            !event.isComposing
          ) {
            probe.pending.push({
              start: performance.now(),
              revision: target.__editor.document().revision,
              frame: target.__editor.diagnostics().frameCount,
            });
          }
        },
        { capture: true },
      );
      const observe = (time: number) => {
        if (probe.stopped) {
          return;
        }
        const runtime = target.__editor.diagnostics(),
          revision = target.__editor.document().revision;
        if (runtime.frameCount > probe.lastFrame) {
          if (probe.camera && probe.lastFrameTime >= probe.cameraStart) {
            probe.cameraFrames.push(
              (time - probe.lastFrameTime) / (runtime.frameCount - probe.lastFrame),
            );
          }
          probe.lastFrame = runtime.frameCount;
          probe.lastFrameTime = time;
        }
        for (let index = probe.pending.length - 1; index >= 0; index -= 1) {
          const sample = probe.pending[index]!;
          if (revision > sample.revision && runtime.frameCount > sample.frame) {
            probe.edits.push(performance.now() - sample.start);
            probe.pending.splice(index, 1);
          }
        }
        requestAnimationFrame(observe);
      };
      requestAnimationFrame(observe);
    });
    // Frame measurements intentionally happen on a fully loaded, visible building.
    await page.getByRole('button', { name: 'Whole building', exact: true }).click();
    await settled(page);
    const box = await page.locator('canvas').boundingBox();
    if (!box) {
      throw new Error('Canvas is not visible');
    }
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const cameraRevision = await page.evaluate(
      () => (window as unknown as InstrumentedWindow).__editor.document().revision,
    );
    await page.mouse.move(center.x, center.y);
    await page.mouse.down({ button: 'right' });
    await page.evaluate(() => {
      const probe = (window as unknown as InstrumentedWindow).__performanceProbe;
      probe.camera = true;
      probe.cameraStart = performance.now();
    });
    const cameraStart = await page.evaluate(() => performance.now());
    for (let step = 0; step < 100; step += 1) {
      await page.mouse.move(
        center.x + Math.sin(step / 10) * 140,
        center.y + Math.cos(step / 13) * 65,
      );
      await page.waitForTimeout(15);
    }
    await page.mouse.up({ button: 'right' });
    report.cameraDurationMs = await page.evaluate(
      (start) => performance.now() - start,
      cameraStart,
    );
    console.log(
      `PRD workload camera drag completed in ${Number(report.cameraDurationMs).toFixed(1)} ms`,
    );
    await page.evaluate(() => {
      (window as unknown as InstrumentedWindow).__performanceProbe.camera = false;
    });
    expect(
      await page.evaluate(
        () => (window as unknown as InstrumentedWindow).__editor.document().revision,
      ),
    ).toBe(cameraRevision);
    // Clear the hover marker using the same floor route exercised by every cycle.
    await page.locator('.floor-list').getByRole('button').nth(1).click();
    await page.locator('.floor-list').getByRole('button').nth(0).click();
    await page.getByRole('button', { name: 'Wall 1', exact: true }).click();
    await settled(page);
    baseline = await diagnostics(page);
    report.baseline = baseline;
    for (let cycle = 1; cycle <= 50; cycle += 1) {
      await page.getByRole('button', { name: 'Wall 1', exact: true }).click();
      const height = 2.72 + (cycle % 3) * 0.01;
      const wallHeight = page
        .getByRole('complementary', { name: 'Properties', exact: true })
        .getByLabel('Height (m)', { exact: true });
      await wallHeight.fill(String(height));
      await wallHeight.press('Enter');
      await page.waitForFunction(
        (expected) =>
          (window as unknown as InstrumentedWindow).__editor.document().walls[0]?.height ===
          expected,
        height,
      );
      await settled(page);
      await page.locator('.inspector').getByRole('button', { name: 'Delete', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
      await page.waitForFunction(() => {
        const document = (window as unknown as InstrumentedWindow).__editor.document();
        return document.walls.length === 99 && document.openings.length === 59;
      });
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      await page.waitForFunction(
        () => (window as unknown as InstrumentedWindow).__editor.document().walls.length === 100,
      );
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      await page.waitForFunction(
        () =>
          (window as unknown as InstrumentedWindow).__editor.document().walls[0]?.height === 2.8,
      );
      await page.locator('.floor-list').getByRole('button').nth(1).click();
      await page.locator('.floor-list').getByRole('button').nth(0).click();
      await page.getByRole('button', { name: 'Wall 1', exact: true }).click();
      await settled(page);
      const current = await diagnostics(page);
      const heap = await page.evaluate(
        () =>
          (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
            ?.usedJSHeapSize,
      );
      resourceSamples.push({ cycle, ...current, jsHeapBytes: heap });
      expect(current.rendererId).toBe(baseline.rendererId);
      expect(current.objects).toBe(184);
      expect(current.textures).toBe(baseline.textures);
      expect(current.geometries).toBe(baseline.geometries);
      expect(current.resources).toEqual(baseline.resources);
      expect(current.eventListeners).toBe(baseline.eventListeners);
      expect(current.lifecycle.active).toBe(1);
      if (cycle % 10 === 0) {
        const start = await page.evaluate(() => performance.now()),
          download = page.waitForEvent('download', { timeout: 90_000 });
        await page.getByRole('button', { name: 'Export GLB', exact: true }).click();
        const artifact = await download,
          durationMs = await page.evaluate((time) => performance.now() - time, start);
        const path = resolve(testInfo.outputDir, `workload-cycle-${cycle}.glb`);
        await artifact.saveAs(path);
        const bytes = await readFile(path),
          validator = await import('gltf-validator');
        const result = await validator.validateBytes(bytes, { uri: `workload-cycle-${cycle}.glb` });
        exports.push({
          cycle,
          bytes: bytes.length,
          durationMs,
          validatorErrors: result.issues.numErrors,
          validatorWarnings: result.issues.numWarnings,
        });
        expect(result.issues.numErrors).toBe(0);
        await settled(page);
        const afterExport = await diagnostics(page);
        expect(afterExport.geometries).toBe(baseline.geometries);
        expect(afterExport.textures).toBe(baseline.textures);
        expect(afterExport.resources).toEqual(baseline.resources);
      }
      if (cycle % 10 === 0) {
        console.log(
          `PRD workload cycles ${cycle}/50; GPU geometry=${current.geometries}, textures=${current.textures}`,
        );
      }
    }
    const observations = await page.evaluate(() => {
      const probe = (window as unknown as InstrumentedWindow).__performanceProbe;
      probe.stopped = true;
      return {
        edits: probe.edits,
        cameraFrames: probe.cameraFrames,
        pending: probe.pending.length,
      };
    });
    expect(observations.edits).toHaveLength(50);
    expect(observations.pending).toBe(0);
    expect(observations.cameraFrames.length).toBeGreaterThan(20);
    expect(pageErrors).toEqual([]);
    report.propertyLatency = measured(observations.edits);
    report.cameraRenderedFrameInterval = measured(observations.cameraFrames);
    report.cameraObservedMeanFps =
      observations.cameraFrames.length /
      (observations.cameraFrames.reduce((sum, value) => sum + value, 0) / 1000);
    report.idle = await diagnostics(page);
    const idleFrames = (report.idle as Diagnostics).frameCount;
    await page.mouse.move(10, 10);
    await settled(page);
    const idleStart = await diagnostics(page);
    await page.waitForTimeout(500);
    expect((await diagnostics(page)).frameCount).toBe(idleStart.frameCount);
    report.idle = {
      ...idleStart,
      comparisonFrameCount: idleFrames,
      observedIdleMs: 500,
      additionalFrames: 0,
    };
    report.status = 'completed';
    report.resourceResult =
      '50 cycles and 5 exports preserved the selected-wall geometry/texture counts and Renderer identity; this establishes no observed GPU counter growth in this workload, not total native memory or VRAM stability';
  } catch (failure) {
    report.status = 'failed';
    report.failure = failure instanceof Error ? failure.message : String(failure);
    throw failure;
  } finally {
    if (!page.isClosed()) {
      const observations = await page
        .evaluate(() => {
          const probe = (window as unknown as InstrumentedWindow).__performanceProbe;
          if (!probe) {
            return null;
          }
          probe.stopped = true;
          return { edits: probe.edits, cameraFrames: probe.cameraFrames };
        })
        .catch(() => null);
      if (observations) {
        report.propertyLatency = measured(observations.edits);
        report.cameraRenderedFrameInterval = measured(observations.cameraFrames);
        report.cameraObservedMeanFps =
          observations.cameraFrames.length /
          (observations.cameraFrames.reduce((sum, value) => sum + value, 0) / 1000);
      }
    }
    report.resourceSamples = resourceSamples;
    report.exports = exports;
    report.pageErrors = pageErrors;
    report.exportDuration = measured(exports.map((artifact) => artifact.durationMs));
    report.resourceSummary = {
      completedCycles: resourceSamples.length,
      completedExports: exports.length,
      minGeometries: resourceSamples.length
        ? Math.min(...resourceSamples.map((sample) => sample.geometries))
        : null,
      maxGeometries: resourceSamples.length
        ? Math.max(...resourceSamples.map((sample) => sample.geometries))
        : null,
      minTextures: resourceSamples.length
        ? Math.min(...resourceSamples.map((sample) => sample.textures))
        : null,
      maxTextures: resourceSamples.length
        ? Math.max(...resourceSamples.map((sample) => sample.textures))
        : null,
    };
    await mkdir(resolve(evidencePath('theme-toggle/evidence')), { recursive: true });
    const path = resolve(evidencePath('theme-toggle/evidence/benchmark-browser.json'));
    await writeFile(path, JSON.stringify(report, null, 2) + '\n');
    await testInfo.attach('browser-workload-measurements', {
      path,
      contentType: 'application/json',
    });
  }
});
