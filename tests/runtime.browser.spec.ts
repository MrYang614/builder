import { evidencePath } from './evidence-path';
import { choose } from './browser-controls';
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateBytes } from 'gltf-validator';
import type { ProjectDocument } from '@building/editor-core';
import type { ThreeRuntime } from '@building/three-runtime';
type RuntimeDiagnostics = ReturnType<ThreeRuntime['diagnostics']>;
type TextureIdentity = {
  uuid: string;
  name: string;
  isRenderTargetTexture: boolean;
  isDataTexture: boolean;
  isDepthTexture: boolean;
  width: number;
  height: number;
  hasPixelData: boolean;
  imageSource: boolean;
};
type RendererTextureIdentity = TextureIdentity & {
  owner: 'render-target' | 'depth-target' | 'lighting-lookup' | 'gtao-noise' | 'unclassified';
};
const browserErrors = new WeakMap<Page, string[]>();
type Instrumented = {
  __editor: {
    document: () => ProjectDocument;
    snapshot: () => ProjectDocument;
    history: () => { undoCount: number };
    diagnostics: () => RuntimeDiagnostics;
    project: (point: { x: number; y: number; z: number }) => { x: number; y: number };
  };
};
const documentOf = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.document());
const diagnostics = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.diagnostics());
async function project(page: Page, x: number, z: number, y = 0) {
  return page.evaluate((p) => (window as unknown as Instrumented).__editor.project(p), { x, y, z });
}
async function clickWorld(page: Page, x: number, z: number, y = 0) {
  const p = await project(page, x, z, y);
  await page.mouse.click(p.x, p.y);
}

async function number(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel(label, { exact: true }).press('Enter');
}
async function idle(page: Page) {
  await page.waitForFunction(
    () => !(window as unknown as Instrumented).__editor.diagnostics().pendingFrame,
  );
}
async function discardNew(page: Page) {
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '放弃', exact: true }).click();
  await expect.poll(async () => (await documentOf(page)).walls.length).toBe(0);
}
/** Identifies renderer buffers and upstream procedural textures separately from project images. */
function rendererTexture(texture: TextureIdentity): RendererTextureIdentity {
  let owner: RendererTextureIdentity['owner'] = 'unclassified';
  if (texture.isRenderTargetTexture) {
    owner = 'render-target';
  } else if (texture.isDepthTexture) {
    owner = 'depth-target';
  } else if (texture.isDataTexture && texture.name === 'DFG_LUT' && texture.hasPixelData) {
    owner = 'lighting-lookup';
  } else if (
    texture.isDataTexture &&
    texture.name === '' &&
    texture.hasPixelData &&
    texture.width === texture.height &&
    // GTAOPass owns a 5×5 magic-square noise texture and a 64×64 denoise noise texture.
    (texture.width === 5 || texture.width === 64)
  ) {
    owner = 'gtao-noise';
  }
  return { ...texture, owner };
}
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' ||
      /(?:WebGL|TSL|ValidationError|WGSL).*(?:error|failed)/i.test(message.text())
    ) {
      errors.push(message.text());
    }
  });
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Instrumented).__editor);
  await expect(page.locator('canvas')).toHaveCount(1);
});
test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
});

