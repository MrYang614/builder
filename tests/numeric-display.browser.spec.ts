import { expect, test, type Page } from '@playwright/test';
import type { ProjectDocument } from '@building/editor-core';
import { choose } from './browser-controls';

type Probe = {
  __editor: {
    document(): ProjectDocument;
    history(): { undoCount: number; redoCount: number };
    project(point: { x: number; y: number; z: number }): { x: number; y: number };
    diagnostics(): { rendererId: unknown };
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
  await expect(startX).toHaveValue('-4.12');
  await startX.press('Enter');
  expect((await snapshot(page)).walls[0]!.start.x).toBe(-4.12);
  expect((await history(page)).undoCount).toBe(beforeHistory.undoCount + 1);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await snapshot(page)).walls).toEqual(before.walls);
  await expect(startX).toHaveValue('-4.1');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  expect((await snapshot(page)).walls[0]!.start.x).toBe(-4.12);
  await expect(startX).toHaveValue('-4.12');
  expect(errors).toEqual([]);
});

for (const language of ['zh-CN', 'en'] as const) {
  for (const theme of ['dark', 'light'] as const) {
    test(`point coordinates and focused inputs use two decimals in ${language}/${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: 1600, height: 900 });
      await page.goto('/');
      await page.waitForFunction(() => !!(window as unknown as Probe).__editor);
      if (language === 'en') {
        await choose(page, '语言', 'English');
      }
      const text =
        language === 'en'
          ? {
              appearance: 'Appearance',
              top: 'Top view',
              wall: 'Wall',
              select: 'Select',
              snap: 'Snap',
              object: 'Wall 1',
              z: 'Start Z (m)',
            }
          : {
              appearance: '外观',
              top: '俯视',
              wall: '墙体',
              select: '选择',
              snap: '吸附',
              object: '墙体 1',
              z: '起点 Z（m）',
            };
      await choose(page, text.appearance, theme === 'dark' ? 'Dark' : 'Light');
      await page.getByRole('button', { name: text.top, exact: true }).click();
      await page.getByRole('radio', { name: text.wall, exact: true }).click();
      await page.getByRole('button', { name: text.snap, exact: true }).click();
      await clickWorld(page, -1.123456789, -1.234567891);
      await clickWorld(page, 2.345678912, -1.234567891);
      await page.keyboard.press('Escape');
      const before = await snapshot(page);
      const beforeHistory = await history(page);
      expect(before.walls).toHaveLength(1);
      const wall = before.walls[0]!;
      expect(wall.start.z).not.toBe(Number(wall.start.z.toFixed(2)));
      const renderer = await page.evaluate(
        () => (window as unknown as Probe).__editor.diagnostics().rendererId,
      );
      const canvas = await page.locator('.viewport canvas').elementHandle();
      const format = new Intl.NumberFormat('en-US', {
        useGrouping: false,
        maximumFractionDigits: 2,
      });
      for (const width of [1600, 900]) {
        await page.setViewportSize({ width, height: width === 900 ? 600 : 900 });
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
        await page.getByRole('radio', { name: text.wall, exact: true }).click();
        await clickWorld(page, -0.375123, 1.234567);
        const end = await page.evaluate(() =>
          (window as unknown as Probe).__editor.project({ x: 1.754321, y: 0, z: 1.234567 }),
        );
        await page.mouse.move(end.x, end.y);
        const readout = page.getByTestId('snap-coordinate');
        await expect(readout).toBeVisible();
        await expect(readout).toContainText(/X -?\d+\.\d{2} · Z -?\d+\.\d{2} m$/);
        expect(await snapshot(page)).toEqual(before);
        expect(await history(page)).toEqual(beforeHistory);
        await page.screenshot({
          path: testInfo.outputPath(`point-${language}-${theme}-${width}.png`),
        });
        await page.keyboard.press('Escape');
        await page.getByRole('radio', { name: text.select, exact: true }).click();
        await page.getByRole('button', { name: text.object, exact: true }).click();
        const position = page.getByLabel(text.z, { exact: true });
        await expect(position).toHaveValue(format.format(wall.start.z));
        await position.focus();
        await expect(position).toBeFocused();
        await position.press('Enter');
        await position.press('Tab');
        await expect(position).toHaveValue(format.format(wall.start.z));
        const inputs = await page
          .locator('[data-slot="input-number"] input')
          .evaluateAll((elements) =>
            elements.map((element) => (element as HTMLInputElement).value),
          );
        expect(inputs.every((value) => /^-?\d+(?:\.\d{1,2})?$/.test(value))).toBe(true);
        const layout = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
          canvas: document.querySelector('.viewport canvas')!.getBoundingClientRect().width,
        }));
        expect(layout.width).toBe(width);
        expect(layout.height).toBe(width === 900 ? 600 : 900);
        expect(layout.canvas).toBeGreaterThanOrEqual(300);
        expect(await snapshot(page)).toEqual(before);
        expect(await history(page)).toEqual(beforeHistory);
        expect(
          await page.evaluate(() => (window as unknown as Probe).__editor.diagnostics().rendererId),
        ).toBe(renderer);
        expect(
          await canvas!.evaluate(
            (element) => element === document.querySelector('.viewport canvas'),
          ),
        ).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`inputs-${language}-${theme}-${width}.png`),
        });
      }
    });
  }
}
