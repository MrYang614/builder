import { test, expect, type Page } from '@playwright/test';
import type { ProjectDocument } from '@building/editor-core';
type Probe = {
  __editor: { document: () => ProjectDocument; history: () => { undoCount: number } };
};
const documentSnapshot = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__editor.document());
async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByRole('button', { name: '庭院样板', exact: true }).click();
});

test('connected matching face material batch and user designated nonintegral closure seam', async ({
  page,
}) => {
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();
  await choose(page, '表面', 'A 面');
  const before = await documentSnapshot(page);
  await page.getByRole('checkbox', { name: '应用到连接的匹配表面', exact: true }).check();
  const input = page.getByLabel('平铺实际宽度（m）', { exact: true });
  await input.fill('0.65');
  await input.press('Enter');
  const after = await documentSnapshot(page);
  const currentLevel = before.levels[0]!.id;
  for (const wall of after.walls) {
    expect(wall.materials.A.tileWidth).toBe(wall.levelId === currentLevel ? 0.65 : 0.5);
    expect(wall.materials.B).toEqual(before.walls.find((w) => w.id === wall.id)!.materials.B);
  }
  await expect(page.getByRole('status')).toContainText('4');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await documentSnapshot(page)).walls).toEqual(before.walls);
  await page.getByRole('button', { name: '将此表面起点设为闭环收口', exact: true }).click();
  const first = await documentSnapshot(page);
  expect(first.continuity).toHaveLength(1);
  expect(first.continuity[0]!.members).toHaveLength(4);
  await page.getByRole('button', { name: '墙体 3', exact: true }).click();
  await choose(page, '表面', 'A 面');
  await page.getByRole('button', { name: '将此表面起点设为闭环收口', exact: true }).click();
  const moved = await documentSnapshot(page);
  expect(moved.continuity).toHaveLength(1);
  expect(moved.continuity[0]!.id).toBe(first.continuity[0]!.id);
  expect(moved.continuity[0]!.seam?.wallId).toBe(moved.walls[2]!.id);
  expect(moved.walls.map((w) => w.materials)).toEqual(first.walls.map((w) => w.materials));
  await expect(page.getByTestId('texture-route')).toContainText('A');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await documentSnapshot(page)).continuity).toEqual(first.continuity);
});

test('deletion explains exact contents, cancels safely and restores an entire floor', async ({
  page,
}) => {
  const original = await documentSnapshot(page);
  await page.getByRole('button', { name: '删除楼层', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('4 段墙');
  await expect(dialog).toContainText('1 块楼板');
  await expect(dialog).toContainText('2 个门窗');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  expect(await documentSnapshot(page)).toEqual(original);
  await page.getByRole('button', { name: '删除楼层', exact: true }).click();
  await dialog.getByRole('button', { name: '删除', exact: true }).click();
  expect((await documentSnapshot(page)).levels).toHaveLength(1);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  const restored = await documentSnapshot(page);
  expect(restored.levels).toEqual(original.levels);
  expect(restored.walls).toEqual(original.walls);
  expect(restored.slabs).toEqual(original.slabs);
  expect(restored.openings).toEqual(original.openings);
  await page
    .locator('.floor-list')
    .getByRole('button', { name: new RegExp('^' + original.levels[0]!.name) })
    .click();
  await expect(page.getByRole('button', { name: '门 6', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await expect(dialog).toContainText('1 段墙');
  await expect(dialog).toContainText('1 个门窗');
  await dialog.getByRole('button', { name: '删除', exact: true }).click();
  expect((await documentSnapshot(page)).openings).toHaveLength(3);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await documentSnapshot(page)).openings).toEqual(original.openings);
});
