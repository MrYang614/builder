import { choose } from './browser-controls';
import { test, expect, type Page } from '@playwright/test';
import { readFile, mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ProjectDocument } from '@building/editor-core';
type Instrumented = {
  __editor: {
    document: () => ProjectDocument;
    history: () => { undoCount: number };
    diagnostics: () => {
      rendererId: string;
      frameCount: number;
      geometries: number;
      textures: number;
      pendingFrame: boolean;
    };
    project: (p: { x: number; y: number; z: number }) => { x: number; y: number };
  };
};
const snapshot = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.document());
async function clickWorld(page: Page, x: number, z: number, y = 0) {
  const p = await page.evaluate((p) => (window as unknown as Instrumented).__editor.project(p), {
    x,
    y,
    z,
  });
  await page.mouse.click(p.x, p.y);
}

async function setNumber(page: Page, label: string, value: string) {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(value);
  await input.press('Enter');
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.waitForFunction(() => !!(window as unknown as Instrumented).__editor);
});

test('real mouse L walls, movable opening, command dimensions, cancel and undo', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await clickWorld(page, -2, -1);
  await clickWorld(page, 0.4, -1);
  await clickWorld(page, 0.4, 0.8);
  await page.keyboard.press('Escape');
  let doc = await snapshot(page);
  expect(doc.walls).toHaveLength(2);
  expect(
    Math.hypot(
      doc.walls[0]!.end.x - doc.walls[0]!.start.x,
      doc.walls[0]!.end.z - doc.walls[0]!.start.z,
    ),
  ).toBeCloseTo(2.4, 5);
  await page.getByRole('radio', { name: '门', exact: true }).click();
  await clickWorld(page, -1.4, -0.9, 1);
  doc = await snapshot(page);
  expect(doc.openings).toHaveLength(1);
  await page.getByRole('radio', { name: '选择', exact: true }).click();
  await expect(page.getByLabel('洞口距墙参考端（m）', { exact: true })).toBeVisible();
  await setNumber(page, '洞口距墙参考端（m）', '0.5');
  expect((await snapshot(page)).openings[0]!.offset).toBe(0.5);
  const before = await page.evaluate(
    () => (window as unknown as Instrumented).__editor.history().undoCount,
  );
  const door = (await snapshot(page)).openings[0]!,
    wall = (await snapshot(page)).walls[0]!;
  const point = await page.evaluate(
    (p) => (window as unknown as Instrumented).__editor.project(p),
    { x: wall.start.x + door.offset + door.width / 2, y: 1, z: -0.9 },
  );
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 25, point.y, { steps: 8 });
  await page.mouse.up();
  expect(
    await page.evaluate(() => (window as unknown as Instrumented).__editor.history().undoCount),
  ).toBe(before + 1);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await snapshot(page)).openings[0]!.offset).toBe(0.5);
  const old = await snapshot(page);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 20, point.y, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await snapshot(page)).toEqual(old);
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();
  await setNumber(page, '轴线长度（m）', '1');
  expect((await snapshot(page)).walls[0]!.end).toEqual(old.walls[0]!.end);
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: '关闭提示', exact: true }).click();
  await setNumber(page, '轴线长度（m）', '3.2');
  expect((await snapshot(page)).walls[0]!.end.x).toBeCloseTo(1.2);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await snapshot(page)).walls[0]!.end).toEqual(old.walls[0]!.end);
  expect(errors).toEqual([]);
});

