import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { EditorSession, ProjectDocument } from '@building/editor-core';
import { choose } from './browser-controls';

type Probe = {
  __editor: {
    document(): ProjectDocument;
    session(): EditorSession;
    history(): { undoCount: number; redoCount: number };
    diagnostics(): { rendererId: string; eventListeners: number };
  };
};

const documentOf = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__editor.document());
const historyOf = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__editor.history());
const diagnostics = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__editor.diagnostics());

/** Projects actual SVG world coordinates through its live viewBox, including resized viewports. */
async function screenPoint(page: Page, x: number, z: number) {
  return page.locator('svg.plan-canvas').evaluate(
    (element, point) => {
      const svg = element as SVGSVGElement;
      const local = svg.createSVGPoint();
      local.x = point.x;
      local.y = point.z;
      const screen = local.matrixTransform(svg.getScreenCTM()!);
      return { x: screen.x, y: screen.y };
    },
    { x, z },
  );
}

async function clickWorld(page: Page, x: number, z: number) {
  const point = await screenPoint(page, x, z);
  await page.mouse.click(point.x, point.y);
}

async function createWall(page: Page, a = { x: -3, z: -2 }, b = { x: 3, z: -2 }) {
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await clickWorld(page, a.x, a.z);
  await clickWorld(page, b.x, b.z);
  await page.keyboard.press('Escape');
  await page.getByRole('radio', { name: '选择', exact: true }).click();
}

async function setNumber(page: Page, label: string, value: string) {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(value);
  await field.press('Enter');
}

test.use({ viewport: { width: 1600, height: 900 } });
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Probe).__editor);
  await page.getByRole('radio', { name: '2D 平面', exact: true }).click();
  await expect(page.locator('.viewport-stage')).toHaveAttribute('data-phase', 'idle');
  await expect(page.locator('svg.plan-canvas')).toBeVisible();
});

test('SVG creates connected walls, a slab and hosted door/window using the formal command history', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await clickWorld(page, -3, -2);
  await clickWorld(page, 3, -2);
  await clickWorld(page, 3, 2);
  await page.keyboard.press('Escape');
  expect((await documentOf(page)).walls).toHaveLength(2);
  await page.getByRole('radio', { name: '楼板', exact: true }).click();
  await clickWorld(page, -3, -2);
  await clickWorld(page, 3, 2);
  await page.keyboard.press('Escape');
  await page.getByRole('radio', { name: '门', exact: true }).click();
  await clickWorld(page, -1.5, -2);
  await page.getByRole('radio', { name: '窗', exact: true }).click();
  await clickWorld(page, 3, 0);
  const document = await documentOf(page);
  expect(document.walls).toHaveLength(2);
  expect(document.slabs).toHaveLength(1);
  expect(document.openings.map((opening) => opening.kind)).toEqual(['door', 'window']);
  expect(document.openings[0].wallId).toBe(document.walls[0].id);
  expect(document.openings[1].wallId).toBe(document.walls[1].id);
  expect(document.slabs[0].polygon).toEqual([
    { x: -3, z: -2 },
    { x: 3, z: -2 },
    { x: 3, z: 2 },
    { x: -3, z: 2 },
  ]);
  expect((await historyOf(page)).undoCount).toBe(5);
  await expect(page.locator('.plan-scene > [data-object-id]')).toHaveCount(5);
  await expect(page.locator('.plan-opening .plan-swing')).toHaveCount(2);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await documentOf(page)).openings).toHaveLength(1);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  expect((await documentOf(page)).openings).toEqual(document.openings);
  expect(errors).toEqual([]);
});

test('endpoint drag previews leave the document untouched, commit once and cancel cleanly', async ({
  page,
}) => {
  await createWall(page, { x: -3, z: 0 }, { x: 3, z: 0 });
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();
  const before = await documentOf(page);
  const history = await historyOf(page);
  const start = await screenPoint(page, 3, 0);
  const end = await screenPoint(page, 4, 0);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  expect(await documentOf(page)).toEqual(before);
  expect(await historyOf(page)).toEqual(history);
  await page.mouse.up();
  expect((await documentOf(page)).walls[0].end).toEqual({ x: 4, z: 0 });
  expect((await historyOf(page)).undoCount).toBe(history.undoCount + 1);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await documentOf(page)).walls).toEqual(before.walls);
  const cancelled = await documentOf(page);
  const cancelledHistory = await historyOf(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await documentOf(page)).toEqual(cancelled);
  expect(await historyOf(page)).toEqual(cancelledHistory);
  await expect(page.locator('[data-handle="end"]')).toHaveAttribute('cx', '3');
});

