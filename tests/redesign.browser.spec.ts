import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { EditorSession, ProjectDocument } from '@building/editor-core';
import type { ThreeRuntime } from '@building/three-runtime';
import { choose } from './browser-controls';

type Probe = {
  __editor: {
    document(): ProjectDocument;
    session(): EditorSession;
    history(): { undoCount: number; redoCount: number };
    diagnostics(): ReturnType<ThreeRuntime['diagnostics']>;
  };
};
test.use({ viewport: { width: 1600, height: 900 } });
const root = resolve('.test-artifacts/ui-layout/screenshots');
const failures = new WeakMap<Page, string[]>();
const documentOf = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__editor.document());
const historyOf = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__editor.history());
const diagnostic = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__editor.diagnostics());
const labels = {
  'zh-CN': {
    scene: '场景',
    properties: '属性',
    resizeScene: '调整场景宽度',
    resizeProperties: '调整属性宽度',
    example: '庭院样板',
    wall: '墙体 1',
    height: '高度（m）',
    undo: '撤销',
    redo: '重做',
    settings: '设置',
    close: '关闭',
  },
  en: {
    scene: 'Scene',
    properties: 'Properties',
    resizeScene: 'Resize scene',
    resizeProperties: 'Resize properties',
    example: 'Courtyard starter',
    wall: 'Wall 1',
    height: 'Height (m)',
    undo: 'Undo',
    redo: 'Redo',
    settings: 'Settings',
    close: 'Close',
  },
} as const;

async function idle(page: Page) {
  await page.waitForFunction(() => {
    const state = (window as unknown as Probe).__editor.diagnostics();
    return !state.pendingFrame && !state.render.switching && !state.render.environmentLoading;
  });
}

