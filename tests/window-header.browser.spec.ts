import { choose } from './browser-controls';
import { expect, test, type Page } from '@playwright/test';
import { createEmptyProject, type ProjectDocument } from '@building/editor-core';
import { encodeProjectContainer } from '../apps/desktop/src/platform';

type HostEvent = { event: string; id: number; payload: unknown };
type MockHost = {
  commands: string[];
  maximized: boolean;
  failCommand: string | null;
  blockPreferences: boolean;
  releasePreferences(): void;
  listenerCount(event: string): number;
};
type Probe = {
  __mockWindowHost: MockHost;
  __editor: { document(): ProjectDocument; diagnostics(): { rendererId: string } };
};

/** This exercises real frontend Tauri bindings against simulated IPC in Chromium, not a native host. */
async function installHost(
  page: Page,
  language: 'en' | 'zh-CN',
  themeMode: 'light' | 'dark',
  projectBytes?: Uint8Array,
) {
  await page.addInitScript(
    ({ language, themeMode, projectBytes }) => {
      const callbacks = new Map<number, (event: HostEvent) => void | Promise<void>>();
      const listeners = new Map<number, { event: string; callback: number }>();
      const pendingPreferences = new Set<() => void>();
      let callbackId = 0;
      let eventId = 0;
      const host: MockHost = {
        commands: [],
        maximized: false,
        failCommand: null,
        blockPreferences: false,
        releasePreferences() {
          host.blockPreferences = false;
          for (const resolve of pendingPreferences) {
            resolve();
          }
          pendingPreferences.clear();
        },
        listenerCount(event) {
          return Array.from(listeners.values()).filter((listener) => listener.event === event)
            .length;
        },
      };
      const emit = async (event: string, payload: unknown) => {
        await Promise.all(
          Array.from(listeners.entries())
            .filter(([, listener]) => listener.event === event)
            .map(([id, listener]) => callbacks.get(listener.callback)?.({ event, id, payload })),
        );
      };
      Object.assign(window, {
        isTauri: true,
        __mockWindowHost: host,
        __TAURI_EVENT_PLUGIN_INTERNALS__: {
          unregisterListener(_event: string, id: number) {
            listeners.delete(id);
          },
        },
        __TAURI_INTERNALS__: {
          metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
          transformCallback(callback: (event: HostEvent) => void | Promise<void>) {
            const id = ++callbackId;
            callbacks.set(id, callback);
            return id;
          },
          unregisterCallback(id: number) {
            callbacks.delete(id);
          },
          async invoke(command: string, args: Record<string, unknown>) {
            host.commands.push(command);
            if (host.failCommand === command) {
              throw new Error('Simulated native command failure');
            }
            switch (command) {
              case 'load_settings':
                return { language, themeMode, rendererBackend: 'webgl' };
              case 'save_settings':
                if (host.blockPreferences) {
                  await new Promise<void>((resolve) => pendingPreferences.add(resolve));
                }
                return;
              case 'plugin:dialog|open':
                return 'C:\\工程交付\\建筑方案与正式成果文件夹\\超长目录名称\\审查与归档\\超长工程名称以测试自定义标题栏布局和未保存提示.building';
              case 'open_project':
                return new Uint8Array(projectBytes).buffer;
              case 'control_ready':
                return;
              case 'plugin:event|listen': {
                const id = ++eventId;
                listeners.set(id, {
                  event: args.event as string,
                  callback: args.handler as number,
                });
                return id;
              }
              case 'plugin:event|unlisten':
              case 'plugin:window|minimize':
              case 'plugin:window|start_dragging':
              case 'plugin:window|destroy':
                return;
              case 'plugin:window|is_maximized':
                return host.maximized;
              case 'plugin:window|toggle_maximize':
                host.maximized = !host.maximized;
                await emit('tauri://resize', { width: 900, height: 600 });
                return;
              case 'plugin:window|close':
                // Native close returns while JS closeRequested can await the project decision.
                void emit('tauri://close-requested', null);
                return;
              default:
                throw new Error(`Unexpected simulated native command: ${command}`);
            }
          },
        },
      });
    },
    { language, themeMode, projectBytes: Array.from(projectBytes ?? []) },
  );
}

const commands = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__mockWindowHost.commands);
const documentOf = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__editor.document());
const rendererOf = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__editor.diagnostics().rendererId);

