import { choose } from './browser-controls';
import { test, expect, type Page, type Locator } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type { ProjectDocument } from '@building/editor-core';
import type { ThreeRuntime } from '@building/three-runtime';
import { encodeProjectContainer } from '../apps/desktop/src/platform/container';

type Probe = {
  __editor: {
    document(): ProjectDocument;
    diagnostics(): ReturnType<ThreeRuntime['diagnostics']>;
    history(): { undoCount: number; redoCount: number };
  };
};
const snapshot = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__editor.document());
const diagnostics = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__editor.diagnostics());
const labels = {
  'zh-CN': {
    files: ['新建', '打开', '保存', '另存为', '撤销', '重做'],
    tools: ['选择', '墙体', '楼板', '门', '窗', '材质'],
    appearance: '外观',
    language: '语言',
    backend: '实时渲染器',
    light: '亮色',
    dark: '暗色',
    settings: '设置',
    close: '关闭',
    export: '导出 GLB',
    example: '庭院样板',
    preview: '整栋预览（只读）',
    saved: '已保存',
    unsaved: '未保存修改',
  },
  en: {
    files: ['New', 'Open', 'Save', 'Save as', 'Undo', 'Redo'],
    tools: ['Select', 'Wall', 'Slab', 'Door', 'Window', 'Material'],
    appearance: 'Appearance',
    language: 'Language',
    backend: 'Real-time renderer',
    light: 'Light',
    dark: 'Dark',
    settings: 'Settings',
    close: 'Close',
    export: 'Export GLB',
    example: 'Courtyard starter',
    preview: 'Building preview (read only)',
    saved: 'Saved',
    unsaved: 'Unsaved changes',
  },
};

async function idle(page: Page) {
  await page.waitForFunction(() => {
    const state = (window as unknown as Probe).__editor.diagnostics();
    return !state.pendingFrame && !state.render.switching && !state.render.environmentLoading;
  });
}
async function iconOnly(locator: Locator) {
  await expect(locator.locator('svg')).toHaveCount(1);
  const visibleText = await locator.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const texts: string[] = [];
    while (walker.nextNode()) {
      const value = walker.currentNode.textContent?.trim();
      if (!value) {
        continue;
      }
      let parent = walker.currentNode.parentElement;
      let hidden = false;
      while (parent && parent !== element) {
        const style = getComputedStyle(parent);
        const bounds = parent.getBoundingClientRect();
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          (style.position === 'absolute' && bounds.width <= 1 && bounds.height <= 1)
        ) {
          hidden = true;
        }
        parent = parent.parentElement;
      }
      if (!hidden) {
        texts.push(value);
      }
    }
    return texts;
  });
  expect(visibleText).toEqual([]);
  expect(await locator.getAttribute('title')).toBeNull();
}
async function contained(page: Page) {
  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      width: innerWidth,
      height: innerHeight,
      scrollWidth: root.scrollWidth,
      scrollHeight: root.scrollHeight,
      elements: [
        ...document.querySelectorAll<HTMLElement>(
          '.main-toolbar,.file-actions,.header-preferences,.header-actions,.tools-bar,.viewport-region,.main-toolbar button,.tools-bar [role="radio"]',
        ),
      ].map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          name: element.getAttribute('aria-label') ?? element.className,
          x: rect.x,
          y: rect.y,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      }),
    };
  });
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.height);
  for (const element of layout.elements) {
    expect(element.x, element.name).toBeGreaterThanOrEqual(0);
    expect(element.y, element.name).toBeGreaterThanOrEqual(0);
    expect(element.right, element.name).toBeLessThanOrEqual(layout.width);
    expect(element.bottom, element.name).toBeLessThanOrEqual(layout.height);
    expect(element.width, element.name).toBeGreaterThan(0);
    expect(element.height, element.name).toBeGreaterThan(0);
  }
  return layout;
}