test('20 real selection/theme/create/delete/replace cycles release GPU resources and preserve one renderer', async ({
  page,
}, testInfo) => {
  // Post-processing remains enabled throughout all 20 ownership cycles on either backend device.
  test.setTimeout(600000);
  const moduleUrl = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((name) => /\/three\.js(?:\?|$)/.test(name)),
  );
  expect(moduleUrl).toBeTruthy();
  // Import the exact already-resolved module before the reloaded app constructs its
  // renderer. Render targets register disposal on their owner rather than Texture.
  await page.addInitScript(async (url) => {
    const THREE = await import(url!);
    type ObservedTexture = {
      uuid: string;
      name: string;
      isRenderTargetTexture?: boolean;
      isDataTexture?: boolean;
      isDepthTexture?: boolean;
      image?: {
        width?: number;
        height?: number;
        data?: unknown;
        src?: string;
        currentSrc?: string;
      };
    };
    const live = new Map<string, ObservedTexture>(),
      imageEvents: { uuid: string; name: string; phase: string; at: number; stack?: string }[] = [],
      add = THREE.Texture.prototype.addEventListener,
      targetAdd = THREE.RenderTarget.prototype.addEventListener,
      observed = new WeakSet<ObservedTexture>();
    THREE.Texture.prototype.addEventListener = function (
      this: ObservedTexture,
      type: string,
      listener: unknown,
    ) {
      if (type === 'dispose') {
        live.set(this.uuid, this);
        if (this.image?.src || this.image?.currentSrc) {
          imageEvents.push({
            uuid: this.uuid,
            name: this.name,
            phase: 'gpu-listener',
            at: performance.now(),
            stack: new Error().stack,
          });
        }
        if (!observed.has(this)) {
          observed.add(this);
          add.call(this, 'dispose', () => {
            live.delete(this.uuid);
            if (this.image?.src || this.image?.currentSrc) {
              imageEvents.push({
                uuid: this.uuid,
                name: this.name,
                phase: 'disposed',
                at: performance.now(),
                stack: new Error().stack,
              });
            }
          });
        }
      }
      return add.call(this, type, listener);
    };
    THREE.RenderTarget.prototype.addEventListener = function (
      this: { textures: ObservedTexture[]; depthTexture?: ObservedTexture },
      type: string,
      listener: unknown,
    ) {
      if (type === 'dispose') {
        for (const texture of this.textures) {
          live.set(texture.uuid, texture);
        }
        if (this.depthTexture) {
          live.set(this.depthTexture.uuid, this.depthTexture);
        }
        targetAdd.call(this, 'dispose', () => {
          for (const texture of this.textures) {
            live.delete(texture.uuid);
          }
          if (this.depthTexture) {
            live.delete(this.depthTexture.uuid);
          }
        });
      }
      return targetAdd.call(this, type, listener);
    };
    Object.assign(window, {
      __textureImageEvents: () => imageEvents,
      __liveTextures: (): TextureIdentity[] =>
        [...live.values()]
          .map((texture) => ({
            uuid: texture.uuid,
            name: texture.name,
            isRenderTargetTexture: !!texture.isRenderTargetTexture,
            isDataTexture: !!texture.isDataTexture,
            isDepthTexture: !!texture.isDepthTexture,
            width: texture.image?.width ?? 0,
            height: texture.image?.height ?? 0,
            hasPixelData: !!texture.image?.data,
            imageSource: !!(texture.image?.currentSrc || texture.image?.src),
          }))
          .sort((a, b) => a.uuid.localeCompare(b.uuid)),
    });
  }, moduleUrl);
  // Hold only the app entry until the probe is ready; this removes module-load timing
  // from ownership validation without changing renderer or frame scheduling behavior.
  await page.route('**/src/main.tsx', async (route) => {
    await page.waitForFunction(
      () =>
        typeof (window as unknown as { __liveTextures?: unknown }).__liveTextures === 'function',
    );
    await route.continue();
  });
  await page.reload();
  await page.unroute('**/src/main.tsx');
  await page.waitForFunction(
    () => typeof (window as unknown as { __liveTextures?: unknown }).__liveTextures === 'function',
  );
  await idle(page);
  const runtimeId = (await diagnostics(page)).rendererId;
  const records: RuntimeDiagnostics[] = [];
  const retainedRecords: RendererTextureIdentity[][] = [];
  async function cycle(index: number) {
    await page.getByRole('button', { name: '可编辑示例', exact: true }).click();
    await page.getByRole('button', { name: '墙体 1', exact: true }).click();
    await choose(page, '表面', 'B 面');
    expect((await diagnostics(page)).handles).toBe(2);
    expect((await diagnostics(page)).surfaceHighlights).toBeGreaterThan(0);
    await page.getByRole('button', { name: '墙体 2', exact: true }).click();
    await page.getByRole('button', { name: '门 6', exact: true }).click();
    expect((await diagnostics(page)).hingeMarkers).toBe(2);
    if (index % 5 === 0) {
      await choose(page, '外观', index % 10 === 0 ? '暗色' : '亮色');
    }
    await page.getByRole('button', { name: '墙体 1', exact: true }).click();
    await page.getByRole('button', { name: '删除', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click();
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await discardNew(page);
    await page.getByRole('radio', { name: '墙体', exact: true }).click();
    await clickWorld(page, -2, 0);
    await clickWorld(page, 2, 0);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '墙体 1', exact: true }).click();
    await page.getByRole('button', { name: '删除', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click();
    await discardNew(page);
    await idle(page);
    const value = await diagnostics(page);
    expect(value.rendererId).toBe(runtimeId);
    expect(value.lifecycle.active).toBe(1);
    expect(value.handles).toBe(0);
    expect(value.surfaceHighlights).toBe(0);
    expect(value.hingeMarkers).toBe(0);
    expect(value.resources).toEqual({ materials: 0, textures: 0, references: 0 });
    const retained = (
      await page.evaluate(() =>
        (window as unknown as { __liveTextures(): TextureIdentity[] }).__liveTextures(),
      )
    ).map(rendererTexture);
    if (retained.some((texture) => texture.imageSource)) {
      mkdirSync(evidencePath('snapping'), { recursive: true });
      writeFileSync(
        evidencePath('snapping/retained-project-textures.json'),
        JSON.stringify(
          {
            index,
            diagnostics: value,
            retained,
            imageEvents: await page.evaluate(() =>
              (
                window as unknown as {
                  __textureImageEvents(): {
                    uuid: string;
                    name: string;
                    phase: string;
                    at: number;
                    stack?: string;
                  }[];
                }
              ).__textureImageEvents(),
            ),
          },
          null,
          2,
        ),
      );
    }
    expect(retained).not.toHaveLength(0);
    expect(value.textures).toBe(retained.length);
    expect(retained.filter((texture) => texture.owner === 'unclassified')).toEqual([]);
    expect(retained.filter((texture) => texture.imageSource)).toEqual([]);
    expect(retained.some((texture) => texture.owner === 'lighting-lookup')).toBe(true);
    expect(retained.some((texture) => texture.owner === 'render-target')).toBe(true);
    expect(value.objects).toBe(0);
    return { value, retained };
  }
  const firstEmptyCycle = await cycle(-1),
    baseline = firstEmptyCycle.value;
  for (let index = 0; index < 20; index++) {
    const { value, retained } = await cycle(index);
    expect(value.geometries).toBe(baseline.geometries);
    expect(value.textures).toBe(baseline.textures);
    expect(value.eventListeners).toBe(baseline.eventListeners);
    // UUID equality catches buffer churn and unbounded retention even if counts match.
    expect(retained).toEqual(firstEmptyCycle.retained);
    records.push(value);
    retainedRecords.push(retained);
  }
  expect(browserErrors.get(page)).toEqual([]);
  expect(baseline.lifecycle.created).toBeGreaterThanOrEqual(2);
  expect(baseline.lifecycle.disposed).toBeGreaterThanOrEqual(1);
  const webglRenderer = await page.locator('canvas').evaluate((canvas) => {
    const gl = (canvas as HTMLCanvasElement).getContext('webgl2')!;
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  });
  mkdirSync(evidencePath('theme-toggle/evidence'), { recursive: true });
  writeFileSync(
    evidencePath('theme-toggle/evidence/runtime-validation.json'),
    JSON.stringify(
      {
        platform: 'Windows Chromium WebGL browser; not Tauri desktop acceptance',
        webglRenderer,
        launchFlags: testInfo.project.use.launchOptions?.args ?? [],
        cycles: records.length,
        rendererStable: true,
        retainedTextures:
          'Renderer-owned render/depth targets, GTAO procedural noise and DFG lighting lookup; exact UUID identities remain stable across 20 empty cycles, zero project resources or image textures',
        strictMode: {
          created: baseline.lifecycle.created,
          disposed: baseline.lifecycle.disposed,
          active: baseline.lifecycle.active,
        },
        baseline: {
          geometries: baseline.geometries,
          textures: baseline.textures,
          eventListeners: baseline.eventListeners,
          retained: firstEmptyCycle.retained,
        },
        final: records.at(-1),
        retainedRecords,
        consoleAndPageErrors: browserErrors.get(page),
      },
      null,
      2,
    ),
  );
});

test('real slab corner resize has one history record; invalid opening previews share core validation and cancellation', async ({
  page,
}) => {
  await page.getByRole('radio', { name: '楼板', exact: true }).click();
  await clickWorld(page, -2, -2);
  await clickWorld(page, 2, 2);
  await page.keyboard.press('Escape');
  await page.getByRole('radio', { name: '选择', exact: true }).click();
  await page.getByRole('button', { name: '楼板 1', exact: true }).click();
  await page.getByRole('button', { name: '俯视', exact: true }).click();
  const before = await documentOf(page),
    count = await page.evaluate(
      () => (window as unknown as Instrumented).__editor.history().undoCount,
    );
  expect((await diagnostics(page)).handles).toBe(4);
  const corner = await project(page, -2, -2, 0.06),
    end = await project(page, -3, -3, 0);
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  expect((await diagnostics(page)).preview.dragging).toBe(true);
  await page.mouse.up();
  const resized = await documentOf(page);
  expect(resized.slabs[0]!.polygon).toContainEqual({ x: 2, z: 2 });
  expect(resized.slabs[0]!.polygon).toContainEqual({ x: -3, z: -3 });
  expect(
    await page.evaluate(() => (window as unknown as Instrumented).__editor.history().undoCount),
  ).toBe(count + 1);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await documentOf(page)).slabs).toEqual(before.slabs);
  const again = await project(page, -2, -2, 0.06);
  await page.mouse.move(again.x, again.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect((await documentOf(page)).slabs).toEqual(before.slabs);
  await discardNew(page);
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await clickWorld(page, -2, -1);
  await clickWorld(page, 2, -1);
  await page.keyboard.press('Escape');
  // Clicking the top cap must select the shared solid thickness slot, not wall A.
  await page.getByRole('radio', { name: '材质', exact: true }).click();
  await clickWorld(page, 0, -1, 2.8);
  await expect(page.getByRole('combobox', { name: '表面', exact: true })).toContainText(
    '厚度面／洞口内侧',
  );
  await page.getByRole('radio', { name: '门', exact: true }).click();
  await clickWorld(page, -0.8, -1, 2.8);
  expect((await documentOf(page)).openings).toHaveLength(1);
  const saved = await documentOf(page);
  const overlap = await project(page, -0.8, -1, 2.8);
  await page.mouse.move(overlap.x, overlap.y);
  await expect.poll(async () => (await diagnostics(page)).preview.valid).toBe(false);
  expect((await diagnostics(page)).preview.error).toBe('opening.overlap');
  expect(await documentOf(page)).toEqual(saved);
  const outside = await project(page, -1.95, -1, 2.8);
  await page.mouse.move(outside.x, outside.y);
  await expect
    .poll(async () => (await diagnostics(page)).preview.error)
    .toBe('opening.outsideWall');
  expect(await documentOf(page)).toEqual(saved);
  await page.keyboard.press('Escape');
  expect((await diagnostics(page)).preview.visible).toBe(false);
  expect(await documentOf(page)).toEqual(saved);
});