async function openEditor(
  page: Page,
  language: 'en' | 'zh-CN',
  theme: 'light' | 'dark',
  projectBytes?: Uint8Array,
) {
  await page.setViewportSize({ width: 900, height: 600 });
  await installHost(page, language, theme, projectBytes);
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Probe).__editor);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as Probe).__mockWindowHost.listenerCount('tauri://close-requested'),
      ),
    )
    .toBe(1);
  await expect(page.locator('.window-controls')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);
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
      controls: bounds(header.querySelector<HTMLElement>('.window-controls')!),
      nameClipped: name.scrollWidth > name.clientWidth,
      nameTextOverflow: getComputedStyle(name).textOverflow,
      dirtyClipped: dirty.scrollWidth > dirty.clientWidth,
      nameCursor: getComputedStyle(name).cursor,
      nameTabIndex: name.getAttribute('tabindex'),
      nameHasTooltip: !!name.closest('[data-slot="tooltip-trigger"]'),
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
    };
  });
  expect(
    Math.abs(layout.name.center - layout.header.center),
    JSON.stringify(layout),
  ).toBeLessThanOrEqual(1);
  expect(layout.name.width).toBeGreaterThan(0);
  expect(layout.nameCursor).toBe('default');
  expect(layout.nameTabIndex).toBeNull();
  expect(layout.nameHasTooltip).toBe(false);
  expect(layout.name.x).toBeGreaterThanOrEqual(layout.files.right);
  expect(layout.name.right).toBeLessThanOrEqual(layout.actions.x);
  expect(layout.dirtyClipped).toBe(false);
  expect(layout.dirty.width).toBeGreaterThan(0);
  expect(layout.dirty.x).toBeGreaterThanOrEqual(layout.files.right);
  expect(layout.dirty.right).toBeLessThanOrEqual(layout.name.x);
  expect(layout.actions.right).toBeLessThanOrEqual(layout.controls.x);
  expect(layout.controls.right).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth);
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