test('inspector edits, invalid hosted changes and view switching keep one document and renderer', async ({
  page,
}) => {
  await createWall(page);
  await page.getByRole('radio', { name: '门', exact: true }).click();
  await clickWorld(page, 0, -2);
  await page.getByRole('radio', { name: '选择', exact: true }).click();
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();
  const renderer = await diagnostics(page);
  const canvas = await page.locator('.viewport canvas').elementHandle();
  const before = await documentOf(page);
  const history = await historyOf(page);
  await setNumber(page, '轴线长度（m）', '1');
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await documentOf(page)).toEqual(before);
  expect(await historyOf(page)).toEqual(history);
  await setNumber(page, '轴线长度（m）', '7');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect((await documentOf(page)).walls[0].end.x).toBe(4);
  await expect(page.locator('[data-handle="end"]')).toHaveAttribute('cx', '4');
  await page.getByRole('radio', { name: '3D 场景', exact: true }).click();
  await expect(page.locator('.viewport-stage')).toHaveAttribute('data-phase', 'idle');
  await expect(page.locator('.viewport canvas')).toBeVisible();
  await setNumber(page, '轴线长度（m）', '6.5');
  const changed = await documentOf(page);
  const changedHistory = await historyOf(page);
  await page.getByRole('radio', { name: '2D 平面', exact: true }).click();
  await expect(page.locator('.viewport-stage')).toHaveAttribute('data-phase', 'idle');
  await expect(page.locator('[data-handle="end"]')).toHaveAttribute('cx', '3.5');
  expect(await documentOf(page)).toEqual(changed);
  expect(await historyOf(page)).toEqual(changedHistory);
  expect((await diagnostics(page)).rendererId).toBe(renderer.rendererId);
  expect(
    await canvas!.evaluate((element) => element === document.querySelector('.viewport canvas')),
  ).toBe(true);
  await expect(page.locator('canvas')).toHaveCount(1);
});

test('captured wheel preserves the camera and drafts cancel on pointer cancellation, focus loss and mode changes', async ({
  page,
}) => {
  await createWall(page, { x: -3, z: 0 }, { x: 3, z: 0 });
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();
  const before = await documentOf(page);
  const history = await historyOf(page);
  const svg = page.locator('svg.plan-canvas');
  for (const reason of ['wheel', 'pointercancel', 'focus', 'window-blur']) {
    await page.getByRole('button', { name: '回到原点', exact: true }).click();
    const start = await screenPoint(page, 3, 0);
    const end = await screenPoint(page, 4, 0);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    if (reason !== 'wheel') {
      await page.mouse.move(end.x, end.y, { steps: 5 });
    }
    expect(await documentOf(page)).toEqual(before);
    if (reason === 'wheel') {
      const viewBox = await svg.getAttribute('viewBox');
      await page.mouse.wheel(0, -180);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await expect(svg).toHaveAttribute('viewBox', viewBox!);
    } else if (reason === 'focus') {
      await page.getByLabel('轴线长度（m）', { exact: true }).focus();
    } else if (reason === 'window-blur') {
      // Dispatch the browser cancellation boundary; this is not a native OS focus assertion.
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    } else {
      await svg.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
    }
    await page.mouse.up();
    expect(await documentOf(page)).toEqual(before);
    expect(await historyOf(page)).toEqual(history);
    await expect(page.locator('.plan-draft')).toHaveCount(0);
  }
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await clickWorld(page, -2, 2);
  const end = await screenPoint(page, 2, 2);
  await page.mouse.move(end.x, end.y);
  await page.getByRole('radio', { name: '3D 场景', exact: true }).click();
  await expect(page.locator('.viewport-stage')).toHaveAttribute('data-phase', 'idle');
  await page.getByRole('radio', { name: '2D 平面', exact: true }).click();
  await expect(page.locator('.viewport-stage')).toHaveAttribute('data-phase', 'idle');
  await clickWorld(page, 2, 2);
  expect(await documentOf(page)).toEqual(before);
  expect(await historyOf(page)).toEqual(history);
  await page.keyboard.press('Escape');
});