async function centeredProject(page: Page, clipped = false) {
  await expect(page.locator('.main-toolbar strong:visible')).toHaveCount(0);
  const layout = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('.main-toolbar')!;
    const name = header.querySelector<HTMLElement>('.project-name')!;
    const dirty = header.querySelector<HTMLElement>('[data-testid="dirty-state"]')!;
    const bounds = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x,
        right: rect.right,
        y: rect.y,
        bottom: rect.bottom,
        width: rect.width,
        center: rect.x + rect.width / 2,
      };
    };
    return {
      header: bounds(header),
      name: bounds(name),
      dirty: bounds(dirty),
      files: bounds(header.querySelector<HTMLElement>('.file-actions')!),
      actions: bounds(header.querySelector<HTMLElement>('.header-actions')!),
      nameClipped: name.scrollWidth > name.clientWidth,
      nameTextOverflow: getComputedStyle(name).textOverflow,
      dirtyClipped: dirty.scrollWidth > dirty.clientWidth,
      nameCursor: getComputedStyle(name).cursor,
      nameTabIndex: name.getAttribute('tabindex'),
      nameRole: name.getAttribute('role'),
      nameHasTooltip: !!name.closest('[data-slot="tooltip-trigger"]'),
    };
  });
  expect(
    Math.abs(layout.name.center - layout.header.center),
    JSON.stringify(layout),
  ).toBeLessThanOrEqual(1);
  expect(layout.name.width).toBeGreaterThan(0);
  expect(layout.nameCursor).toBe('default');
  expect(layout.nameTabIndex).toBeNull();
  expect(layout.nameRole).toBeNull();
  expect(layout.nameHasTooltip).toBe(false);
  expect(layout.name.x).toBeGreaterThanOrEqual(layout.files.right);
  expect(layout.name.right).toBeLessThanOrEqual(layout.actions.x);
  expect(layout.dirtyClipped).toBe(false);
  expect(layout.dirty.width).toBeGreaterThan(0);
  expect(layout.dirty.x).toBeGreaterThanOrEqual(layout.files.right);
  expect(layout.dirty.right).toBeLessThanOrEqual(layout.name.x);
  const overlaps =
    layout.name.x < layout.dirty.right &&
    layout.dirty.x < layout.name.right &&
    layout.name.y < layout.dirty.bottom &&
    layout.dirty.y < layout.name.bottom;
  expect(overlaps, JSON.stringify(layout)).toBe(false);
  if (clipped) {
    expect(layout.nameClipped).toBe(true);
    expect(layout.nameTextOverflow).toBe('ellipsis');
  }
  return layout;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Probe).__editor);
  await idle(page);
});