/** Captures actual browser output and records the scope without implying native acceptance. */
async function evidence(page: Page, name: string, details: unknown, testInfo: TestInfo) {
  await idle(page);
  await mkdir(root, { recursive: true });
  const path = resolve(root, `${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
  await writeFile(
    resolve(root, `${name}.json`),
    JSON.stringify(
      {
        scope:
          'Current-source Chromium browser; GPU launch arguments recorded below; no native Windows or macOS acceptance.',
        launchArgs: testInfo.project.use.launchOptions?.args ?? [],
        capturedAt: new Date().toISOString(),
        viewport: page.viewportSize(),
        theme: await page.locator('html').getAttribute('data-theme'),
        rendererId: (await diagnostic(page)).rendererId,
        browserErrors: failures.get(page),
        details,
      },
      null,
      2,
    ) + '\n',
  );
}

async function panelValue(separator: Locator) {
  const value = Number(await separator.getAttribute('aria-valuenow'));
  expect(Number.isFinite(value)).toBe(true);
  expect(value).toBeGreaterThan(0);
  return value;
}

/** Uses actual captured pointer input to increase a sidebar while retaining the live viewport. */
async function enlargePanel(page: Page, separator: Locator, direction: number) {
  const before = await panelValue(separator);
  const box = await separator.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    throw new Error('Visible panel separator has no bounds');
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + direction * 40, box.y + box.height / 2, {
    steps: 6,
  });
  await page.mouse.up();
  await expect.poll(() => panelValue(separator)).toBeGreaterThan(before + 20);
}

async function assertLayout(page: Page) {
  // A viewport resize publishes ResizeObserver measurements before React commits panel limits.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await idle(page);
  const layout = await page.evaluate(() => {
    const selectors = [
      '.main-toolbar',
      '.viewport canvas',
      '[data-testid="scene-panel"]',
      '[data-testid="inspector-panel"]',
      '.status-bar',
    ];
    return {
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      boxes: selectors.map((selector) => {
        const element = document.querySelector(selector);
        if (!element) {
          throw new Error(`Missing workspace element: ${selector}`);
        }
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
      }),
    };
  });
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.height);
  for (const box of layout.boxes) {
    expect(box.x, box.selector).toBeGreaterThanOrEqual(0);
    expect(box.y, box.selector).toBeGreaterThanOrEqual(0);
    expect(box.right, box.selector).toBeLessThanOrEqual(layout.width + 1);
    expect(box.bottom, box.selector).toBeLessThanOrEqual(layout.height + 1);
    expect(box.width, box.selector).toBeGreaterThan(0);
    expect(box.height, box.selector).toBeGreaterThan(0);
  }
  const canvas = layout.boxes.find((box) => box.selector === '.viewport canvas')!;
  expect(canvas.width).toBeGreaterThan(260);
  expect(canvas.height).toBeGreaterThan(260);
  const scene = layout.boxes.find((box) => box.selector.includes('scene-panel'))!;
  const inspector = layout.boxes.find((box) => box.selector.includes('inspector-panel'))!;
  expect(scene.right).toBeLessThanOrEqual(canvas.x + 1);
  expect(canvas.right).toBeLessThanOrEqual(inspector.x + 1);
  return layout;
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
});

test.afterEach(async ({ page }) => {
  expect(failures.get(page)).toEqual([]);
});

test('fresh startup uses dark appearance and bundled Inter plus numeric JetBrains Mono fonts', async ({
  page,
}, testInfo) => {
  const fontRequests: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'font') {
      fontRequests.push(request.url());
    }
  });
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Probe).__editor);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: labels['zh-CN'].example, exact: true }).click();
  await page.getByRole('button', { name: labels['zh-CN'].wall, exact: true }).click();
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const text = document.querySelector('button')!;
    const numeric = document.querySelector('[data-slot="input-number"] input')!;
    return {
      loaded: Array.from(document.fonts)
        .filter((font) => font.status === 'loaded')
        .map((font) => font.family.replaceAll('"', '')),
      text: getComputedStyle(text).fontFamily,
      numeric: getComputedStyle(numeric).fontFamily,
      interAvailable: document.fonts.check('13px "Inter Variable"', 'Builder 123'),
      monoAvailable: document.fonts.check('13px "JetBrains Mono Variable"', '123.45 m'),
    };
  });
  expect(fonts.loaded).toContain('Inter Variable');
  expect(fonts.loaded).toContain('JetBrains Mono Variable');
  expect(fonts.text).toContain('Inter Variable');
  expect(fonts.numeric).toContain('JetBrains Mono Variable');
  expect(fonts.interAvailable).toBe(true);
  expect(fonts.monoAvailable).toBe(true);
  expect(fontRequests.length).toBeGreaterThan(0);
  const appOrigin = new URL(page.url()).origin;
  expect(fontRequests.every((url) => new URL(url).origin === appOrigin)).toBe(true);
  await evidence(page, 'startup-dark-bundled-fonts', { fonts, fontRequests }, testInfo);
});

for (const language of ['zh-CN', 'en'] as const) {
  for (const theme of ['dark', 'light'] as const) {
    test(`panels resize and collapse without replacing runtime; layouts ${language}/${theme}`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(120000);
      const text = labels[language];
      await page.goto('/');
      await page.waitForFunction(() => !!(window as unknown as Probe).__editor);
      await page.getByRole('button', { name: labels['zh-CN'].example, exact: true }).click();
      if (language === 'en') {
        await choose(page, '语言', 'English');
      }
      await choose(
        page,
        language === 'en' ? 'Appearance' : '外观',
        theme === 'dark' ? 'Dark' : 'Light',
      );
      await page.getByRole('button', { name: text.wall, exact: true }).click();
      await idle(page);
      const baselineDocument = await documentOf(page);
      const baselineHistory = await historyOf(page);
      const baselineDiagnostics = await diagnostic(page);
      const canvas = await page.locator('.viewport canvas').elementHandle();
      expect(canvas).not.toBeNull();
      const assertUnchanged = async () => {
        await idle(page);
        expect(await documentOf(page)).toEqual(baselineDocument);
        expect(await historyOf(page)).toEqual(baselineHistory);
        const state = await diagnostic(page);
        expect(state.rendererId).toBe(baselineDiagnostics.rendererId);
        expect(state.camera).toEqual(baselineDiagnostics.camera);
        expect(state.eventListeners).toBe(baselineDiagnostics.eventListeners);
        expect(
          await canvas!.evaluate(
            (element) => element === document.querySelector('.viewport canvas'),
          ),
        ).toBe(true);
        await expect(page.locator('.viewport canvas')).toHaveCount(1);
      };
      for (const [name, id] of [
        [text.scene, 'scene-panel'],
        [text.properties, 'inspector-panel'],
      ] as const) {
        const toggle = page.getByRole('button', { name, exact: true });
        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
        const widthBefore = (await page.locator('.viewport canvas').boundingBox())!.width;
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        await expect(page.getByTestId(id)).toBeHidden();
        await expect
          .poll(async () => (await page.locator('.viewport canvas').boundingBox())!.width)
          .toBeGreaterThan(widthBefore + 100);
        await assertUnchanged();
        await toggle.press('Enter');
        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByTestId(id)).toBeVisible();
        await assertUnchanged();
      }
      for (const [name, direction] of [
        [text.resizeScene, 1],
        [text.resizeProperties, -1],
      ] as const) {
        const separator = page.getByRole('separator', { name, exact: true });
        await expect(separator).toHaveAttribute('aria-orientation', 'vertical');
        await enlargePanel(page, separator, direction);
        const mouseValue = await panelValue(separator);
        await separator.focus();
        await expect(separator).toBeFocused();
        await separator.press(direction === 1 ? 'ArrowRight' : 'ArrowLeft');
        await expect.poll(() => panelValue(separator)).toBeGreaterThan(mouseValue);
        await separator.press(direction === 1 ? 'ArrowLeft' : 'ArrowRight');
        await expect.poll(() => panelValue(separator)).toBe(mouseValue);
        await assertUnchanged();
      }
      for (const [width, height] of [
        [900, 600],
        [1280, 900],
        [1600, 900],
      ]) {
        await page.setViewportSize({ width: width!, height: height! });
        const layout = await assertLayout(page);
        await assertUnchanged();
        await evidence(page, `workspace-${language}-${theme}-${width}`, layout, testInfo);
      }
      const settings = page.getByRole('button', { name: text.settings, exact: true });
      await settings.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await evidence(page, `settings-${language}-${theme}`, {}, testInfo);
      await page.getByRole('dialog').getByRole('button', { name: text.close, exact: true }).click();
      await expect(settings).toBeFocused();
      await assertUnchanged();
    });
  }
}

test('real courtyard selection, rejected numeric draft and one-command edit retain undo and redo', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Probe).__editor);
  await page.getByRole('button', { name: '庭院样板', exact: true }).click();
  const courtyard = await documentOf(page);
  expect(courtyard.levels).toHaveLength(2);
  expect(courtyard.walls).toHaveLength(8);
  expect(courtyard.slabs).toHaveLength(3);
  expect(courtyard.openings).toHaveLength(4);
  const before = await historyOf(page);
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();
  expect(
    await page.evaluate(() => (window as unknown as Probe).__editor.session().selectedId),
  ).toBe(courtyard.walls[0]!.id);
  expect(await historyOf(page)).toEqual(before);
  const height = page.getByLabel('高度（m）', { exact: true });
  await height.fill('0');
  await height.press('Enter');
  await expect(height).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert')).toHaveCount(1);
  expect(await documentOf(page)).toEqual(courtyard);
  expect(await historyOf(page)).toEqual(before);
  const changedHeight = 2.9;
  await height.fill(String(changedHeight));
  await height.press('Enter');
  await expect(height).toHaveAttribute('aria-invalid', 'false');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect((await documentOf(page)).walls[0]!.height).toBe(changedHeight);
  expect((await historyOf(page)).undoCount).toBe(before.undoCount + 1);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await documentOf(page)).walls).toEqual(courtyard.walls);
  await expect(height).toHaveValue(String(courtyard.walls[0]!.height));
  await page.getByRole('button', { name: '重做', exact: true }).click();
  expect((await documentOf(page)).walls[0]!.height).toBe(changedHeight);
  await expect(height).toHaveValue(String(changedHeight));
  await evidence(page, 'courtyard-property-history', { before, changedHeight }, testInfo);
});

test('empty workspace, file menu keyboard, tooltips, render configuration and errors in both themes', async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  for (const theme of ['dark', 'light'] as const) {
    await page.goto('/');
    await page.waitForFunction(() => !!(window as unknown as Probe).__editor);
    await choose(page, '外观', theme === 'dark' ? 'Dark' : 'Light');
    const initial = await documentOf(page);
    const history = await historyOf(page);
    const rendererId = (await diagnostic(page)).rendererId;
    expect(initial.walls).toHaveLength(0);
    await evidence(page, `empty-${theme}`, { history }, testInfo);

    const files = page.getByRole('button', { name: '工程操作', exact: true });
    await files.click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: '新建', exact: true }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: '打开', exact: true })).toBeFocused();
    await evidence(page, `file-menu-${theme}`, { keyboardNavigation: true }, testInfo);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(files).toBeFocused();

    const save = page.getByRole('button', { name: '保存', exact: true });
    await save.hover();
    await expect(page.getByRole('tooltip')).toContainText('Ctrl/⌘ S');
    await evidence(page, `save-tooltip-${theme}`, {}, testInfo);
    await page.mouse.move(1590, 890);
    await page.keyboard.press('Escape');

    const render = page.getByRole('button', { name: '实时渲染', exact: true });
    await render.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await evidence(page, `render-dialog-${theme}`, {}, testInfo);
    const samples = dialog.getByRole('combobox', { name: '目标采样数', exact: true });
    await samples.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(page.getByRole('option', { name: '16', exact: true })).toBeVisible();
    await evidence(page, `render-sample-select-${theme}`, {}, testInfo);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(samples).toBeFocused();
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(render).toBeFocused();
    expect(await documentOf(page)).toEqual(initial);
    expect(await historyOf(page)).toEqual(history);
    expect((await diagnostic(page)).rendererId).toBe(rendererId);
    expect((await diagnostic(page)).render.mode).toBe('raster');

    await page.getByRole('button', { name: '庭院样板', exact: true }).click();
    await page.getByRole('button', { name: '墙体 1', exact: true }).click();
    const height = page.getByLabel('高度（m）', { exact: true });
    await height.fill('2.9');
    await height.press('Enter');
    const valid = await documentOf(page);
    const validHistory = await historyOf(page);
    expect(validHistory.undoCount).toBeGreaterThan(0);
    await files.click();
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: '新建', exact: true }).focus();
    for (const shortcut of ['Delete', 'Backspace', 'Control+z']) {
      await page.keyboard.press(shortcut);
      await expect(menu).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(await documentOf(page)).toEqual(valid);
      expect(await historyOf(page)).toEqual(validHistory);
    }
    await evidence(page, `file-menu-selection-${theme}`, { shortcutsOwnedByMenu: true }, testInfo);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(files).toBeFocused();
    await height.fill('0');
    await height.press('Enter');
    await expect(height).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('alert')).toHaveCount(1);
    expect(await documentOf(page)).toEqual(valid);
    expect(await historyOf(page)).toEqual(validHistory);
    expect((await diagnostic(page)).rendererId).toBe(rendererId);
    await evidence(page, `error-${theme}`, { rejectedDraftPreservedProject: true }, testInfo);
  }
});

/** Compares actual selected colors with resolved semantic tokens, including tooltip hover and focus. */
async function selectedWithTooltip(page: Page, control: Locator, slot: string) {
  const expected = await page.evaluate(() => {
    const token = document.createElement('span');
    token.style.backgroundColor = 'var(--accent)';
    token.style.color = 'var(--accent-foreground)';
    document.body.append(token);
    const style = getComputedStyle(token);
    const colors = { background: style.backgroundColor, foreground: style.color };
    token.remove();
    return colors;
  });
  const assertSelected = async () => {
    await expect(control).toHaveAttribute('data-state', 'on');
    await expect(control).toHaveAttribute('data-slot', slot);
    await expect
      .poll(() =>
        control.evaluate((element) => {
          const style = getComputedStyle(element);
          return { background: style.backgroundColor, foreground: style.color };
        }),
      )
      .toEqual(expected);
  };
  await assertSelected();
  await page.locator('.viewport canvas').focus();
  // Re-enter after a click: Radix deliberately does not reopen a tooltip under a stationary pointer.
  await page.mouse.move(1590, 890, { steps: 8 });
  await control.hover();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await assertSelected();
  await page.mouse.move(1590, 890);
  await page.getByRole('button', { name: '场景', exact: true }).focus();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await control.focus();
  await expect(control).toBeFocused();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await assertSelected();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await assertSelected();
}

test('tool, camera and snapping selected states survive tooltip hover and keyboard focus', async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  for (const theme of ['dark', 'light'] as const) {
    await page.goto('/');
    await page.waitForFunction(() => !!(window as unknown as Probe).__editor);
    await choose(page, '外观', theme === 'dark' ? 'Dark' : 'Light');
    const initial = await documentOf(page);
    const history = await historyOf(page);
    const rendererId = (await diagnostic(page)).rendererId;
    const tools = page.locator('.tools-bar');
    const select = tools.getByRole('radio', { name: '选择', exact: true });
    await expect(select).toHaveAttribute('aria-checked', 'true');
    await selectedWithTooltip(page, select, 'toggle-group-item');
    const wall = tools.getByRole('radio', { name: '墙体', exact: true });
    await wall.click();
    await expect(wall).toHaveAttribute('aria-checked', 'true');
    await expect(select).toHaveAttribute('aria-checked', 'false');
    await expect(tools.locator('[role="radio"][data-state="on"]')).toHaveCount(1);
    await selectedWithTooltip(page, wall, 'toggle-group-item');

    const camera = page.locator('.viewport-toolbar');
    const rotate = camera.getByRole('radio', { name: '旋转', exact: true });
    await rotate.click();
    await expect(rotate).toHaveAttribute('aria-checked', 'true');
    await expect(camera.locator('[role="radio"][data-state="on"]')).toHaveCount(1);
    await selectedWithTooltip(page, rotate, 'toggle-group-item');
    const snap = page.getByRole('button', { name: '吸附', exact: true });
    await expect(snap).toHaveAttribute('aria-pressed', 'true');
    await selectedWithTooltip(page, snap, 'toggle');
    await snap.click();
    await expect(snap).toHaveAttribute('aria-pressed', 'false');
    await expect(snap).toHaveAttribute('data-state', 'off');
    await snap.click();
    await expect(snap).toHaveAttribute('aria-pressed', 'true');
    await selectedWithTooltip(page, snap, 'toggle');

    expect(await documentOf(page)).toEqual(initial);
    expect(await historyOf(page)).toEqual(history);
    expect((await diagnostic(page)).rendererId).toBe(rendererId);
    await evidence(
      page,
      `active-tools-${theme}`,
      { selectedTool: 'wall', camera: 'rotate' },
      testInfo,
    );
  }
});

test('resizing a constrained scene pane moves exactly ten pixels without changing the inspector', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Probe).__editor);
  await page.getByRole('button', { name: labels['zh-CN'].example, exact: true }).click();
  await page.getByRole('button', { name: labels['zh-CN'].wall, exact: true }).click();
  const scene = page.getByRole('separator', { name: labels['zh-CN'].resizeScene, exact: true });
  const inspector = page.getByRole('separator', {
    name: labels['zh-CN'].resizeProperties,
    exact: true,
  });
  await enlargePanel(page, scene, 1);
  await enlargePanel(page, inspector, -1);
  const expanded = { scene: await panelValue(scene), inspector: await panelValue(inspector) };
  await page.setViewportSize({ width: 900, height: 600 });
  await assertLayout(page);
  const widths = async () => ({
    scene: await page
      .getByTestId('scene-panel')
      .evaluate((element) => element.getBoundingClientRect().width),
    inspector: await page
      .getByTestId('inspector-panel')
      .evaluate((element) => element.getBoundingClientRect().width),
  });
  const before = await widths();
  expect(before.scene).toBeLessThan(expanded.scene);
  expect(before.inspector).toBeLessThan(expanded.inspector);
  const baselineDocument = await documentOf(page);
  const baselineHistory = await historyOf(page);
  const baselineDiagnostics = await diagnostic(page);
  const canvas = await page.locator('.viewport canvas').elementHandle();
  expect(canvas).not.toBeNull();
  await scene.press('ArrowLeft');
  await expect.poll(widths).toEqual({ scene: before.scene - 10, inspector: before.inspector });
  await expect.poll(() => panelValue(scene)).toBe(before.scene - 10);
  await expect.poll(() => panelValue(inspector)).toBe(before.inspector);
  await assertLayout(page);
  await scene.press('ArrowRight');
  await expect.poll(widths).toEqual(before);
  await expect.poll(() => panelValue(scene)).toBe(before.scene);
  await expect.poll(() => panelValue(inspector)).toBe(before.inspector);
  await assertLayout(page);
  expect(await documentOf(page)).toEqual(baselineDocument);
  expect(await historyOf(page)).toEqual(baselineHistory);
  const after = await diagnostic(page);
  expect(after.rendererId).toBe(baselineDiagnostics.rendererId);
  expect(after.camera).toEqual(baselineDiagnostics.camera);
  expect(after.eventListeners).toBe(baselineDiagnostics.eventListeners);
  expect(
    await canvas!.evaluate((element) => element === document.querySelector('.viewport canvas')),
  ).toBe(true);
  await expect(page.locator('.viewport canvas')).toHaveCount(1);
});