test('right-button camera operation preserves the drawing anchor; theme preserves camera and the resumed stroke commits once', async ({
  page,
}) => {
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await clickWorld(page, -2, -1);
  const end = await project(page, 1, -1);
  await page.mouse.move(end.x, end.y);
  const before = await diagnostics(page);
  const formal = await documentOf(page),
    history = await page.evaluate(
      () => (window as unknown as Instrumented).__editor.history().undoCount,
    );
  expect(before.preview.state.kind).toBe('preview');
  expect(before.preview.visible).toBe(true);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(end.x + 45, end.y + 15, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  const camera = await diagnostics(page);
  expect(camera.preview.state).toEqual(before.preview.state);
  expect(camera.preview.visible).toBe(true);
  expect(camera.preview.dragging).toBe(false);
  expect(camera.snap.markerVisible).toBe(false);
  expect(camera.snap.result).toBeNull();
  expect(camera.camera.position).not.toEqual(before.camera.position);
  expect(await documentOf(page)).toEqual(formal);
  expect(
    await page.evaluate(() => (window as unknown as Instrumented).__editor.snapshot()),
  ).toEqual(formal);
  await choose(page, '外观', '暗色');
  const themed = await diagnostics(page);
  expect(themed.rendererId).toBe(before.rendererId);
  expect(themed.camera).toEqual(camera.camera);
  expect(themed.preview.state).toEqual(camera.preview.state);
  expect(themed.preview.visible).toBe(false);
  expect(themed.preview.dragging).toBe(false);
  expect(themed.snap.markerVisible).toBe(false);
  expect((await documentOf(page)).walls).toHaveLength(0);
  await clickWorld(page, 1, -1);
  expect((await documentOf(page)).walls).toHaveLength(1);
  expect((await documentOf(page)).walls[0]).toMatchObject({
    start: { x: -2, z: -1 },
    end: { x: 1, z: -1 },
  });
  expect(
    await page.evaluate(() => (window as unknown as Instrumented).__editor.history().undoCount),
  ).toBe(history + 1);
  await page.keyboard.press('Escape');
});

for (const { name, tool, bypass, halfWidth } of [
  { name: '门', tool: 'door', bypass: 'disabled', halfWidth: 0.45 },
  { name: '窗', tool: 'window', bypass: 'alt', halfWidth: 0.6 },
] as const) {
  test(`${tool} placement with ${bypass} snapping preserves the raw preview offset in one command`, async ({
    page,
  }) => {
    await page.getByRole('radio', { name: '墙体', exact: true }).click();
    await clickWorld(page, -2, -1);
    await clickWorld(page, 2, -1);
    await page.keyboard.press('Escape');
    if (bypass === 'disabled') {
      await page.getByRole('button', { name: '吸附', exact: true }).click();
    }
    await page.getByRole('radio', { name, exact: true }).click();
    if (bypass === 'alt') {
      await page.keyboard.down('Alt');
    }
    const pointer = await project(page, -0.76543211, -0.9, 1);
    await page.mouse.move(pointer.x, pointer.y);
    const state = await diagnostics(page);
    expect(state.snap.result?.kind).toBe('raw');
    expect(state.preview.state.kind).toBe('host-preview');
    const raw = state.snap.result!.point;
    const formal = await documentOf(page);
    const expected = raw.x - formal.walls[0].start.x - halfWidth;
    expect(Math.abs(expected - Math.round(expected * 10) / 10)).toBeGreaterThan(0.001);
    expect(state.preview.state).toMatchObject({ offset: expected, valid: true });
    await page.mouse.click(pointer.x, pointer.y);
    if (bypass === 'alt') {
      await page.keyboard.up('Alt');
    }
    const created = await documentOf(page);
    expect(created.openings).toHaveLength(1);
    expect(created.openings[0].offset).toBeCloseTo(expected, 12);
    expect(created.openings[0].kind).toBe(tool);
    expect(
      await page.evaluate(() => (window as unknown as Instrumented).__editor.history().undoCount),
    ).toBe(2);
  });
}

test('two actual UI door playbacks sample independently, finish as commands, keep pose on move and cancel on undo', async ({
  page,
}) => {
  await page.getByRole('button', { name: '可编辑示例', exact: true }).click();
  await page.getByRole('button', { name: '门 6', exact: true }).click();
  await number(page, '动画单程时长（s）', '8');
  await page.locator('.floor-list button').nth(1).click();
  await page.getByRole('button', { name: '门 7', exact: true }).click();
  await number(page, '动画单程时长（s）', '8');
  const history = await page.evaluate(
    () => (window as unknown as Instrumented).__editor.history().undoCount,
  );
  const beforePlayback = await documentOf(page);
  // Configure both doors before playback, then start each through its actual UI.
  // Eight seconds leaves a genuine overlap window on software-rendered CI browsers.
  await page.locator('.floor-list button').nth(0).click();
  await page.getByRole('button', { name: '门 6', exact: true }).click();
  await page.getByRole('button', { name: '打开门', exact: true }).click();
  await page.locator('.floor-list button').nth(1).click();
  await page.getByRole('button', { name: '门 7', exact: true }).click();
  await page.getByRole('button', { name: '关闭门', exact: true }).click();
  const active = await diagnostics(page);
  expect(active.animations).toHaveLength(2);
  const snapshot = await page.evaluate(() =>
      (window as unknown as Instrumented).__editor.snapshot(),
    ),
    formal = await documentOf(page);
  const doors = snapshot.openings.filter((o) => o.kind === 'door');
  expect(doors[0]!.angle).toBeGreaterThan(0);
  expect(doors[0]!.angle).toBeLessThan(90);
  expect(doors[1]!.angle).toBeLessThan(45);
  expect(formal).toEqual(beforePlayback);
  expect(formal.openings.filter((o) => o.kind === 'door').map((o) => o.angle)).toEqual([0, 45]);
  expect(
    await page.evaluate(() => (window as unknown as Instrumented).__editor.history().undoCount),
  ).toBe(history);
  await expect
    .poll(async () => (await diagnostics(page)).animations.length, { timeout: 20000 })
    .toBe(0);
  let doc = await documentOf(page);
  expect(doc.openings.filter((o) => o.kind === 'door').map((o) => o.angle)).toEqual([90, 0]);
  expect(
    await page.evaluate(() => (window as unknown as Instrumented).__editor.history().undoCount),
  ).toBe(history + 2);
  await number(page, '洞口距墙参考端（m）', '1.4');
  doc = await documentOf(page);
  expect(doc.openings.filter((o) => o.kind === 'door')[1]!.angle).toBe(0);
  expect((await diagnostics(page)).rebuiltIds).not.toContain(doc.slabs[0]!.id);
  await page.getByRole('button', { name: '打开门', exact: true }).click();
  await expect.poll(async () => (await diagnostics(page)).animations.length).toBe(1);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await diagnostics(page)).animations).toEqual([]);
  expect((await documentOf(page)).openings.filter((o) => o.kind === 'door')[1]!.offset).toBe(1.2);
});