for (const language of ['zh-CN', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`compact Header ${language}/${theme} keeps left file actions, icon tools and keyboard preferences at 900x600`, async ({
      page,
    }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      if (language === 'en') {
        await choose(page, '语言', 'English');
      }
      const t = labels[language];
      await choose(page, t.appearance, t[theme]);
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const header = page.locator('.main-toolbar');
      const fileButtons = header.locator('.file-actions button');
      await expect(fileButtons).toHaveCount(6);
      expect(
        await fileButtons.evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute('aria-label')),
        ),
      ).toEqual(t.files);
      const positions = await fileButtons.evaluateAll((buttons) =>
        buttons.map((button) => button.getBoundingClientRect().x),
      );
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      for (const name of t.files) {
        await iconOnly(header.getByRole('button', { name, exact: true }));
      }
      for (const name of t.tools) {
        await iconOnly(page.locator('.tools-bar').getByRole('radio', { name, exact: true }));
      }
      for (const name of [t.language, t.backend]) {
        const choice = header.getByRole('combobox', { name, exact: true });
        await expect(choice).toHaveCount(1);
        await iconOnly(choice);
      }
      const appearance = header.getByRole('button', { name: t.appearance, exact: true });
      await iconOnly(appearance);
      await expect(appearance).toHaveAttribute('aria-pressed', String(theme === 'dark'));
      await expect(appearance).toHaveAttribute('aria-description', t[theme]);
      await expect(appearance.locator('svg')).toHaveClass(
        new RegExp(theme === 'dark' ? 'lucide-moon' : 'lucide-sun'),
      );
      await expect(header.getByRole('combobox', { name: t.appearance, exact: true })).toHaveCount(
        0,
      );
      const themeHistory = await page.evaluate(() =>
        (window as unknown as Probe).__editor.history(),
      );
      const themeDocument = await snapshot(page);
      const themeRuntime = await diagnostics(page);
      await appearance.click();
      await expect(page.locator('html')).toHaveAttribute(
        'data-theme',
        theme === 'light' ? 'dark' : 'light',
      );
      await expect(page.getByRole('listbox')).toHaveCount(0);
      await expect(page.getByRole('option', { name: /Follow system|跟随系统/ })).toHaveCount(0);
      await appearance.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const backend = header.getByRole('combobox', { name: t.backend, exact: true });
      await expect(backend).toHaveText('WebGL');
      expect(await backend.ariaSnapshot()).toContain('WebGL');
      await iconOnly(header.getByRole('button', { name: t.export, exact: true }));
      await iconOnly(header.getByRole('button', { name: t.settings, exact: true }));
      await expect(page.locator('.window-controls')).toHaveCount(0);
      const first = fileButtons.first();
      await first.hover();
      await expect(page.getByRole('tooltip')).toHaveText(t.files[0]!);
      await page.mouse.move(850, 580, { steps: 8 });
      await expect(page.getByRole('tooltip')).toHaveCount(0);
      const disabledUndo = header.getByRole('button', { name: t.files[4]!, exact: true });
      await expect(disabledUndo).toBeDisabled();
      await disabledUndo.locator('..').hover();
      await expect(page.getByRole('tooltip')).toHaveText(`${t.files[4]} (Ctrl/⌘ Z)`);
      await page.mouse.move(850, 580, { steps: 8 });
      await expect(page.getByRole('tooltip')).toHaveCount(0);
      await header.getByRole('button', { name: t.export, exact: true }).focus();
      await page.keyboard.press('Tab');
      await expect(appearance).toBeFocused();
      await expect(page.getByRole('tooltip')).toHaveText(`${t.appearance}: ${t[theme]}`);
      await page.keyboard.press('Enter');
      await expect(page.locator('html')).toHaveAttribute(
        'data-theme',
        theme === 'light' ? 'dark' : 'light',
      );
      await expect(appearance).toHaveAttribute('aria-pressed', String(theme !== 'dark'));
      await expect(page.getByRole('listbox')).toHaveCount(0);
      await expect(appearance).toBeFocused();
      await page.keyboard.press('Space');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(appearance).toHaveAttribute('aria-pressed', String(theme === 'dark'));
      await expect(page.getByRole('listbox')).toHaveCount(0);
      for (const colorScheme of ['dark', 'light'] as const) {
        await page.emulateMedia({ colorScheme });
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      }
      expect(await snapshot(page)).toEqual(themeDocument);
      expect(await page.evaluate(() => (window as unknown as Probe).__editor.history())).toEqual(
        themeHistory,
      );
      expect((await diagnostics(page)).rendererId).toBe(themeRuntime.rendererId);
      await page.keyboard.press('Tab');
      await expect(header.getByRole('combobox', { name: t.language, exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(header.getByRole('combobox', { name: t.backend, exact: true })).toBeFocused();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: t.example, exact: true }).click();
      await idle(page);
      const document = await snapshot(page);
      const initial = await diagnostics(page);
      await choose(page, t.appearance, t[theme === 'light' ? 'dark' : 'light']);
      await choose(page, t.appearance, t[theme]);
      await idle(page);
      const current = await diagnostics(page);
      expect(current.rendererId).toBe(initial.rendererId);
      expect(current.sceneId).toBe(initial.sceneId);
      expect(current.cameraId).toBe(initial.cameraId);
      expect(current.camera).toEqual(initial.camera);
      expect(await snapshot(page)).toEqual(document);
      const wallTool = page
        .locator('.tools-bar')
        .getByRole('radio', { name: t.tools[1]!, exact: true });
      await wallTool.click();
      await expect(wallTool).toHaveAttribute('aria-checked', 'true');
      await page.getByRole('checkbox', { name: t.preview, exact: true }).check();
      await expect(wallTool).toBeDisabled();
      await wallTool.locator('..').hover();
      await expect(page.getByRole('tooltip')).toHaveText(t.tools[1]!);
      await page.mouse.move(850, 580, { steps: 8 });
      await expect(page.getByRole('tooltip')).toHaveCount(0);
      await page.getByRole('checkbox', { name: t.preview, exact: true }).uncheck();
      await expect(wallTool).toBeEnabled();
      await expect(wallTool).toHaveAttribute('aria-checked', 'true');
      await page
        .locator('.tools-bar')
        .getByRole('radio', { name: t.tools[0]!, exact: true })
        .click();
      expect(await snapshot(page)).toEqual(document);
      await header.getByRole('button', { name: t.settings, exact: true }).click();
      const dialog = page.getByRole('dialog');
      for (const name of [t.appearance, t.language, t.backend]) {
        await expect(dialog.getByRole('combobox', { name, exact: true })).toHaveCount(0);
      }
      await dialog.getByRole('button', { name: t.close, exact: true }).click();
      await expect(header.getByRole('button', { name: t.settings, exact: true })).toBeFocused();
      await page.mouse.move(850, 580, { steps: 8 });
      await page.keyboard.press('Escape');
      const layout = await contained(page);
      const centeredAtMinimum = await centeredProject(page);
      expect(errors).toEqual([]);
      const screenshot = testInfo.outputPath(`header-${language}-${theme}-900x600.png`);
      await page.screenshot({ path: screenshot });
      const centeredAtWide: {
        width: number;
        layout: Awaited<ReturnType<typeof centeredProject>>;
      }[] = [];
      for (const size of [
        { width: 1440, height: 900 },
        { width: 1600, height: 900 },
      ]) {
        await page.setViewportSize(size);
        centeredAtWide.push({ width: size.width, layout: await centeredProject(page) });
        await contained(page);
        await page.screenshot({
          path: testInfo.outputPath(`header-${language}-${theme}-${size.width}x900.png`),
        });
      }
      expect(await snapshot(page)).toEqual(document);
      expect((await diagnostics(page)).rendererId).toBe(initial.rendererId);
      await writeFile(
        testInfo.outputPath('header-layout.json'),
        JSON.stringify(
          {
            scope:
              'Actual Chromium browser UI; native controls hidden, no Tauri/native desktop acceptance claim',
            language,
            theme,
            fileActionOrder: t.files,
            iconOnlyVisibleActions: true,
            localizedHoverAndKeyboardTooltips: true,
            headerPreferencesKeyboardAccessible: true,
            themeDirectClickEnterSpaceToggleWithoutPopup: true,
            themeDoesNotFollowSystemMedia: true,
            documentSceneCameraRendererPreserved: true,
            preferencesRemovedFromDialog: true,
            layout,
            projectCenteredAtAllWidths: { minimum: centeredAtMinimum, wide: centeredAtWide },
            screenshot,
            errors,
          },
          null,
          2,
        ),
      );
    });
  }
}

