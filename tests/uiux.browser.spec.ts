import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateBytes } from 'gltf-validator';
import type { EditorSession, ProjectDocument } from '@building/editor-core';
import type { ThreeRuntime } from '@building/three-runtime';
import { choose } from './browser-controls';

test.use({ viewport: { width: 1600, height: 900 } });

type Probe = {
  __editor: {
    document(): ProjectDocument;
    session(): EditorSession;
    history(): { undoCount: number; redoCount: number };
    diagnostics(): ReturnType<ThreeRuntime['diagnostics']>;
    project(point: { x: number; y: number; z: number }): { x: number; y: number };
  };
};
const root = resolve(process.env.BUILDING_UIUX_EVIDENCE_ROOT ?? '.test-artifacts/uiux');
const failures = new WeakMap<Page, string[]>();
const documentOf = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__editor.document());
const historyOf = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__editor.history());
const diagnostic = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__editor.diagnostics());
const project = (page: Page, x: number, z: number, y = 0) =>
  page.evaluate((point) => (window as unknown as Probe).__editor.project(point), { x, y, z });

async function clickWorld(page: Page, x: number, z: number, y = 0) {
  const point = await project(page, x, z, y);
  await page.mouse.click(point.x, point.y);
}
async function moveWorld(page: Page, x: number, z: number, y = 0) {
  const point = await project(page, x, z, y);
  await page.mouse.move(point.x, point.y);
  return point;
}
async function numeric(page: Page, label: string, value: string) {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(value);
  await input.press('Enter');
}
async function idle(page: Page) {
  await page.waitForFunction(
    () => !(window as unknown as Probe).__editor.diagnostics().pendingFrame,
  );
}
async function evidence(page: Page, name: string, details: unknown, testInfo: TestInfo) {
  await idle(page);
  await mkdir(root, { recursive: true });
  const path = resolve(root, `${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
  const json = JSON.stringify(
    {
      scope: 'Current-source browser mouse and keyboard UI; no Tauri or macOS acceptance.',
      launchOptions: testInfo.project.use.launchOptions,
      capturedAt: new Date().toISOString(),
      viewport: page.viewportSize(),
      theme: await page.locator('html').getAttribute('data-theme'),
      rendererId: (await diagnostic(page)).rendererId,
      details,
      browserErrors: failures.get(page),
    },
    null,
    2,
  );
  await writeFile(resolve(root, `${name}.json`), `${json}\n`);
}
async function canvasOutline(page: Page, selector = '.viewport canvas') {
  return page.locator(selector).evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      focused: element === document.activeElement,
      origin: (element as HTMLElement).dataset.focusOrigin,
      outlineWidth: style.outlineWidth,
      outlineStyle: style.outlineStyle,
      outlineColor: style.outlineColor,
    };
  });
}
async function assertPointerFocus(page: Page) {
  await expect(page.locator('.viewport canvas')).toBeFocused();
  expect((await canvasOutline(page)).outlineStyle).toBe('none');
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  failures.set(page, errors);
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
  await page.waitForFunction(() => !!(window as unknown as Probe).__editor);
  await expect(page.locator('.viewport canvas')).toHaveCount(1);
});
test.afterEach(async ({ page }) => {
  expect(failures.get(page)).toEqual([]);
});

test('property Enter then pointer drawing has no ring; Tab and in-Canvas keys retain keyboard focus', async ({
  page,
}, testInfo) => {
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await clickWorld(page, -3, -2);
  await clickWorld(page, 3, -2);
  await page.keyboard.press('Escape');
  await page.getByRole('radio', { name: '选择', exact: true }).click();
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();
  await numeric(page, '高度（m）', '3');
  await clickWorld(page, -4, 3);
  await assertPointerFocus(page);
  const pointer = await canvasOutline(page);
  await evidence(page, 'after-focus-pointer-1600', { pointer }, testInfo);
  await page.keyboard.press('Tab');
  await expect(page.locator('.viewport canvas')).not.toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.viewport canvas')).toBeFocused();
  expect(await canvasOutline(page)).toMatchObject({ outlineWidth: '2px', outlineStyle: 'solid' });
  await evidence(
    page,
    'after-focus-keyboard-1600',
    { keyboard: await canvasOutline(page) },
    testInfo,
  );
  await clickWorld(page, -4, 3);
  await assertPointerFocus(page);
  await page.keyboard.press('ArrowRight');
  expect(await canvasOutline(page)).toMatchObject({ outlineWidth: '2px', outlineStyle: 'solid' });
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await clickWorld(page, -3, 1);
  await moveWorld(page, 0, 1);
  await assertPointerFocus(page);
  await page.keyboard.press('Escape');
  expect((await documentOf(page)).walls).toHaveLength(1);
});

for (const language of ['zh-CN', 'en'] as const) {
  for (const theme of ['dark', 'light'] as const) {
    test(`Escape preserves viewport focus origin and cancels drafts ${language}/${theme}`, async ({
      page,
    }, testInfo) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const english = language === 'en';
      if (english) {
        await choose(page, '语言', 'English');
      }
      await choose(page, english ? 'Appearance' : '外观', theme === 'dark' ? 'Dark' : 'Light');
      const before = await documentOf(page);
      const history = await historyOf(page);
      for (const width of [1600, 900]) {
        await page.setViewportSize({ width, height: width === 900 ? 600 : 900 });
        for (const mode of ['3d', 'plan'] as const) {
          await page
            .getByRole('radio', {
              name:
                mode === '3d'
                  ? english
                    ? '3D scene'
                    : '3D 场景'
                  : english
                    ? '2D plan'
                    : '2D 平面',
              exact: true,
            })
            .click();
          await expect(page.locator('.viewport-stage')).toHaveAttribute('data-phase', 'idle');
          const selector = mode === '3d' ? '.viewport canvas' : 'svg.plan-canvas';
          const surface = page.locator(selector);
          const wall = page.getByRole('radio', { name: english ? 'Wall' : '墙体', exact: true });
          await wall.click();
          const bounds = (await surface.boundingBox())!;
          await page.mouse.click(bounds.x + bounds.width * 0.4, bounds.y + bounds.height * 0.55);
          await page.mouse.move(bounds.x + bounds.width * 0.65, bounds.y + bounds.height * 0.55);
          if (mode === 'plan') {
            await expect(page.locator('.plan-draft')).toHaveCount(1);
          } else {
            expect((await diagnostic(page)).preview.state.kind).toBe('preview');
          }
          await expect(surface).toBeFocused();
          await page.keyboard.press('Escape');
          const afterEscape = await canvasOutline(page, selector);
          await evidence(
            page,
            `escape-pointer-${language}-${theme}-${mode}-${width}`,
            afterEscape,
            testInfo,
          );
          expect(afterEscape).toMatchObject({ focused: true, outlineStyle: 'none' });
          expect(await documentOf(page)).toEqual(before);
          expect(await historyOf(page)).toEqual(history);
          if (mode === 'plan') {
            await expect(page.locator('.plan-draft')).toHaveCount(0);
          } else {
            expect((await diagnostic(page)).preview.state.kind).toBe('idle');
          }
          await page.keyboard.press('Tab');
          await expect(surface).not.toBeFocused();
          await page.keyboard.press('Shift+Tab');
          await expect(surface).toBeFocused();
          await page.keyboard.press('Escape');
          const keyboard = await canvasOutline(page, selector);
          expect(keyboard).toMatchObject({
            focused: true,
            outlineWidth: '2px',
            outlineStyle: 'solid',
          });
          await evidence(
            page,
            `escape-keyboard-${language}-${theme}-${mode}-${width}`,
            keyboard,
            testInfo,
          );
          await wall.click();
          await wall.press('Escape');
          await expect(wall).toBeFocused();
          await expect(surface).not.toBeFocused();
          const input = page.getByLabel(english ? 'Name' : '名称', { exact: true });
          await input.click();
          await input.press('Escape');
          await expect(input).toBeFocused();
          await expect(surface).not.toBeFocused();
          expect(await documentOf(page)).toEqual(before);
          expect(await historyOf(page)).toEqual(history);
        }
      }
    });
  }
}

test('drawing stage, one local dimension readout, snap feedback, camera pause, continuous commit and Esc stay consistent', async ({
  page,
}, testInfo) => {
  await page.getByRole('button', { name: '俯视', exact: true }).click();
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await clickWorld(page, -2, -1);
  const before = await documentOf(page);
  const beforeHistory = await historyOf(page);
  await moveWorld(page, 2, -1);
  await expect(page.locator('.status-bar')).toContainText('点击终点。Esc 取消当前草稿。');
  await expect(page.getByTestId('snap-feedback')).toBeVisible();
  await expect(page.getByTestId('snap-coordinate')).toHaveCount(1);
  await expect(page.getByTestId('snap-coordinate')).toContainText('4.00 m');
  await expect(page.locator('.viewport-empty')).toBeHidden();
  await expect(page.locator('.status-bar')).not.toContainText('长度：');
  expect(await documentOf(page)).toEqual(before);
  expect(await historyOf(page)).toEqual(beforeHistory);
  await evidence(
    page,
    'after-wall-drawing-1600',
    {
      stage: await page.locator('.status-bar').innerText(),
      readout: await page.getByTestId('snap-coordinate').innerText(),
    },
    testInfo,
  );
  const pointer = await project(page, 2, -1);
  await page.mouse.move(pointer.x, pointer.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(pointer.x + 16, pointer.y + 10, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  expect(await documentOf(page)).toEqual(before);
  await clickWorld(page, 2, -1);
  await expect(page.locator('.status-bar')).toContainText('点击下一段终点继续绘墙');
  expect((await documentOf(page)).walls).toHaveLength(1);
  await moveWorld(page, 2, 1);
  await expect(page.locator('.status-bar')).toContainText('点击下一段终点继续绘墙');
  await clickWorld(page, 2, 1);
  expect((await documentOf(page)).walls).toHaveLength(2);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('snap-coordinate')).toBeHidden();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await documentOf(page)).walls).toHaveLength(1);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  expect((await documentOf(page)).walls).toHaveLength(2);
  await page.getByRole('radio', { name: '楼板', exact: true }).click();
  await clickWorld(page, -1, 2);
  await moveWorld(page, 1, 3);
  await expect(page.locator('.status-bar')).toContainText('点击对角点完成楼板');
  await expect(page.getByTestId('snap-coordinate')).toContainText('2.00 × 1.00 m');
  const draft = await documentOf(page);
  await page.keyboard.press('Escape');
  expect(await documentOf(page)).toEqual(draft);
  await expect(page.getByTestId('snap-coordinate')).toBeHidden();
});

test('real wall, slab, door/window, property, material, drag history, readonly, levels and saved GLB roundtrip', async ({
  page,
}, testInfo) => {
  test.setTimeout(150000);
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await clickWorld(page, -3, -2);
  await clickWorld(page, 3, -2);
  await page.keyboard.press('Escape');
  for (const [tool, x] of [
    ['门', -1.9],
    ['窗', 1.4],
  ] as const) {
    await page.getByRole('radio', { name: tool, exact: true }).click();
    await clickWorld(page, x, -1.9, 1.2);
  }
  await expect.poll(async () => (await documentOf(page)).openings.length).toBe(2);
  await page.getByRole('radio', { name: '选择', exact: true }).click();
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();
  await numeric(page, '高度（m）', '3');
  const beforeReadonly = await documentOf(page),
    readonlyHistory = await historyOf(page);
  await page.getByRole('checkbox', { name: '整栋预览（只读）', exact: true }).check();
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '重做', exact: true })).toBeDisabled();
  const camera = await project(page, 0, 2);
  await page.mouse.click(camera.x, camera.y);
  for (const keys of ['Control+z', 'Control+y', 'Control+Shift+z']) {
    await page.keyboard.press(keys);
    expect(await documentOf(page)).toEqual(beforeReadonly);
    expect(await historyOf(page)).toEqual(readonlyHistory);
  }
  await evidence(
    page,
    'after-readonly-history-1600',
    { history: readonlyHistory, revision: beforeReadonly.revision },
    testInfo,
  );
  await page.getByRole('checkbox', { name: '整栋预览（只读）', exact: true }).uncheck();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await documentOf(page)).walls[0]!.height).toBe(2.8);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  expect((await documentOf(page)).walls[0]!.height).toBe(3);
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();
  await choose(page, '表面', 'B 面');
  await choose(page, '图片', '墙面');
  expect((await documentOf(page)).walls[0]!.materials.B.resourceId).toBe('builtin_plaster');
  await page.getByRole('button', { name: '门 2', exact: true }).click();
  await numeric(page, '洞口距墙参考端（m）', '0.7');
  const old = await documentOf(page),
    oldHistory = await historyOf(page);
  const door = old.openings.find((opening) => opening.kind === 'door')!;
  const point = await project(page, -3 + door.offset + door.width / 2, -1.9, 1);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 18, point.y, { steps: 8 });
  expect(await documentOf(page)).toEqual(old);
  expect(await historyOf(page)).toEqual(oldHistory);
  await assertPointerFocus(page);
  await page.mouse.up();
  expect((await historyOf(page)).undoCount).toBe(oldHistory.undoCount + 1);
  expect(
    (await documentOf(page)).openings.find((opening) => opening.id === door.id)!.offset,
  ).not.toBe(door.offset);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await documentOf(page)).openings.find((opening) => opening.id === door.id)!.offset).toBe(
    door.offset,
  );
  await page.getByRole('button', { name: '俯视', exact: true }).click();
  await page.getByRole('radio', { name: '楼板', exact: true }).click();
  await clickWorld(page, -3, -1.7);
  await clickWorld(page, 3, 2);
  await page.keyboard.press('Escape');
  expect((await documentOf(page)).slabs).toHaveLength(1);
  await page.getByRole('button', { name: '新增楼层', exact: true }).click();
  expect((await documentOf(page)).levels).toHaveLength(2);
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await clickWorld(page, -2, 0, 3);
  await clickWorld(page, 2, 0, 3);
  await page.keyboard.press('Escape');
  const levels = await documentOf(page);
  expect(levels.walls).toHaveLength(2);
  expect(levels.walls[1]!.levelId).toBe(levels.levels[1]!.id);
  await page.locator('.floor-list button').first().click();
  expect(
    await page.evaluate(() => (window as unknown as Probe).__editor.session().currentLevelId),
  ).toBe(levels.levels[0]!.id);
  const savedWait = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await mkdir(root, { recursive: true });
  const savedPath = resolve(root, 'actual-core-flow.building');
  await (await savedWait).saveAs(savedPath);
  await expect(page.getByTestId('dirty-state')).toHaveText('已保存');
  const saved = await documentOf(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await (await chooser).setFiles(savedPath);
  await expect(page.locator('.status-bar')).toContainText('工程已打开');
  expect(await documentOf(page)).toEqual(saved);
  const exportWait = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 GLB', exact: true }).click();
  const exportPath = resolve(root, 'actual-core-flow.glb');
  await (await exportWait).saveAs(exportPath);
  const bytes = await readFile(exportPath);
  const report = await validateBytes(bytes, { uri: 'actual-core-flow.glb' });
  expect(report.issues.numErrors).toBe(0);
  expect(report.issues.numWarnings).toBe(0);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  expect(json.animations).toHaveLength(2);
  expect(
    json.nodes.some((node: { name?: string }) => /Grid|preview|snap-target/i.test(node.name ?? '')),
  ).toBe(false);
  expect(await documentOf(page)).toEqual(saved);
  await evidence(
    page,
    'after-core-flow-1600',
    {
      savedPath,
      exportPath,
      validator: report.issues,
      counts: {
        walls: saved.walls.length,
        slabs: saved.slabs.length,
        openings: saved.openings.length,
        levels: saved.levels.length,
      },
      oneDragHistoryItem: true,
      readonlyHistoryUnchanged: true,
    },
    testInfo,
  );
});

test('invalid dimensions and rejected wall endpoint recover without a stale alert, lost draft or extra history', async ({
  page,
}, testInfo) => {
  await page.getByRole('button', { name: '俯视', exact: true }).click();
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await clickWorld(page, -2, -1);
  await clickWorld(page, 2, -1);
  await page.keyboard.press('Escape');
  await page.getByRole('radio', { name: '选择', exact: true }).click();
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();
  const original = await documentOf(page),
    originalHistory = await historyOf(page);
  await numeric(page, '高度（m）', '0');
  await expect(page.getByRole('alert')).toHaveCount(1);
  expect(await documentOf(page)).toEqual(original);
  expect(await historyOf(page)).toEqual(originalHistory);
  await numeric(page, '高度（m）', '2.9');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect((await documentOf(page)).walls[0]!.height).toBe(2.9);
  expect((await historyOf(page)).undoCount).toBe(originalHistory.undoCount + 1);
  await evidence(
    page,
    'after-error-correction-1600',
    { invalidDidNotCommit: true, successClearedPreviousError: true, successfulCorrections: 1 },
    testInfo,
  );
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await clickWorld(page, -3, -1);
  const draftDocument = await documentOf(page),
    draftHistory = await historyOf(page);
  await clickWorld(page, 1, -1);
  await expect(page.getByRole('alert')).toHaveCount(1);
  await expect(page.getByRole('alert')).toContainText('墙段重叠');
  expect(await documentOf(page)).toEqual(draftDocument);
  expect(await historyOf(page)).toEqual(draftHistory);
  await page.getByRole('button', { name: '关闭提示', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.status-bar')).toContainText('点击终点。Esc 取消当前草稿。');
  expect((await diagnostic(page)).preview.state.kind).toBe('preview');
  await evidence(
    page,
    'after-draft-error-dismiss-1600',
    { draftHistory, stage: await page.locator('.status-bar').innerText() },
    testInfo,
  );
  await clickWorld(page, -3, 1);
  expect((await documentOf(page)).walls).toHaveLength(2);
  expect((await historyOf(page)).undoCount).toBe(draftHistory.undoCount + 1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

for (const language of ['zh-CN', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`compact and default editing/dialog layouts ${language}/${theme}`, async ({
      page,
    }, testInfo) => {
      const english = language === 'en';
      await page.getByRole('button', { name: '庭院样板', exact: true }).click();
      await page.getByRole('button', { name: '墙体 1', exact: true }).click();
      if (english) {
        await choose(page, '语言', 'English');
      }
      await choose(
        page,
        english ? 'Appearance' : '外观',
        theme === 'dark' ? (english ? 'Dark' : '暗色') : english ? 'Light' : '亮色',
      );
      const baseline = await documentOf(page),
        rendererId = (await diagnostic(page)).rendererId;
      for (const [width, height] of [
        [1600, 900],
        [900, 600],
      ]) {
        await page.setViewportSize({ width: width!, height: height! });
        const layout = await page.evaluate(() => {
          const boxes = [
            '.tools-bar',
            '.viewport-toolbar',
            '.viewport canvas',
            '.inspector',
            '.status-bar',
          ].map((selector) => {
            const element = document.querySelector(selector)!;
            const box = element.getBoundingClientRect();
            return {
              selector,
              x: box.x,
              y: box.y,
              right: box.right,
              bottom: box.bottom,
              width: box.width,
              height: box.height,
            };
          });
          return { overflow: document.documentElement.scrollWidth > innerWidth, boxes };
        });
        expect(layout.overflow).toBe(false);
        for (const box of layout.boxes) {
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.right).toBeLessThanOrEqual(width!);
          expect(box.bottom).toBeLessThanOrEqual(height!);
          expect(box.height).toBeGreaterThan(20);
        }
        const canvas = layout.boxes.find((box) => box.selector === '.viewport canvas')!;
        const inspector = layout.boxes.find((box) => box.selector === '.inspector')!;
        const status = layout.boxes.find((box) => box.selector === '.status-bar')!;
        expect(canvas.right).toBeLessThanOrEqual(inspector.x + 1);
        expect(canvas.bottom).toBeLessThanOrEqual(status.y + 1);
        await evidence(page, `after-layout-${language}-${theme}-${width}`, layout, testInfo);
        const render = page.getByRole('button', {
          name: english ? 'Real-time rendering' : '实时渲染',
          exact: true,
        });
        await render.click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toContainText(english ? 'Start path tracing' : '开始光追');
        await expect(
          dialog.getByRole('combobox', {
            name: english ? 'Target samples' : '目标采样数',
            exact: true,
          }),
        ).toBeVisible();
        await evidence(
          page,
          `after-render-dialog-${language}-${theme}-${width}`,
          { documentUnchanged: true },
          testInfo,
        );
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(render).toBeFocused();
        const settings = page.getByRole('button', {
          name: english ? 'Settings' : '设置',
          exact: true,
        });
        await settings.click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await expect(
          page.getByRole('dialog').getByRole('combobox', {
            name: english ? 'Target samples' : '目标采样数',
            exact: true,
          }),
        ).toHaveCount(0);
        await page
          .getByRole('dialog')
          .getByRole('button', { name: english ? 'Close' : '关闭', exact: true })
          .click();
        await expect(settings).toBeFocused();
        expect(await documentOf(page)).toEqual(baseline);
        expect((await diagnostic(page)).rendererId).toBe(rendererId);
      }
    });
  }
}