test('portable file flow, real local image, half-open door and animated GLB download', async ({
  page,
}, testInfo) => {
  await page.getByRole('button', { name: '庭院样板', exact: true }).click();
  await expect(page.getByRole('button', { name: '门 6', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();
  await choose(page, '表面', 'B 面');
  const source = resolve(testInfo.outputDir, 'original image 中文.png');
  await mkdir(testInfo.outputDir, { recursive: true });
  await writeFile(source, await readFile(resolve('apps/desktop/src/assets/tile.png')));
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '导入 PNG／JPEG', exact: true }).click();
  await (await chooser).setFiles(source);
  await expect.poll(async () => (await snapshot(page)).resources.length).toBe(5);
  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const projectDownload = await saved;
  const moved = resolve(testInfo.outputDir, 'moved folder 中文/project.building');
  await mkdir(resolve(testInfo.outputDir, 'moved folder 中文'), { recursive: true });
  await projectDownload.saveAs(moved);
  await unlink(source);
  await expect(page.getByTestId('dirty-state')).toHaveText('已保存');
  const original = await snapshot(page);
  const fileChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await (await fileChooser).setFiles(moved);
  await expect.poll(async () => (await snapshot(page)).id).toBe(original.id);
  expect((await snapshot(page)).resources).toEqual(original.resources);
  const exportDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 GLB', exact: true }).click();
  const glb = await exportDownload;
  await glb.saveAs(resolve(testInfo.outputDir, 'actual-editor.glb'));
  const bytes = await readFile(resolve(testInfo.outputDir, 'actual-editor.glb'));
  const validator = await import('gltf-validator');
  const report = await validator.validateBytes(bytes, { uri: 'actual-editor.glb' });
  expect(report.issues.numErrors).toBe(0);
  const jsonLength = bytes.readUInt32LE(12),
    json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  expect(json.animations).toHaveLength(4);
  expect(json.images.length).toBeGreaterThan(0);
  expect(json.nodes.some((n: { name?: string }) => n.name?.includes('Grid'))).toBe(false);
  expect(await snapshot(page)).toEqual(original);
  await page.getByRole('button', { name: '新建', exact: true }).click();
  expect((await snapshot(page)).walls).toHaveLength(0);
});

test('theme, system changes, bilingual portals, input routing and stable runtime', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('button', { name: '庭院样板', exact: true }).click();
  const original = await snapshot(page),
    runtimeId = await page.evaluate(
      () => (window as unknown as Instrumented).__editor.diagnostics().rendererId,
    );
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();
  await choose(page, '表面', '厚度面／洞口内侧');
  await expect(page.getByRole('button', { name: '导入 PNG／JPEG', exact: true })).toHaveCount(0);
  const input = page.getByLabel('轴线长度（m）', { exact: true });
  await input.focus();
  await input.press('Delete');
  expect((await snapshot(page)).walls).toHaveLength(8);
  await input.press('Escape');
  await choose(page, '外观', '暗色');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.keyboard.press('Delete');
  expect(await snapshot(page)).toEqual(original);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await choose(page, '语言', 'English');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Settings');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as Instrumented).__editor.diagnostics().rendererId,
    ),
  ).toBe(runtimeId);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await choose(page, 'Appearance', 'Light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await choose(page, 'Appearance', 'Dark');
  await page.screenshot({ path: testInfo.outputPath('editor-dark-en.png') });
  await expect(page.locator('canvas')).toHaveCount(1);
  expect(errors).toEqual([]);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('floor slab cap, current-floor interaction filtering and idle rendering', async ({ page }) => {
  await page.getByRole('radio', { name: '楼板', exact: true }).click();
  await clickWorld(page, -2, -2);
  await clickWorld(page, 2, 2);
  expect((await snapshot(page)).slabs).toHaveLength(1);
  await page.getByRole('button', { name: '新增楼层', exact: true }).click();
  expect((await snapshot(page)).levels).toHaveLength(2);
  await choose(page, '楼板用途', '顶层封板');
  await setNumber(page, '封板上表面标高（m）', '6');
  await clickWorld(page, -2, -2, 3);
  await clickWorld(page, 2, 2, 3);
  let doc = await snapshot(page);
  expect(doc.slabs).toHaveLength(2);
  expect(doc.slabs[1]!.purpose).toBe('roof');
  expect(doc.slabs[1]!.elevation).toBe(6);
  await page.getByRole('radio', { name: '选择', exact: true }).click();
  await clickWorld(page, 0, 0, 0);
  await expect(page.getByLabel('位置 X（m）', { exact: true })).toHaveCount(0);
  await page.waitForFunction(
    () => !(window as unknown as Instrumented).__editor.diagnostics().pendingFrame,
  );
  const frames = await page.evaluate(
    () => (window as unknown as Instrumented).__editor.diagnostics().frameCount,
  );
  await page.waitForTimeout(250);
  expect(
    await page.evaluate(
      () => (window as unknown as Instrumented).__editor.diagnostics().frameCount,
    ),
  ).toBe(frames);
  await page.getByRole('button', { name: '顶层封板 1', exact: true }).click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click();
  expect((await snapshot(page)).slabs).toHaveLength(1);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  doc = await snapshot(page);
  expect(doc.slabs).toHaveLength(2);
  expect(doc.slabs[1]!.purpose).toBe('roof');
});
