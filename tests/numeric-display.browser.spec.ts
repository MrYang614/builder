import { expect, test, type Page } from '@playwright/test';
import type { ProjectDocument } from '@building/editor-core';

type Probe = {
  __editor: {
    document(): ProjectDocument;
    history(): { undoCount: number; redoCount: number };
    project(point: { x: number; y: number; z: number }): { x: number; y: number };
  };
};
const snapshot = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__editor.document());
const history = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__editor.history());

async function clickWorld(page: Page, x: number, z: number) {
  const point = await page.evaluate(
    (point) => (window as unknown as Probe).__editor.project(point),
    { x, y: 0, z },
  );
  await page.mouse.click(point.x, point.y);
}

test('grid dimensions read clearly without changing exact values, drafts or history', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Probe).__editor);
  await page.getByRole('button', { name: '俯视', exact: true }).click();
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await clickWorld(page, -4.1, -2);
  await clickWorld(page, 3.7, -2);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();

  const length = page.getByLabel('轴线长度（m）', { exact: true });
  const startX = page.getByLabel('起点 X（m）', { exact: true });
  const before = await snapshot(page);
  const beforeHistory = await history(page);
  expect(before.walls).toHaveLength(1);
  expect(before.walls[0]!.start.x).toBe(-4.1000000000000005);
  expect(before.walls[0]!.end.x - before.walls[0]!.start.x).toBe(7.800000000000001);
  await expect(length).toHaveValue('7.8');
  await expect(startX).toHaveValue('-4.1');
  await length.focus();
  await length.press('Enter');
  await length.press('Tab');
  await startX.focus();
  await startX.press('Tab');
  expect(await snapshot(page)).toEqual(before);
  expect(await history(page)).toEqual(beforeHistory);

  await startX.fill('-5.123456789123456');
  await startX.press('Escape');
  await expect(startX).toHaveValue('-4.1');
  await startX.press('Tab');
  expect(await snapshot(page)).toEqual(before);
  expect(await history(page)).toEqual(beforeHistory);

  await length.fill('-1');
  await length.press('Enter');
  await expect(length).toHaveValue('-1');
  await expect(length).toHaveAttribute('aria-invalid', 'true');
  expect(await snapshot(page)).toEqual(before);
  expect(await history(page)).toEqual(beforeHistory);
  await length.press('Escape');
  await expect(length).toHaveValue('7.8');
  await expect(length).toHaveAttribute('aria-invalid', 'false');
  await page.getByRole('button', { name: '关闭提示', exact: true }).click();

  await startX.fill('-4.123456789123456');
  await startX.press('Enter');
  expect((await snapshot(page)).walls[0]!.start.x).toBe(-4.123456789123456);
  expect((await history(page)).undoCount).toBe(beforeHistory.undoCount + 1);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await snapshot(page)).walls).toEqual(before.walls);
  await expect(startX).toHaveValue('-4.1');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  expect((await snapshot(page)).walls[0]!.start.x).toBe(-4.123456789123456);
  await expect(startX).toHaveValue('-4.12345678912346');
  expect(errors).toEqual([]);
});