for (const [language, theme] of [
  ['zh-CN', 'dark'],
  ['en', 'light'],
] as const) {
  test(`simulated Tauri Header ${language}/${theme}: native controls fit 900px and preserve the renderer`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openEditor(page, language, theme);
    const beforeDocument = await documentOf(page);
    const beforeRenderer = await rendererOf(page);
    const labels =
      language === 'en'
        ? {
            minimize: 'Minimize window',
            maximize: 'Maximize window',
            restore: 'Restore window',
            appearance: 'Appearance',
            light: 'Light',
            dark: 'Dark',
          }
        : {
            minimize: '最小化窗口',
            maximize: '最大化窗口',
            restore: '还原窗口',
            appearance: '外观',
            light: '亮色',
            dark: '暗色',
          };
    const header = page.locator('.main-toolbar');
    const bounds = await header.evaluate((element) =>
      Array.from(element.querySelectorAll<HTMLElement>('button')).map((button) => {
        const rect = button.getBoundingClientRect();
        const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
        const visibleText: string[] = [];
        while (walker.nextNode()) {
          const text = walker.currentNode.textContent?.trim();
          let parent = walker.currentNode.parentElement;
          if (!text) {
            continue;
          }
          let hidden = false;
          while (parent && parent !== button) {
            const style = getComputedStyle(parent);
            const clipped =
              style.position === 'absolute' && (style.clip !== 'auto' || style.clipPath !== 'none');
            if (style.display === 'none' || style.visibility === 'hidden' || clipped) {
              hidden = true;
            }
            parent = parent.parentElement;
          }
          if (!hidden) {
            visibleText.push(text);
          }
        }
        return {
          name: button.getAttribute('aria-label'),
          x: rect.x,
          right: rect.right,
          width: rect.width,
          height: rect.height,
          text: visibleText.join(' '),
        };
      }),
    );
    for (const bound of bounds) {
      expect(bound.x).toBeGreaterThanOrEqual(0);
      expect(bound.right).toBeLessThanOrEqual(900);
      expect(bound.width, bound.name ?? 'Header icon control').toBeGreaterThanOrEqual(32);
      expect(bound.height).toBeGreaterThanOrEqual(32);
      expect(bound.text).toBe('');
    }
    const dragCount = async () =>
      (await commands(page)).filter((command) => command === 'plugin:window|start_dragging').length;
    const dragBeforeIcons = await dragCount();
    await page.getByRole('button', { name: labels.minimize, exact: true }).locator('svg').click();
    await expect.poll(() => commands(page)).toContain('plugin:window|minimize');
    await page.getByRole('button', { name: labels.maximize, exact: true }).click();
    await expect(page.getByRole('button', { name: labels.restore, exact: true })).toBeVisible();
    await page.getByRole('button', { name: labels.restore, exact: true }).click();
    await expect(page.getByRole('button', { name: labels.maximize, exact: true })).toBeVisible();
    expect(await dragCount()).toBe(dragBeforeIcons);
    await expect(page.locator('.window-drag-region')).toHaveCount(0);
    const disabledUndo = page.getByRole('button', {
      name: language === 'en' ? 'Undo' : '撤销',
      exact: true,
    });
    await expect(disabledUndo).toBeDisabled();
    await disabledUndo.locator('..').click();
    expect(await dragCount()).toBe(dragBeforeIcons);
    const draft = page.getByLabel(language === 'en' ? 'Level height (m)' : '层高（m）', {
      exact: true,
    });
    await draft.fill('-');
    const backgroundPoints = await header.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const buttons = [...element.querySelectorAll<HTMLElement>('.file-actions button')].map(
        (button) => button.getBoundingClientRect(),
      );
      const project = element.querySelector<HTMLElement>('.project-name')!.getBoundingClientRect();
      const dirty = element
        .querySelector<HTMLElement>('[data-testid="dirty-state"]')!
        .getBoundingClientRect();
      const exportButton = element
        .querySelector<HTMLElement>('.header-actions button')!
        .getBoundingClientRect();
      const preference = element
        .querySelector<HTMLElement>('.header-preferences button')!
        .getBoundingClientRect();
      const middle = (rect: DOMRect) => ({
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
      });
      return [
        { name: 'Header padding', x: bounds.x + 3, y: bounds.y + 3 },
        {
          name: 'Left file action gap',
          x: (buttons[0]!.right + buttons[1]!.x) / 2,
          y: middle(buttons[0]!).y,
        },
        { name: 'Saved status', ...middle(dirty) },
        { name: 'Project name', ...middle(project) },
        {
          name: 'Right preference gap',
          x: (exportButton.right + preference.x) / 2,
          y: middle(preference).y,
        },
      ].map((point) => ({
        ...point,
        actualTarget: document.elementFromPoint(point.x, point.y)?.tagName,
      }));
    });
    for (const point of backgroundPoints) {
      const count = await dragCount();
      await page.mouse.click(point.x, point.y);
      await expect.poll(dragCount, point.name).toBe(count + 1);
      await expect(draft).toBeFocused();
      await expect(draft).toHaveValue('-');
      expect(await documentOf(page)).toEqual(beforeDocument);
    }
    const projectPoint = backgroundPoints.find((point) => point.name === 'Project name')!;
    const beforeDoubleClick = await dragCount();
    const beforeToggle = (await commands(page)).filter(
      (command) => command === 'plugin:window|toggle_maximize',
    ).length;
    await page.mouse.dblclick(projectPoint.x, projectPoint.y);
    await expect(page.getByRole('button', { name: labels.restore, exact: true })).toBeVisible();
    await expect.poll(dragCount).toBe(beforeDoubleClick + 1);
    expect(
      (await commands(page)).filter((command) => command === 'plugin:window|toggle_maximize')
        .length,
    ).toBe(beforeToggle + 1);
    await expect(draft).toBeFocused();
    await expect(draft).toHaveValue('-');
    await page.getByRole('button', { name: labels.restore, exact: true }).click();
    const beforeThemeIcon = await dragCount();
    const modeBeforeThemeIcon = await page.locator('html').getAttribute('data-theme');
    await page.getByRole('button', { name: labels.appearance, exact: true }).locator('svg').click();
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      modeBeforeThemeIcon === 'light' ? 'dark' : 'light',
    );
    await expect(page.getByRole('listbox')).toHaveCount(0);
    expect(await dragCount()).toBe(beforeThemeIcon);
    for (const [label, option] of [
      [language === 'en' ? 'Language' : '语言', language === 'en' ? 'English' : '简体中文'],
      [language === 'en' ? 'Real-time renderer' : '实时渲染器', 'WebGL'],
    ]) {
      const beforePortal = await dragCount();
      await choose(page, label, option);
      expect(await dragCount()).toBe(beforePortal);
    }
    const centeredLayouts: {
      theme: string;
      width: number;
      layout: Awaited<ReturnType<typeof centeredProject>>;
    }[] = [];
    for (const selectedTheme of ['light', 'dark'] as const) {
      const beforeSelect = await dragCount();
      await choose(page, labels.appearance, labels[selectedTheme]);
      expect(await dragCount()).toBe(beforeSelect);
      await expect(page.locator('html')).toHaveAttribute('data-theme', selectedTheme);
      for (const size of [
        { width: 900, height: 600 },
        { width: 1440, height: 900 },
        { width: 1600, height: 900 },
      ]) {
        await page.setViewportSize(size);
        centeredLayouts.push({
          theme: selectedTheme,
          width: size.width,
          layout: await centeredProject(page),
        });
        await page.screenshot({
          path: `${testInfo.outputDir}/window-header-centered-${language}-${selectedTheme}-${size.width}.png`,
        });
      }
    }
    await page.setViewportSize({ width: 900, height: 600 });
    await choose(page, labels.appearance, labels[theme]);
    expect(await documentOf(page)).toEqual(beforeDocument);
    expect(await rendererOf(page)).toBe(beforeRenderer);
    expect(errors).toEqual([]);
    await testInfo.attach('simulated-host-project-centering', {
      body: JSON.stringify(
        {
          scope:
            'Real frontend in Chromium with simulated Tauri IPC; no native desktop acceptance claim',
          language,
          backgroundPoints,
          backgroundSingleClickAndDoubleClickRouting: true,
          interactiveIconsDisabledWrappersAndPortalOptionsExcluded: true,
          numericDraftFocusPreservedWhileDragging: true,
          centeredLayouts,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
    await page.screenshot({
      path: `${testInfo.outputDir}/window-header-${language}-${theme}-900.png`,
    });
  });
}

test('simulated Tauri Header close waits for preferences, Cancel preserves project, and Discard reaches destroy', async ({
  page,
}) => {
  await openEditor(page, 'zh-CN', 'light');
  await page.getByRole('button', { name: '可编辑示例', exact: true }).click();
  await page.getByRole('button', { name: '新增楼层', exact: true }).click();
  await expect(page.getByTestId('dirty-state')).toHaveText('未保存修改');
  const beforeDocument = await documentOf(page);
  const beforeRenderer = await rendererOf(page);
  await page.evaluate(() => {
    (window as unknown as Probe).__mockWindowHost.blockPreferences = true;
  });
  await page.getByRole('button', { name: '外观', exact: true }).locator('svg').click();
  await expect.poll(() => commands(page)).toContain('save_settings');
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await expect.poll(() => commands(page)).toContain('plugin:window|close');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await commands(page)).not.toContain('plugin:window|destroy');
  await page.evaluate(() => (window as unknown as Probe).__mockWindowHost.releasePreferences());
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await commands(page)).not.toContain('plugin:window|destroy');
  expect(await documentOf(page)).toEqual(beforeDocument);
  expect(await rendererOf(page)).toBe(beforeRenderer);
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '放弃', exact: true }).click();
  await expect.poll(() => commands(page)).toContain('plugin:window|destroy');
});