test('floor isolation, zoom, pan, duplicate and delete preserve formal ownership', async ({
  page,
}) => {
  await createWall(page);
  const first = (await documentOf(page)).walls[0];
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();
  await page.getByRole('button', { name: '复制', exact: true }).click();
  expect((await documentOf(page)).walls).toHaveLength(2);
  const copy = (await documentOf(page)).walls[1];
  expect(copy.start).toEqual({ x: first.start.x + 1, z: first.start.z + 1 });
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click();
  expect((await documentOf(page)).walls).toHaveLength(1);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await documentOf(page)).walls).toHaveLength(2);
  await page.getByRole('button', { name: '新增楼层', exact: true }).click();
  await expect(page.locator('.plan-scene > [data-object-id]')).toHaveCount(0);
  await clickWorld(page, 0, -2);
  expect(
    await page.evaluate(() => (window as unknown as Probe).__editor.session().selectedId),
  ).toBeUndefined();
  const before = await documentOf(page);
  const history = await historyOf(page);
  const svg = page.locator('svg.plan-canvas');
  const viewBox = await svg.getAttribute('viewBox');
  const center = await screenPoint(page, 0, 0);
  await page.mouse.move(center.x, center.y);
  await page.mouse.wheel(0, -240);
  await expect(svg).not.toHaveAttribute('viewBox', viewBox!);
  const zoomed = await svg.getAttribute('viewBox');
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(center.x + 50, center.y + 30, { steps: 6 });
  await page.mouse.up({ button: 'right' });
  await expect(svg).not.toHaveAttribute('viewBox', zoomed!);
  await page.getByRole('button', { name: '回到原点', exact: true }).click();
  await page.getByRole('button', { name: '适应当前层', exact: true }).click();
  expect(await documentOf(page)).toEqual(before);
  expect(await historyOf(page)).toEqual(history);
  await createWall(page, { x: -2, z: 1 }, { x: 2, z: 1 });
  const after = await documentOf(page);
  expect(after.walls[2].levelId).toBe(after.levels[1].id);
  await expect(page.locator('.plan-scene > [data-object-id]')).toHaveCount(1);
});

test('SVG-created geometry survives portable save/reopen and exports an animated clean GLB', async ({
  page,
}, testInfo) => {
  await createWall(page);
  await page.getByRole('radio', { name: '门', exact: true }).click();
  await clickWorld(page, 0, -2);
  await page.getByRole('radio', { name: '选择', exact: true }).click();
  const original = await documentOf(page);
  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const projectPath = testInfo.outputPath('svg-project.building');
  await (await saved).saveAs(projectPath);
  await expect(page.getByTestId('dirty-state')).toHaveText('已保存');
  const chooseFile = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await (await chooseFile).setFiles(projectPath);
  await expect.poll(async () => (await documentOf(page)).walls).toEqual(original.walls);
  expect((await documentOf(page)).openings).toEqual(original.openings);
  await expect(page.locator('.plan-scene > [data-object-id]')).toHaveCount(2);
  const exportDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 GLB', exact: true }).click();
  const glbPath = testInfo.outputPath('svg-project.glb');
  await (await exportDownload).saveAs(glbPath);
  const bytes = await readFile(glbPath);
  const validator = await import('gltf-validator');
  expect((await validator.validateBytes(bytes, { uri: 'svg-project.glb' })).issues.numErrors).toBe(
    0,
  );
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString()) as {
    animations: unknown[];
    nodes: { name?: string }[];
  };
  expect(json.animations).toHaveLength(2);
  expect(json.nodes.some((node) => /Grid|Selection|Preview|Plan/.test(node.name ?? ''))).toBe(
    false,
  );
});