test('real window placement, sill/size editing, pointer move and deletion/undo produce actual exported holes', async ({
  page,
}, testInfo) => {
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await clickWorld(page, -2, -1);
  await clickWorld(page, 2, -1);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '俯视', exact: true }).click();
  await page.getByRole('radio', { name: '窗', exact: true }).click();
  await clickWorld(page, 0, -1, 2.8);
  await expect.poll(async () => (await documentOf(page)).openings.length).toBe(1);
  await page.getByRole('radio', { name: '选择', exact: true }).click();
  await number(page, '窗台离地高度（m）', '.8');
  await number(page, '洞口宽度（m）', '1');
  await number(page, '洞口高度（m）', '1.3');
  await number(page, '洞口距墙参考端（m）', '.6');
  let doc = await documentOf(page);
  expect(doc.openings[0]).toMatchObject({
    kind: 'window',
    sill: 0.8,
    width: 1,
    height: 1.3,
    offset: 0.6,
  });
  await page.getByRole('button', { name: '查看整栋', exact: true }).click();
  const count = await page.evaluate(
      () => (window as unknown as Instrumented).__editor.history().undoCount,
    ),
    centre = doc.walls[0]!.start.x + doc.openings[0]!.offset + doc.openings[0]!.width / 2;
  // Exercise two focus buttons and projection in the same task: no animation frame can
  // repair stale camera matrices between the pose change and this independent check.
  const projection = await page.evaluate(
    async (point) => {
      const url = performance
          .getEntriesByType('resource')
          .map((entry) => entry.name)
          .find((name) => /\/three\.js(?:\?|$)/.test(name)),
        THREE = await import(url!);
      const buttons = [...document.querySelectorAll('button')],
        top = buttons.find((button) => button.textContent === '俯视')!,
        all = buttons.find((button) => button.textContent === '查看整栋')!;
      top.click();
      all.click();
      const editor = (window as unknown as Instrumented).__editor,
        state = editor.diagnostics() as RuntimeDiagnostics,
        actual = editor.project(point),
        canvas = document.querySelector('canvas')!,
        rect = canvas.getBoundingClientRect(),
        camera = new THREE.PerspectiveCamera(45, rect.width / rect.height, 0.05, 1500);
      camera.position.fromArray(state.camera.position);
      camera.lookAt(new THREE.Vector3().fromArray(state.camera.target));
      camera.updateMatrixWorld(true);
      const ndc = new THREE.Vector3(point.x, point.y, point.z).project(camera),
        expected = {
          x: rect.left + ((ndc.x + 1) * rect.width) / 2,
          y: rect.top + ((1 - ndc.y) * rect.height) / 2,
        };
      return { actual, expected, error: Math.hypot(actual.x - expected.x, actual.y - expected.y) };
    },
    { x: centre, y: 1.4, z: -1 },
  );
  expect(projection.error).toBeLessThan(1e-6);
  const start = projection.actual;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  expect((await diagnostics(page)).preview.dragging).toBe(true);
  await page.mouse.move(start.x + 25, start.y, { steps: 6 });
  expect((await diagnostics(page)).preview.valid).toBe(true);
  await page.mouse.up();
  doc = await documentOf(page);
  expect(doc.openings[0]!.offset).not.toBe(0.6);
  expect(
    await page.evaluate(() => (window as unknown as Instrumented).__editor.history().undoCount),
  ).toBe(count + 1);
  const window = doc.openings[0]!,
    wall = doc.walls[0]!,
    wallId = wall.id,
    holeX = wall.start.x + window.offset + window.width / 2,
    holeY = window.sill + window.height / 2;
  async function inspectExport(name: string) {
    const wait = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出 GLB', exact: true }).click();
    const download = await wait;
    const file = resolve(testInfo.outputDir, name);
    await download.saveAs(file);
    const bytes = await readFile(file);
    expect((await validateBytes(bytes, { uri: name })).issues.numErrors).toBe(0);
    const loader = `/@fs/${resolve('node_modules/three/examples/jsm/loaders/GLTFLoader.js').replaceAll('\\', '/')}`;
    return page.evaluate(
      async ({ loader, bytes, wallId, holeX, holeY, solidX }) => {
        const { GLTFLoader } = await import(loader),
          url = performance
            .getEntriesByType('resource')
            .map((entry) => entry.name)
            .find((name) => /\/three\.js(?:\?|$)/.test(name)),
          THREE = await import(url!);
        const gltf = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
        gltf.scene.updateMatrixWorld(true);
        const wall = gltf.scene.getObjectByName(`Wall_${wallId}`);
        if (!wall) {
          throw new Error('Independent export wall missing');
        }
        const ray = (x: number) =>
          new THREE.Raycaster(
            new THREE.Vector3(x, holeY, 3),
            new THREE.Vector3(0, 0, -1),
          ).intersectObject(wall, true).length;
        let glass = 0;
        gltf.scene.traverse((node: { name: string }) => {
          if (node.name.startsWith('Glass_')) {
            glass++;
          }
        });
        return { hole: ray(holeX), solid: ray(solidX), glass, animations: gltf.animations.length };
      },
      { loader, bytes: [...bytes], wallId, holeX, holeY, solidX: wall.start.x + 0.2 },
    );
  }
  expect(await inspectExport('window-open-hole.glb')).toEqual({
    hole: 0,
    solid: 1,
    glass: 1,
    animations: 0,
  });
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click();
  expect((await documentOf(page)).openings).toHaveLength(0);
  expect((await diagnostics(page)).rebuiltIds).toContain(wallId);
  expect(await inspectExport('window-deleted-restored-wall.glb')).toEqual({
    hole: 1,
    solid: 1,
    glass: 0,
    animations: 0,
  });
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await documentOf(page)).openings).toEqual(doc.openings);
  expect(await inspectExport('window-undo-real-hole.glb')).toEqual({
    hole: 0,
    solid: 1,
    glass: 1,
    animations: 0,
  });
});