test('simulated Tauri Header native failure displays a localized error and allows retry', async ({
  page,
}) => {
  await openEditor(page, 'en', 'light');
  const beforeDocument = await documentOf(page);
  await page.evaluate(() => {
    (window as unknown as Probe).__mockWindowHost.failCommand = 'plugin:window|minimize';
  });
  await page.getByRole('button', { name: 'Minimize window', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Window action failed. Please try again.');
  await expect(page.getByRole('button', { name: 'Minimize window', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    (window as unknown as Probe).__mockWindowHost.failCommand = null;
  });
  await page.getByRole('button', { name: 'Minimize window', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await commands(page)).filter((command) => command === 'plugin:window|minimize').length,
    )
    .toBe(2);
  expect(await documentOf(page)).toEqual(beforeDocument);
});

test('simulated Tauri Header keeps long project names, dirty status and window controls separated at 900px', async ({
  page,
}, testInfo) => {
  const name = '建筑设计方案与正式交付工程名称'.repeat(6);
  const bytes = await encodeProjectContainer(createEmptyProject(name));
  await openEditor(page, 'zh-CN', 'dark', bytes);
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.locator('.project-name')).toHaveText(name);
  const dirty = page.getByTestId('dirty-state');
  await expect(dirty).toHaveText('已保存');
  for (const state of ['saved', 'unsaved'] as const) {
    if (state === 'unsaved') {
      await page.getByRole('button', { name: '新增楼层', exact: true }).click();
      await expect(dirty).toHaveText('未保存修改');
    }
    for (const size of [
      { width: 900, height: 600 },
      { width: 1440, height: 900 },
      { width: 1600, height: 900 },
    ]) {
      await page.setViewportSize(size);
      await centeredProject(page, true);
      await page.screenshot({
        path: `${testInfo.outputDir}/window-header-long-project-${state}-${size.width}.png`,
      });
    }
  }
});