test('Header language theme and renderer choices persist across reload without creating project history', async ({
  page,
}) => {
  const document = await snapshot(page);
  const initial = await diagnostics(page);
  const history = await page.evaluate(() => (window as unknown as Probe).__editor.history());
  await choose(page, '外观', '暗色');
  await choose(page, '语言', 'English');
  await choose(page, 'Real-time renderer', 'WebGL');
  await idle(page);
  expect(await snapshot(page)).toEqual(document);
  expect(await page.evaluate(() => (window as unknown as Probe).__editor.history())).toEqual(
    history,
  );
  const current = await diagnostics(page);
  expect(current.rendererId).toBe(initial.rendererId);
  expect(current.sceneId).toBe(initial.sceneId);
  expect(current.cameraId).toBe(initial.cameraId);
  expect(current.camera).toEqual(initial.camera);
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem('building-editor.settings.v1') ?? 'null'),
      ),
    )
    .toEqual({ themeMode: 'dark', language: 'en', rendererBackend: 'webgl' });
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as Probe).__editor);
  await idle(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const header = page.locator('.main-toolbar');
  const appearance = header.getByRole('button', { name: 'Appearance', exact: true });
  await expect(appearance).toHaveAttribute('aria-pressed', 'true');
  await expect(appearance).toHaveAttribute('aria-description', 'Dark');
  for (const [name, value] of [
    ['Language', 'English'],
    ['Real-time renderer', 'WebGL'],
  ]) {
    const choice = header.getByRole('combobox', { name, exact: true });
    await expect(choice).toHaveText(value);
    expect(await choice.ariaSnapshot()).toContain(value);
  }
  await expect(header.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await expect(page.locator('canvas')).toHaveCount(1);
});