for (const language of ['zh-CN', 'en'] as const) {
  for (const theme of ['dark', 'light'] as const) {
    test(`SVG plan layout and selected options in ${language}/${theme}`, async ({
      page,
    }, testInfo) => {
      await page.getByRole('button', { name: '庭院样板', exact: true }).click();
      if (language === 'en') {
        await choose(page, '语言', 'English');
      }
      const labels =
        language === 'en'
          ? {
              appearance: 'Appearance',
              fit: 'Fit floor',
              slab: 'Slab',
              purpose: 'Type',
              roof: 'Top cap',
              height: 'Cap top (m)',
              resize: 'Resize properties',
              select: 'Select',
              wall: 'Wall 1',
              door: 'Door 6',
            }
          : {
              appearance: '外观',
              fit: '适应当前层',
              slab: '楼板',
              purpose: '楼板用途',
              roof: '顶层封板',
              height: '封板上表面标高（m）',
              resize: '调整属性宽度',
              select: '选择',
              wall: '墙体 1',
              door: '门 6',
            };
      await choose(page, labels.appearance, theme === 'dark' ? 'Dark' : 'Light');
      const before = await documentOf(page);
      const history = await historyOf(page);
      await page.getByRole('radio', { name: labels.slab, exact: true }).click();
      await choose(page, labels.purpose, labels.roof);
      const splitter = page.getByRole('separator', { name: labels.resize, exact: true });
      await splitter.press('Home');
      for (const width of [1600, 900]) {
        await page.setViewportSize({ width, height: width === 900 ? 600 : 900 });
        await page.getByRole('radio', { name: labels.slab, exact: true }).click();
        await page.getByRole('button', { name: labels.fit, exact: true }).click();
        await expect(page.getByLabel(labels.height, { exact: true })).toBeVisible();
        const purpose = page.getByRole('combobox', { name: labels.purpose, exact: true });
        await expect(purpose).toContainText(labels.roof);
        const layout = await page.evaluate(() => {
          const svg = document.querySelector('svg.plan-canvas')!.getBoundingClientRect();
          return {
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight,
            svg: { width: svg.width, height: svg.height },
          };
        });
        expect(layout.width).toBe(width);
        expect(layout.height).toBe(width === 900 ? 600 : 900);
        expect(layout.svg.width).toBeGreaterThanOrEqual(300);
        expect(layout.svg.height).toBeGreaterThan(250);
        expect(await documentOf(page)).toEqual(before);
        expect(await historyOf(page)).toEqual(history);
        await page.screenshot({
          path: testInfo.outputPath(`plan-${language}-${theme}-${width}.png`),
        });
        await purpose.click();
        await expect(page.getByRole('option', { name: labels.roof, exact: true })).toBeVisible();
        await page.screenshot({
          path: testInfo.outputPath(`plan-options-${language}-${theme}-${width}.png`),
        });
        await page.keyboard.press('Escape');
        await page.getByRole('radio', { name: labels.select, exact: true }).click();
        await page.getByRole('button', { name: labels.wall, exact: true }).click();
        await expect(page.locator('.plan-selection [data-handle]')).toHaveCount(2);
        const dimension = page.locator('.plan-selection text');
        await expect(dimension).toHaveText('6 m');
        // Chromium's SVG bounding rect expands text strokes in user units even when the
        // stroke paints in screen pixels. Measure the rendered font scale independently.
        const fontBefore = await dimension.evaluate((element) => {
          const text = element as SVGTextElement;
          return parseFloat(getComputedStyle(text).fontSize) * Math.abs(text.getScreenCTM()!.d);
        });
        const center = await screenPoint(page, 0, -2);
        const viewBox = await page.locator('svg.plan-canvas').getAttribute('viewBox');
        await page.mouse.move(center.x, center.y);
        await page.mouse.wheel(0, -150);
        await expect(page.locator('svg.plan-canvas')).not.toHaveAttribute('viewBox', viewBox!);
        const fontAfter = await dimension.evaluate((element) => {
          const text = element as SVGTextElement;
          return parseFloat(getComputedStyle(text).fontSize) * Math.abs(text.getScreenCTM()!.d);
        });
        expect(fontBefore).toBeCloseTo(12, 3);
        expect(fontAfter).toBeCloseTo(fontBefore, 3);
        expect(await dimension.evaluate((element) => getComputedStyle(element).vectorEffect)).toBe(
          'non-scaling-stroke',
        );
        await page.screenshot({
          path: testInfo.outputPath(`plan-wall-zoom-${language}-${theme}-${width}.png`),
        });
        await page.getByRole('button', { name: labels.fit, exact: true }).click();
        await page.getByRole('button', { name: labels.door, exact: true }).click();
        await expect(page.locator('.plan-opening[data-selected="true"]')).toHaveCount(1);
        await expect(page.locator('.plan-selection text')).toHaveText('0.9 m');
        const readout = await page.locator('.plan-readout').boundingBox();
        const help = await page.locator('.plan-help').boundingBox();
        expect(readout!.y + readout!.height).toBeLessThanOrEqual(help!.y);
        await page.screenshot({
          path: testInfo.outputPath(`plan-door-${language}-${theme}-${width}.png`),
        });
        expect(await documentOf(page)).toEqual(before);
        expect(await historyOf(page)).toEqual(history);
      }
    });
  }
}
