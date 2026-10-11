import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import type { ProjectDocument } from '@building/editor-core';

type Probe = { __editor: { document(): ProjectDocument; history(): { undo: number } } };
const documentOf = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__editor.document());

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Probe).__editor);
});

test('focusing a precise numeric field preserves the formal value and history', async ({
  page,
}) => {
  const elevation = page.getByLabel('楼层基准标高（m）', { exact: true });
  await elevation.fill('0.123456789');
  await elevation.press('Enter');
  await page.getByRole('button', { name: '新增楼层', exact: true }).click();
  await page.locator('.floor-item').first().click();
  const before = await documentOf(page);
  await elevation.focus();
  await elevation.press('Tab');
  expect(await documentOf(page)).toEqual(before);
  await expect(elevation).toHaveValue('0.123456789');
});

test('level name follows undo and redo without discarding an active draft', async ({ page }) => {
  const name = page.getByLabel('名称', { exact: true });
  const original = (await documentOf(page)).levels[0]!.name;
  await name.fill('复核楼层');
  await page.locator('.panel-heading h2').click();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await documentOf(page)).levels[0]!.name).toBe(original);
  await expect(name).toHaveValue(original);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(name).toHaveValue('复核楼层');
  await name.fill('未提交草稿');
  await page.keyboard.press('Escape');
  await expect(name).toHaveValue('复核楼层');
  expect((await documentOf(page)).levels[0]!.name).toBe('复核楼层');
});

test('settings exposes one error alert and preserves the rejected draft', async ({ page }) => {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const intensity = page.getByLabel('环境强度', { exact: true });
  await intensity.fill('-1');
  await intensity.press('Enter');
  await expect(intensity).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert')).toHaveCount(1);
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(1);
  await expect(page.getByRole('alert')).toBeVisible();
});

test('snapshot failures release the file action lock for save and export', async ({ page }) => {
  const module = `/@fs/${resolve('packages/three-runtime/src/runtime.ts').replaceAll('\\', '/')}`;
  await page.evaluate(async (url) => {
    const { ThreeRuntime } = await import(url);
    ThreeRuntime.prototype.snapshot = () => {
      throw new Error('snapshot failure probe');
    };
  }, module);
  for (const label of ['保存', '导出 GLB']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByRole('button', { name: '关闭提示', exact: true }).click();
  }
});

test('a late image import preserves face edits made during resource decoding', async ({ page }) => {
  await page.getByRole('button', { name: '可编辑示例', exact: true }).click();
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();
  await page.evaluate(() => {
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let release = () => {};
    const gate = { pending: false, release: () => release() };
    Object.assign(window, { __imageImportGate: gate });
    Object.defineProperty(crypto.subtle, 'digest', {
      value: async (...args: Parameters<SubtleCrypto['digest']>) => {
        gate.pending = true;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return digest(...args);
      },
    });
  });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '导入 PNG／JPEG', exact: true }).click();
  await (await chooser).setFiles(resolve('apps/desktop/src/assets/brick.png'));
  await page.waitForFunction(
    () =>
      (window as unknown as { __imageImportGate: { pending: boolean } }).__imageImportGate.pending,
  );
  const width = page.getByLabel('平铺实际宽度（m）', { exact: true });
  await width.fill('1.23456789');
  await width.press('Enter');
  await page.evaluate(() =>
    (window as unknown as { __imageImportGate: { release(): void } }).__imageImportGate.release(),
  );
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
  const wall = (await documentOf(page)).walls[0]!;
  expect(wall.materials.A.tileWidth).toBe(1.23456789);
  expect(wall.materials.A.resourceId).toMatch(/^image_/);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('an untouched focused angle field cannot overwrite a completed door animation', async ({
  page,
}) => {
  await page.getByRole('button', { name: '可编辑示例', exact: true }).click();
  await page.getByRole('button', { name: '门 6', exact: true }).click();
  const duration = page.getByLabel('动画单程时长（s）', { exact: true });
  await duration.fill('0.5');
  await duration.press('Enter');
  await page.getByRole('button', { name: '打开门', exact: true }).click();
  const angle = page.getByLabel('当前角度（°）', { exact: true });
  await angle.focus();
  await expect
    .poll(async () => (await documentOf(page)).openings.find((item) => item.kind === 'door')!.angle)
    .toBe(90);
  const completed = await documentOf(page);
  await angle.press('Tab');
  expect(await documentOf(page)).toEqual(completed);
  await expect(angle).toHaveValue('90');
});