test('legacy system theme cache migrates to dark and ignores subsequent OS media changes', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('theme-toggle-legacy-seeded')) {
      localStorage.setItem(
        'building-editor.settings.v1',
        JSON.stringify({ themeMode: 'system', language: 'zh-CN', rendererBackend: 'webgl' }),
      );
      localStorage.setItem('building-theme', 'system');
      localStorage.setItem('theme-toggle-legacy-seeded', 'true');
    }
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as Probe).__editor);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const appearance = page.getByRole('button', { name: '外观', exact: true });
  await expect(appearance).toHaveAttribute('aria-pressed', 'true');
  await expect(appearance).toHaveAttribute('aria-description', '暗色');
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  }
  expect(await page.evaluate(() => localStorage.getItem('building-theme'))).toBe('dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: '外观', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('building-editor.settings.v1') ?? 'null')?.themeMode,
      ),
    )
    .toBe('light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('long project name and local filename stay discoverable while saved state and Header controls fit 900x600', async ({
  page,
}, testInfo) => {
  const document = await snapshot(page);
  document.name = '中文建筑工程 '.repeat(18);
  const fileName = `${'long local project name '.repeat(12)}.building`;
  const bytes = await encodeProjectContainer(document);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await (
    await chooser
  ).setFiles({ name: fileName, mimeType: 'application/zip', buffer: Buffer.from(bytes) });
  await expect.poll(async () => (await snapshot(page)).name).toBe(document.name);
  const projectName = page.locator('.project-name');
  await expect(projectName).toHaveText(document.name);
  const displayStyle = await projectName.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      cursor: style.cursor,
      background: style.backgroundColor,
      color: style.color,
      outline: style.outline,
      boxShadow: style.boxShadow,
      textDecoration: style.textDecoration,
    };
  });
  await projectName.hover();
  await page.waitForTimeout(150);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  expect(await projectName.getAttribute('tabindex')).toBeNull();
  expect(await projectName.getAttribute('title')).toBeNull();
  const hoverStyle = await projectName.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      cursor: style.cursor,
      background: style.backgroundColor,
      color: style.color,
      outline: style.outline,
      boxShadow: style.boxShadow,
      textDecoration: style.textDecoration,
    };
  });
  expect(hoverStyle).toEqual(displayStyle);
  expect(hoverStyle.cursor).toBe('default');
  await page.mouse.move(850, 580, { steps: 8 });
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(page.getByTestId('dirty-state')).toHaveText('已保存');
  const layouts: {
    state: string;
    language: string;
    theme: string;
    width: number;
    layout: Awaited<ReturnType<typeof centeredProject>>;
  }[] = [];
  let currentLanguage: 'zh-CN' | 'en' = 'zh-CN';
  for (const state of ['saved', 'unsaved'] as const) {
    if (state === 'unsaved') {
      await page
        .getByRole('button', {
          name: currentLanguage === 'en' ? 'Add level' : '新增楼层',
          exact: true,
        })
        .click();
    }
    for (const language of ['zh-CN', 'en'] as const) {
      if (currentLanguage !== language) {
        await choose(
          page,
          labels[currentLanguage].language,
          language === 'en' ? 'English' : '简体中文',
        );
        currentLanguage = language;
      }
      await expect(page.getByTestId('dirty-state')).toHaveText(labels[language][state]);
      for (const theme of ['light', 'dark'] as const) {
        await choose(page, labels[language].appearance, labels[language][theme]);
        for (const size of [
          { width: 900, height: 600 },
          { width: 1440, height: 900 },
          { width: 1600, height: 900 },
        ]) {
          await page.setViewportSize(size);
          layouts.push({
            state,
            language,
            theme,
            width: size.width,
            layout: await centeredProject(page, true),
          });
          await contained(page);
          await page.screenshot({
            path: testInfo.outputPath(
              `header-long-project-${language}-${theme}-${state}-${size.width}.png`,
            ),
          });
        }
      }
    }
  }
  await writeFile(
    testInfo.outputPath('centered-long-project.json'),
    JSON.stringify(
      {
        scope: 'Actual Chromium browser UI, no native desktop claim',
        savedAndUnsavedStatesRemainReadable: true,
        projectNameIsPlainDisplay: { displayStyle, hoverStyle, noTooltip: true },
        layouts,
      },
      null,
      2,
    ),
  );
});
