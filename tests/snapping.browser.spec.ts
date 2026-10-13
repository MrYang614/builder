import { evidencePath } from './evidence-path';
import { startPathTracing } from './render-controls';
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { EditorSession, ProjectDocument } from '@building/editor-core';
import type { ThreeRuntime } from '@building/three-runtime';
import { choose } from './browser-controls';

type Diagnostics = ReturnType<ThreeRuntime['diagnostics']>;
type Instrumented = {
  __editor: {
    document(): ProjectDocument;
    session(): EditorSession;
    diagnostics(): Diagnostics;
    history(): { undoCount: number; redoCount: number };
    project(point: { x: number; y: number; z: number }): { x: number; y: number };
  };
};
const documentOf = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.document());
const diagnostics = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.diagnostics());
const history = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.history());
const session = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.session());
const project = (page: Page, x: number, z: number, y = 0) =>
  page.evaluate((point) => (window as unknown as Instrumented).__editor.project(point), {
    x,
    y,
    z,
  });

async function moveWorld(page: Page, x: number, z: number, y = 0) {
  const point = await project(page, x, z, y);
  await page.mouse.move(point.x, point.y);
  return point;
}
async function clickWorld(page: Page, x: number, z: number, y = 0) {
  const point = await project(page, x, z, y);
  await page.mouse.click(point.x, point.y);
}
async function idle(page: Page) {
  await page.waitForFunction(() => {
    const state = (window as unknown as Instrumented).__editor.diagnostics();
    return !state.pendingFrame && !state.render.switching && !state.render.environmentLoading;
  });
}
async function start(page: Page) {
  const errors: string[] = [];
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
  await page.getByRole('button', { name: '俯视', exact: true }).click();
  await idle(page);
  return errors;
}
async function drawWall(page: Page, x1: number, z1: number, x2: number, z2: number) {
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await clickWorld(page, x1, z1);
  await clickWorld(page, x2, z2);
  await page.keyboard.press('Escape');
}
async function setSnap(page: Page, enabled: boolean, name = '吸附') {
  const button = page.getByRole('button', { name, exact: true });
  if ((await button.getAttribute('aria-pressed')) !== String(enabled)) {
    await button.click();
  }
  await expect(button).toHaveAttribute('aria-pressed', String(enabled));
  expect((await session(page)).snap.enabled).toBe(enabled);
}
async function evidence(name: string, value: unknown, testInfo: TestInfo) {
  const directory = resolve(evidencePath('snapping'));
  await mkdir(directory, { recursive: true });
  const json = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(resolve(directory, `${name}.json`), json);
  await testInfo.attach(name, { body: json, contentType: 'application/json' });
}
async function screenshot(page: Page, name: string, testInfo: TestInfo) {
  await idle(page);
  await mkdir(resolve(evidencePath('snapping')), { recursive: true });
  const path = resolve(evidencePath('snapping'), `${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

/** Measures real mouse dispatch and runtime counters; this is not an FPS benchmark. */
async function trajectory(page: Page, enabled: boolean) {
  await setSnap(page, enabled);
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  const world = Array.from({ length: 40 }, (_, index) => ({
    x: -2.6 + (index * 5.2) / 39,
    z: index % 2 === 0 ? -0.94 : -0.72,
  }));
  const pixels = [];
  for (const point of world) {
    pixels.push(await project(page, point.x, point.z));
  }
  await idle(page);
  const before = await diagnostics(page),
    started = await page.evaluate(() => performance.now());
  for (const point of pixels) {
    await page.mouse.move(point.x, point.y);
  }
  await idle(page);
  const elapsedMs = (await page.evaluate(() => performance.now())) - started,
    after = await diagnostics(page);
  return {
    enabled,
    world,
    pixels,
    elapsedMs,
    frameCount: after.frameCount - before.frameCount,
    queries: after.snap.queries - before.snap.queries,
    queryMs: after.snap.queryMs - before.snap.queryMs,
    rebuilds: after.snap.rebuilds - before.snap.rebuilds,
    objectBuilds: after.snap.objectBuilds - before.snap.objectBuilds,
    boundaryBuilds: after.snap.boundaryBuilds - before.snap.boundaryBuilds,
    boundaryGroupBuilds: after.snap.boundaryGroupBuilds - before.snap.boundaryGroupBuilds,
  };
}

test.use({ viewport: { width: 900, height: 600 } });

test('separate wall strokes join exactly; finite lines, incremental scene edits, ghost floors and camera projection stay current', async ({
  page,
}, testInfo) => {
  test.setTimeout(150000);
  const errors = await start(page);
  await drawWall(page, -2, -1, 2, -1);
  const first = (await documentOf(page)).walls[0]!;
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await moveWorld(page, first.end.x + 0.06, first.end.z + 0.05);
  expect((await diagnostics(page)).snap.result).toMatchObject({
    kind: 'point',
    objectId: first.id,
    point: first.end,
  });
  await clickWorld(page, first.end.x + 0.06, first.end.z + 0.05);
  await clickWorld(page, first.end.x, first.end.z + 2);
  await page.keyboard.press('Escape');
  const joined = await documentOf(page);
  expect(joined.walls).toHaveLength(2);
  expect(joined.walls[1]!.start).toEqual(first.end);
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await moveWorld(page, 0.3, -0.97);
  expect((await diagnostics(page)).snap.result).toMatchObject({ kind: 'line', objectId: first.id });
  expect((await diagnostics(page)).snap.result?.segment).toBeDefined();
  await screenshot(page, 'two-walls-finite-line', testInfo);
  await moveWorld(page, 3.4, 3.4);
  expect((await diagnostics(page)).snap.result?.objectId).toBeUndefined();

  await page.getByRole('radio', { name: '选择', exact: true }).click();
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();
  const indexBefore = (await diagnostics(page)).snap;
  await page.getByLabel('起点 X（m）', { exact: true }).fill('-1.5');
  await page.getByLabel('起点 X（m）', { exact: true }).press('Enter');
  const edited = (await documentOf(page)).walls[0]!;
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await moveWorld(page, edited.end.x + 0.04, edited.end.z + 0.04);
  const indexAfter = (await diagnostics(page)).snap;
  expect(indexAfter.result).toMatchObject({ kind: 'point', objectId: first.id, point: edited.end });
  expect(indexAfter.objectBuilds).toBeGreaterThan(indexBefore.objectBuilds);
  expect(indexAfter.rebuilds).toBeGreaterThan(indexBefore.rebuilds);

  await page.getByRole('button', { name: '新增楼层', exact: true }).click();
  const floor = (await documentOf(page)).levels[1]!;
  await page.getByRole('button', { name: '俯视', exact: true }).click();
  await moveWorld(page, edited.end.x + 0.04, edited.end.z + 0.04, floor.elevation);
  expect((await diagnostics(page)).snap.result?.objectId).toBeUndefined();
  expect((await diagnostics(page)).snap.result?.levelId).toBe(floor.id);
  await page.locator('.floor-item').first().click();
  await page.getByRole('button', { name: '俯视', exact: true }).click();
  await moveWorld(page, edited.end.x + 0.04, edited.end.z + 0.04);
  expect((await diagnostics(page)).snap.result?.point).toEqual(edited.end);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(480, 330, { steps: 4 });
  await page.mouse.up({ button: 'right' });
  expect((await diagnostics(page)).snap.markerVisible).toBe(false);
  await page.getByRole('button', { name: '俯视', exact: true }).click();
  await moveWorld(page, edited.end.x + 0.04, edited.end.z + 0.04);
  expect((await diagnostics(page)).snap.result?.point).toEqual(edited.end);
  await page.setViewportSize({ width: 1100, height: 700 });
  await idle(page);
  expect((await diagnostics(page)).snap.markerVisible).toBe(false);
  await page.setViewportSize({ width: 900, height: 600 });
  await idle(page);
  await page.mouse.move(450, 300);
  await moveWorld(page, edited.end.x + 0.04, edited.end.z + 0.04);
  expect((await diagnostics(page)).snap.result?.point).toEqual(edited.end);
  await screenshot(page, 'two-walls-endpoint-after-camera-resize', testInfo);

  const enabled = await trajectory(page, true),
    disabled = await trajectory(page, false),
    environment = await page.evaluate(() => {
      const rect = document.querySelector('canvas')!.getBoundingClientRect();
      return {
        viewport: { width: innerWidth, height: innerHeight },
        canvas: { width: rect.width, height: rect.height },
        dpr: devicePixelRatio,
        userAgent: navigator.userAgent,
      };
    });
  expect(enabled.queries).toBeGreaterThan(0);
  expect(disabled.queries).toBe(0);
  expect(errors).toEqual([]);
  await evidence(
    'mouse-trajectory-performance',
    {
      platform: 'Chromium SwiftShader browser; no Tauri, native hardware, or FPS claim',
      scene: { levels: 2, walls: 2, slabs: 0, openings: 0 },
      environment,
      enabled,
      disabled,
      errors,
    },
    testInfo,
  );
});

test('real wall endpoint drag snaps to a slab vertex without changing the document until one commit; Escape and pointercancel restore it', async ({
  page,
}, testInfo) => {
  const errors = await start(page);
  await page.getByRole('radio', { name: '楼板', exact: true }).click();
  await clickWorld(page, -2, -2);
  await clickWorld(page, 2, 2);
  await page.keyboard.press('Escape');
  await drawWall(page, -2, -3, -2, -1);
  await page.getByRole('radio', { name: '选择', exact: true }).click();
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();
  const saved = await documentOf(page),
    count = (await history(page)).undoCount;
  let expected = saved;
  const drag = async () => {
    await moveWorld(page, -2, -3, 0.15);
    await page.mouse.down();
    const target = await project(page, -2.04, -1.96);
    await page.mouse.move(target.x, target.y, { steps: 8 });
    expect((await diagnostics(page)).preview.dragging).toBe(true);
    expect((await diagnostics(page)).snap.result).toMatchObject({
      kind: 'point',
      targetKind: 'slab-vertex',
      point: { x: -2, z: -2 },
    });
    await expect(page.locator('.status-bar')).toContainText('已吸附到楼板顶点');
    expect(await documentOf(page)).toEqual(expected);
    expect((await history(page)).undoCount).toBe(count);
  };
  await drag();
  await screenshot(page, 'wall-endpoint-slab-vertex-preview', testInfo);
  await page.mouse.up();
  expect((await documentOf(page)).walls[0]!.start).toEqual({ x: -2, z: -2 });
  expect((await history(page)).undoCount).toBe(count + 1);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await documentOf(page)).walls).toEqual(saved.walls);
  expected = await documentOf(page);
  await drag();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await documentOf(page)).toEqual(expected);
  expect((await history(page)).undoCount).toBe(count);
  expect((await diagnostics(page)).snap.markerVisible).toBe(false);
  await drag();
  // The drag uses real mouse events; pointercancel is the browser's cancellation event.
  await page.locator('canvas').dispatchEvent('pointercancel', { pointerId: 1, bubbles: true });
  await page.mouse.up();
  expect(await documentOf(page)).toEqual(expected);
  expect((await history(page)).undoCount).toBe(count);
  expect((await diagnostics(page)).preview.visible).toBe(false);
  expect((await diagnostics(page)).snap.markerVisible).toBe(false);
  expect(errors).toEqual([]);
});

test('disabled and Alt input remain raw; repeated toggles preserve history and listeners; read-only and path tracing clear feedback', async ({
  page,
}, testInfo) => {
  test.setTimeout(150000);
  const errors = await start(page);
  await drawWall(page, -2, -1, 2, -1);
  const first = (await documentOf(page)).walls[0]!;
  await setSnap(page, false);
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await moveWorld(page, 2.141, -0.947);
  const raw = (await diagnostics(page)).snap.result!;
  expect(raw.kind).toBe('raw');
  expect(raw.point).not.toEqual(first.end);
  expect((await diagnostics(page)).snap.markerVisible).toBe(false);
  await clickWorld(page, 2.141, -0.947);
  await clickWorld(page, 2.141, 1.3);
  await page.keyboard.press('Escape');
  expect((await documentOf(page)).walls[1]!.start).toEqual(raw.point);
  await setSnap(page, true);
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await page.keyboard.down('Alt');
  await moveWorld(page, -2.141, -0.947);
  const bypass = (await diagnostics(page)).snap.result!;
  expect(bypass.kind).toBe('raw');
  await clickWorld(page, -2.141, -0.947);
  await clickWorld(page, -2.141, 1.3);
  await page.keyboard.up('Alt');
  await page.keyboard.press('Escape');
  expect((await documentOf(page)).walls[2]!.start).toEqual(bypass.point);
  const formal = await documentOf(page),
    before = await history(page),
    listeners = (await diagnostics(page)).eventListeners;
  for (let index = 0; index < 10; index++) {
    await page.getByRole('button', { name: '吸附', exact: true }).click();
  }
  expect((await session(page)).snap.enabled).toBe(true);
  expect(await documentOf(page)).toEqual(formal);
  expect(await history(page)).toEqual(before);
  expect((await diagnostics(page)).eventListeners).toBe(listeners);
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await moveWorld(page, 2.04, -1.04);
  expect((await diagnostics(page)).snap.markerVisible).toBe(true);
  await page.getByRole('checkbox', { name: '整栋预览（只读）', exact: true }).check();
  await expect(page.getByRole('button', { name: '吸附', exact: true })).toBeDisabled();
  expect((await diagnostics(page)).snap.markerVisible).toBe(false);
  await page.getByRole('checkbox', { name: '整栋预览（只读）', exact: true }).uncheck();
  await moveWorld(page, 2.04, -1.04);
  await startPathTracing(page);
  await expect.poll(async () => (await diagnostics(page)).render.mode).toBe('pathtrace');
  await expect(page.getByRole('button', { name: '吸附', exact: true })).toBeDisabled();
  expect((await diagnostics(page)).snap.markerVisible).toBe(false);
  expect((await diagnostics(page)).pathTracing.auxiliaryObjects).toBe(0);
  await expect
    .poll(async () => (await diagnostics(page)).pathTracing.stats?.samples ?? 0)
    .toBeGreaterThanOrEqual(1);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await screenshot(page, 'path-tracing-no-snap-feedback', testInfo);
  await page.getByRole('button', { name: '返回实时编辑', exact: true }).click();
  await expect.poll(async () => (await diagnostics(page)).render.mode).toBe('raster');
  expect((await diagnostics(page)).snap.markerVisible).toBe(false);
  expect(await documentOf(page)).toEqual(formal);
  expect(await history(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('a real body drag retains its grab offset while its formal anchor snaps to a slab vertex', async ({
  page,
}, testInfo) => {
  const errors = await start(page);
  await page.getByRole('radio', { name: '楼板', exact: true }).click();
  await clickWorld(page, -2, -2);
  await clickWorld(page, 2, 2);
  await page.keyboard.press('Escape');
  await drawWall(page, -3, -3, -3, -1);
  await page.getByRole('radio', { name: '选择', exact: true }).click();
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();
  const before = await documentOf(page),
    count = (await history(page)).undoCount;
  await moveWorld(page, -3, -2.6, 2.8);
  await page.mouse.down();
  expect((await diagnostics(page)).preview.dragging).toBe(true);
  const grab = (await diagnostics(page)).snap.result!.point;
  const target = await project(
    page,
    -2 + grab.x - before.walls[0]!.start.x + 0.04,
    -2 + grab.z - before.walls[0]!.start.z + 0.04,
  );
  await page.mouse.move(target.x, target.y, { steps: 8 });
  expect((await diagnostics(page)).snap.result).toMatchObject({
    kind: 'point',
    targetKind: 'slab-vertex',
    point: { x: -2, z: -2 },
  });
  await expect(page.locator('.status-bar')).toContainText('已吸附到楼板顶点');
  expect(await documentOf(page)).toEqual(before);
  expect((await history(page)).undoCount).toBe(count);
  await screenshot(page, 'whole-wall-grab-offset-preview', testInfo);
  await page.mouse.up();
  const moved = (await documentOf(page)).walls[0]!;
  expect(moved.start).toEqual({ x: -2, z: -2 });
  expect(moved.end).toEqual({ x: -2, z: 0 });
  expect((await history(page)).undoCount).toBe(count + 1);
  expect(errors).toEqual([]);
});

test('an off-axis endpoint is rejected before the wall preview and commit enforce the locked axis', async ({
  page,
}) => {
  const errors = await start(page);
  await drawWall(page, 4, 0.1, 4, 2.1);
  const saved = await documentOf(page);
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await clickWorld(page, 0, 0);
  await moveWorld(page, 4, 0.09);
  const state = await diagnostics(page);
  expect(state.snap.result?.point.x).toBe(4);
  expect(state.snap.result?.point.z === 0).toBe(true);
  expect(state.snap.result?.objectId).toBeUndefined();
  expect(state.preview.state).toMatchObject({ kind: 'preview', end: { x: 4 } });
  expect('end' in state.preview.state && state.preview.state.end.z === 0).toBe(true);
  expect(await documentOf(page)).toEqual(saved);
  await clickWorld(page, 4, 0.09);
  expect((await documentOf(page)).walls).toHaveLength(2);
  expect((await documentOf(page)).walls[1]!.end.x).toBe(4);
  expect((await documentOf(page)).walls[1]!.end.z === 0).toBe(true);
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('session snap policy controls point versus line targets, metre tolerance and grid spacing without document history', async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  const errors = await start(page);
  await drawWall(page, -2, -1, 2, -1);
  const formal = await documentOf(page),
    count = await history(page),
    toleranceLabel = '吸附公差（m，大于 0 至 1）',
    gridLabel = '网格间距（m，大于 0 至 10）';
  const open = async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('group', { name: '几何吸附', exact: true }).scrollIntoViewIfNeeded();
  };
  const close = async () => {
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('radio', { name: '墙体', exact: true }).click();
  };
  const numeric = async (label: string, value: string) => {
    const input = page.getByLabel(label, { exact: true });
    await input.fill(value);
    await input.press('Enter');
  };
  await open();
  await choose(page, '吸附目标', '仅点');
  await numeric(toleranceLabel, '.04');
  await numeric(gridLabel, '.25');
  for (const [label, values] of [
    [toleranceLabel, ['0', '-0.1', '1.1', 'NaN']],
    [gridLabel, ['0', '-1', '11']],
  ] as const) {
    for (const value of values) {
      await numeric(label, value);
      await expect(page.getByLabel(label, { exact: true })).toHaveAttribute('aria-invalid', 'true');
      expect((await session(page)).snap).toMatchObject({
        mode: 'points',
        tolerance: 0.04,
        gridSize: 0.25,
      });
      await page.getByLabel(label, { exact: true }).press('Escape');
      await expect(page.getByLabel(label, { exact: true })).toHaveAttribute(
        'aria-invalid',
        'false',
      );
    }
  }
  await page.getByLabel(gridLabel, { exact: true }).scrollIntoViewIfNeeded();
  const bounds = await page.getByLabel(gridLabel, { exact: true }).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      visible:
        rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth,
      width: rect.width,
      height: rect.height,
    };
  });
  expect(bounds.visible).toBe(true);
  await screenshot(page, 'snap-policy-settings-900x600', testInfo);
  await close();
  await moveWorld(page, 0.3, -0.97);
  expect((await diagnostics(page)).snap.result?.kind).toBe('raw');
  expect((await diagnostics(page)).snap.markerVisible).toBe(false);
  await moveWorld(page, 2.025, -0.985);
  expect((await diagnostics(page)).snap.result).toMatchObject({
    kind: 'point',
    point: { x: 2, z: -1 },
  });
  await moveWorld(page, 2.08, -0.93);
  expect((await diagnostics(page)).snap.result?.kind).toBe('raw');
  await open();
  await choose(page, '吸附目标', '仅线');
  await numeric(toleranceLabel, '.16');
  await close();
  await moveWorld(page, 0.3, -0.97);
  expect((await diagnostics(page)).snap.result).toMatchObject({
    kind: 'line',
    point: { z: -1 },
  });
  await open();
  await choose(page, '吸附目标', '仅网格');
  await close();
  await moveWorld(page, 3.08, 2.08);
  expect((await diagnostics(page)).snap.result).toMatchObject({
    kind: 'grid',
    point: { x: 3, z: 2 },
  });
  expect(await documentOf(page)).toEqual(formal);
  expect(await history(page)).toEqual(count);
  expect(errors).toEqual([]);
  await evidence(
    'session-policy-settings',
    { viewport: { width: 900, height: 600 }, bounds, snap: (await session(page)).snap, errors },
    testInfo,
  );
});

test('snap controls show localized state, keyboard focus, tooltip and disabled state in four 900x600 language/theme combinations', async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  const errors = await start(page),
    formal = await documentOf(page),
    count = await history(page),
    variants = [];
  for (const language of ['zh-CN', 'en'] as const) {
    if (language === 'en') {
      await choose(page, '语言', 'English');
    }
    const text =
      language === 'en'
        ? {
            snap: 'Snap',
            on: 'Snap on',
            off: 'Snap off',
            appearance: 'Appearance',
            light: 'Light',
            dark: 'Dark',
            preview: 'Building preview (read only)',
            hint: 'Hold Alt/Option',
          }
        : {
            snap: '吸附',
            on: '已开启吸附',
            off: '已关闭吸附',
            appearance: '外观',
            light: '亮色',
            dark: '暗色',
            preview: '整栋预览（只读）',
            hint: 'Alt／Option',
          };
    for (const theme of ['light', 'dark'] as const) {
      await choose(page, text.appearance, text[theme]);
      await setSnap(page, true, text.snap);
      const button = page.getByRole('button', { name: text.snap, exact: true });
      await expect(button).toHaveText(text.on);
      await button.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await expect(button).toBeFocused();
      const focus = await button.evaluate((element) => {
        const rect = element.getBoundingClientRect(),
          style = getComputedStyle(element);
        return {
          indicator: style.outlineStyle !== 'none' || style.boxShadow !== 'none',
          contained:
            rect.x >= 0 && rect.y >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
          width: rect.width,
          height: rect.height,
        };
      });
      expect(focus.indicator).toBe(true);
      expect(focus.contained).toBe(true);
      await page.keyboard.press('Space');
      await expect(button).toHaveAttribute('aria-pressed', 'false');
      await expect(button).toHaveText(text.off);
      expect((await session(page)).snap.enabled).toBe(false);
      await button.hover();
      await expect(page.getByRole('tooltip')).toContainText(text.hint);
      await screenshot(page, `control-${language}-${theme}`, testInfo);
      await setSnap(page, true, text.snap);
      await page.getByRole('checkbox', { name: text.preview, exact: true }).check();
      await expect(button).toBeDisabled();
      await page.getByRole('checkbox', { name: text.preview, exact: true }).uncheck();
      await expect(button).toBeEnabled();
      variants.push({ language, theme, focus });
    }
  }
  expect(await documentOf(page)).toEqual(formal);
  expect(await history(page)).toEqual(count);
  expect(errors).toEqual([]);
  await evidence(
    'localized-control-focus',
    { viewport: { width: 900, height: 600 }, variants, errors },
    testInfo,
  );
});
