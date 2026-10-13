import { evidencePath } from './evidence-path';
import { choose } from './browser-controls';
import { test, expect, type Page, type Locator } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { ProjectDocument } from '@building/editor-core';
import type { ThreeRuntime } from '@building/three-runtime';

type Probe = {
  __editor: { document(): ProjectDocument; diagnostics(): ReturnType<ThreeRuntime['diagnostics']> };
};
const documentOf = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__editor.document());
const diagnostic = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__editor.diagnostics());
const tokenSource = JSON.parse(
  readFileSync('packages/ui/src/tokens/source.json', 'utf8'),
) as Record<'light' | 'dark', Record<string, string>>;
const appSource =
  readFileSync('apps/desktop/src/App.tsx', 'utf8') +
  readFileSync('apps/desktop/src/ui/Inspector.tsx', 'utf8') +
  readFileSync('packages/ui/src/components/button.tsx', 'utf8');
const customTooltipUsed = /<Tooltip(?:Trigger|Content|\s|>)/.test(appSource);
const toastUsed = /\b(?:toast\(|<Toaster\b|<Toast\b)/.test(appSource);
const labels = {
  'zh-CN': {
    settings: '设置',
    appearance: '外观',
    language: '语言',
    light: '亮色',
    dark: '暗色',
    close: '关闭',
    redo: '重做',
    example: '可编辑示例',
    wall: '墙体 1',
    length: '轴线长度（m）',
    error: '操作失败',
    dismiss: '关闭提示',
    surface: '表面',
    sideB: 'B 面',
    image: '图片',
    plaster: '墙面',
    save: '保存',
    saved: '工程已保存',
    addLevel: '新增楼层',
    select: '选择',
  },
  en: {
    settings: 'Settings',
    appearance: 'Appearance',
    language: 'Language',
    light: 'Light',
    dark: 'Dark',
    close: 'Close',
    redo: 'Redo',
    example: 'Editable example',
    wall: 'Wall 1',
    length: 'Axis length (m)',
    error: 'Operation failed',
    dismiss: 'Dismiss',
    surface: 'Surface',
    sideB: 'Side B',
    image: 'Image',
    plaster: 'Plaster',
    save: 'Save',
    saved: 'Project saved',
    addLevel: 'Add level',
    select: 'Select',
  },
};

function record(name: string, details: unknown) {
  const path = evidencePath('theme-toggle/evidence/ui-states-validation.json');
  mkdirSync(evidencePath('theme-toggle/evidence'), { recursive: true });
  const previous = existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8'))
    : {
        scope:
          'Windows Chromium/SwiftShader browser production UI only. No Tauri/native GUI/macOS or native tooltip visual acceptance.',
        runs: [],
      };
  previous.runs.push({ name, status: 'passed', measuredAt: new Date().toISOString(), details });
  writeFileSync(path, JSON.stringify(previous, null, 2));
}
async function style(locator: Locator) {
  return locator.evaluate((element) => {
    const s = getComputedStyle(element);
    const pixel = (color: string) => {
      // Use a fresh surface, matching expectedPixel. Chromium GPU surface reuse can round translucent color-mix channels differently after an opaque draw.
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data);
    };
    const ring = s.getPropertyValue('--tw-ring-color');
    return {
      color: s.color,
      background: s.backgroundColor,
      border: s.borderColor,
      boxShadow: s.boxShadow,
      outline: s.outline,
      outlineColor: s.outlineColor,
      outlineWidth: s.outlineWidth,
      outlineStyle: s.outlineStyle,
      fill: s.fill,
      opacity: s.opacity,
      pointerEvents: s.pointerEvents,
      focusVisible: element.matches(':focus-visible'),
      cursor: s.cursor,
      userSelect: s.userSelect,
      colorRGBA: pixel(s.color),
      backgroundRGBA: pixel(s.backgroundColor),
      borderRGBA: pixel(s.borderColor),
      outlineRGBA: pixel(s.outlineColor),
      fillRGBA: pixel(s.fill),
      ring,
      ringRGBA: ring ? pixel(ring) : null,
      portalOutsideRoot: !document.querySelector('#root')!.contains(element),
    };
  });
}
async function expectedPixel(page: Page, color: string) {
  return page.evaluate((color) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    return Array.from(ctx.getImageData(0, 0, 1, 1).data);
  }, color);
}
async function semantic(
  page: Page,
  locator: Locator,
  property: 'backgroundRGBA' | 'colorRGBA' | 'borderRGBA' | 'ringRGBA' | 'outlineRGBA' | 'fillRGBA',
  value: string,
) {
  const expected = await expectedPixel(page, value);
  await expect.poll(async () => (await style(locator))[property]).toEqual(expected);
  await locator.evaluate(async (element) => {
    await Promise.allSettled(element.getAnimations().map((animation) => animation.finished));
  });
  return style(locator);
}
async function layout(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const selectors = [
      '.editor',
      '.main-toolbar',
      '.file-actions',
      '.tools-bar',
      '.work-area',
      '.viewport-region',
      '.floors',
      '.inspector',
      '[data-slot="dialog-content"]',
      '[data-slot="select-content"]',
      '[data-slot="tooltip-content"]',
    ];
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        scrollHeight: root.scrollHeight,
        clientHeight: root.clientHeight,
      },
      elements: selectors.flatMap((selector) =>
        Array.from(document.querySelectorAll<HTMLElement>(selector)).map((element) => {
          const r = element.getBoundingClientRect();
          return {
            selector,
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
          };
        }),
      ),
    };
  });
}
async function noOverflow(page: Page) {
  const result = await layout(page);
  expect(result.document.scrollWidth).toBeLessThanOrEqual(result.viewport.width + 1);
  expect(result.document.scrollHeight).toBeLessThanOrEqual(result.viewport.height + 1);
  for (const element of result.elements) {
    expect(element.x, element.selector).toBeGreaterThanOrEqual(-1);
    expect(element.x + element.width, element.selector).toBeLessThanOrEqual(
      result.viewport.width + 1,
    );
    expect(element.scrollWidth, element.selector).toBeLessThanOrEqual(element.clientWidth + 1);
  }
  return result;
}
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Probe).__editor);
  await expect(page.locator('canvas')).toHaveCount(1);
});

for (const language of ['zh-CN', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`A35 ${language}/${theme} actual portals, errors, disabled/focus states and compact layout`, async ({
      page,
    }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const t = labels[language],
        palette = tokenSource[theme];
      if (language === 'en') {
        await choose(page, '语言', 'English');
      }
      await choose(page, t.appearance, t[theme]);
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.getByRole('button', { name: t.example, exact: true }).click();
      await page.getByRole('button', { name: t.wall, exact: true }).click();
      const baseline = await documentOf(page),
        renderer = (await diagnostic(page)).rendererId;
      const toolbar = await semantic(
        page,
        page.locator('.main-toolbar'),
        'backgroundRGBA',
        palette.card!,
      );
      const sidebar = await semantic(
        page,
        page.locator('.inspector'),
        'backgroundRGBA',
        palette.sidebar!,
      );
      const redo = page.getByRole('button', { name: t.redo, exact: true });
      await expect(redo).toBeDisabled();
      const disabled = await style(redo);
      expect(Number(disabled.opacity)).toBe(0.5);
      expect(disabled.pointerEvents).toBe('none');
      const titleHint = page.getByRole('button', { name: t.addLevel, exact: true });
      expect(await titleHint.getAttribute('title')).toBeNull();
      expect(customTooltipUsed).toBe(true);
      expect(toastUsed).toBe(false);
      await titleHint.hover();
      const tooltip = page.locator('[data-slot="tooltip-content"]');
      await expect(tooltip).toBeVisible();
      await expect(page.getByRole('tooltip', { name: t.addLevel, exact: true })).toHaveCount(1);
      const tooltipHover = await semantic(page, tooltip, 'backgroundRGBA', palette.foreground!);
      await semantic(page, tooltip, 'colorRGBA', palette.background!);
      expect(tooltipHover.portalOutsideRoot).toBe(true);
      const tooltipArrow = await semantic(
        page,
        tooltip.locator('svg'),
        'fillRGBA',
        palette.foreground!,
      );
      const tooltipLayout = await noOverflow(page);
      await page.screenshot({
        path: `${testInfo.outputDir}/tooltip-${language}-${theme}-900x600.png`,
      });
      // Follow a real pointer trajectory so Radix can observe movement beyond its hoverable-content grace area.
      await page.mouse.move(850, 580, { steps: 8 });
      await expect(tooltip).toHaveCount(0);
      await page.locator('.floor-list button').first().click();
      await page.locator('.floor-list button').first().press('Shift+Tab');
      await expect(titleHint).toBeFocused();
      await expect(tooltip).toBeVisible();
      const tooltipKeyboard = await semantic(page, tooltip, 'backgroundRGBA', palette.foreground!);
      const tooltipTriggerFocus = await semantic(
        page,
        titleHint,
        'ringRGBA',
        `color-mix(in oklab, ${palette.ring} 50%, transparent)`,
      );
      expect(tooltipTriggerFocus.focusVisible).toBe(true);
      await titleHint.press('Escape');
      await expect(tooltip).toHaveCount(0);
      await page.getByRole('button', { name: t.wall, exact: true }).click();
      await page.getByRole('combobox', { name: t.language, exact: true }).click();
      const menu = page.getByRole('listbox');
      await expect(menu).toBeVisible();
      await expect(page.getByRole('option')).toHaveText(['English', '简体中文']);
      const menuSurface = menu.locator('xpath=..');
      await expect(menuSurface).toHaveAttribute('data-slot', 'select-content');
      const menuColor = await semantic(page, menuSurface, 'backgroundRGBA', palette.popover!);
      await semantic(page, menu, 'colorRGBA', palette['popover-foreground']!);
      expect(menuColor.portalOutsideRoot).toBe(true);
      await page.keyboard.press('ArrowUp');
      const highlighted = page.getByRole('option').and(page.locator('[data-active=true]'));
      await expect(highlighted).toHaveCount(1);
      const optionColor = await semantic(page, highlighted, 'backgroundRGBA', palette.accent!);
      await semantic(page, highlighted, 'colorRGBA', palette['accent-foreground']!);
      const portalLayout = await noOverflow(page);
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
      await page.getByRole('button', { name: t.settings, exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: t.settings, exact: true })).toBeVisible();
      const dialogColor = await semantic(page, dialog, 'backgroundRGBA', palette.background!);
      expect(dialogColor.portalOutsideRoot).toBe(true);
      const overlay = await semantic(
        page,
        page.locator('[data-slot="dialog-overlay"]'),
        'backgroundRGBA',
        palette.overlay!,
      );
      const focusTrap: boolean[] = [];
      for (let index = 0; index < 7; index++) {
        await page.keyboard.press('Tab');
        focusTrap.push(
          await dialog.evaluate((element) => element.contains(document.activeElement)),
        );
      }
      expect(focusTrap.every(Boolean)).toBe(true);
      await page.keyboard.press('Delete');
      expect(await documentOf(page)).toEqual(baseline);
      await page.getByRole('button', { name: t.close, exact: true }).click();
      await expect(dialog).toHaveCount(0);
      const input = page.getByLabel(t.length, { exact: true });
      await input.click();
      await input.press('Tab');
      await page.keyboard.press('Shift+Tab');
      // Adorned inputs own the visible border/ring on their shared group; focus stays on the native input.
      const inputSurface = input.locator('xpath=..');
      await expect(inputSurface).toHaveAttribute('data-slot', 'input-group');
      await expect(input).toBeFocused();
      await semantic(page, inputSurface, 'borderRGBA', palette.ring!);
      const validFocus = await semantic(
        page,
        inputSurface,
        'ringRGBA',
        `color-mix(in oklab, ${palette.ring} 50%, transparent)`,
      );
      expect(await input.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
      expect(validFocus.boxShadow).not.toBe('none');
      await input.fill('-');
      await input.press('Enter');
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      await semantic(page, inputSurface, 'borderRGBA', palette.destructive!);
      const invalidFocus = await semantic(
        page,
        inputSurface,
        'ringRGBA',
        `color-mix(in oklab, ${palette.destructive} ${theme === 'dark' ? 40 : 20}%, transparent)`,
      );
      expect(await input.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
      expect(invalidFocus.boxShadow).not.toBe('none');
      expect(await documentOf(page)).toEqual(baseline);
      await input.fill('0');
      await input.press('Enter');
      const alert = page.getByRole('alert');
      await expect(alert).toBeVisible();
      await expect(alert.locator('[data-slot="alert-title"]')).toHaveText(t.error);
      const errorText = (await alert.locator('[data-slot="alert-description"]').innerText()).trim();
      expect(errorText.length).toBeGreaterThan(t.dismiss.length + 8);
      expect(errorText).not.toContain('undefined');
      expect(errorText).not.toContain('wall.invalid');
      if (language === 'en') {
        expect(errorText).not.toMatch(/[\u3400-\u9fff]/);
      } else {
        expect(errorText).toMatch(/[\u3400-\u9fff]/);
      }
      const alertColor = await semantic(page, alert, 'colorRGBA', palette.destructive!);
      await semantic(page, alert, 'backgroundRGBA', palette.card!);
      const errorLayout = await noOverflow(page);
      await input.press('Escape');
      await page.getByRole('button', { name: t.dismiss, exact: true }).click();
      await expect(alert).toHaveCount(0);
      await page.getByRole('combobox', { name: t.surface, exact: true }).click();
      await expect(page.getByRole('option', { name: t.sideB, exact: true })).toBeVisible();
      await page.getByRole('option', { name: t.sideB, exact: true }).click();
      await page.getByRole('combobox', { name: t.image, exact: true }).click();
      await expect(page.getByRole('option', { name: t.plaster, exact: true })).toBeVisible();
      const materialMenuColor = await semantic(
        page,
        page.getByRole('listbox').locator('xpath=..'),
        'backgroundRGBA',
        palette.popover!,
      );
      await page.keyboard.press('Escape');
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: t.save, exact: true }).click();
      const savedFile = await download;
      await expect(page.getByRole('status')).toContainText(t.saved);
      const statusColor = await semantic(
        page,
        page.getByRole('status'),
        'colorRGBA',
        palette['muted-foreground']!,
      );
      await page.getByRole('button', { name: t.settings, exact: true }).click();
      await page.getByRole('button', { name: t.close, exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('button', { name: t.settings, exact: true })).toBeFocused();
      const projectLabel = page.locator('.project-name');
      await page.keyboard.press('Escape');
      await expect(tooltip).toHaveCount(0);
      await expect(projectLabel).toHaveText(baseline.name);
      expect(await projectLabel.getAttribute('tabindex')).toBeNull();
      expect(await projectLabel.getAttribute('title')).toBeNull();
      expect(await projectLabel.getAttribute('data-slot')).toBeNull();
      const projectDisplayStyle = await style(projectLabel);
      expect(projectDisplayStyle.cursor).toBe('default');
      expect(projectDisplayStyle.userSelect).toBe('none');
      await projectLabel.hover();
      await page.waitForTimeout(150);
      await expect(tooltip).toHaveCount(0);
      const projectHoverStyle = await style(projectLabel);
      expect(projectHoverStyle).toEqual(projectDisplayStyle);
      await projectLabel.click();
      await expect(projectLabel).not.toBeFocused();
      await page.keyboard.press('Tab');
      await expect(projectLabel).not.toBeFocused();
      const commonLayout = await noOverflow(page);
      const visibleUi = await page
        .locator('.file-actions button,.tools-bar [role="radio"],.inspector h2')
        .evaluateAll((elements) =>
          elements.map(
            (element) => element.getAttribute('aria-label') ?? element.textContent ?? '',
          ),
        );
      expect(visibleUi.join(' ')).not.toMatch(/undefined|__unknown|hint[A-Z]|settingsFailure/);
      if (language === 'en') {
        expect(visibleUi.join(' ')).not.toMatch(/[\u3400-\u9fff]/);
      } else {
        expect(visibleUi).toEqual(expect.arrayContaining(['保存', '选择', '墙体', '属性']));
      }
      expect(await documentOf(page)).toEqual(baseline);
      expect((await diagnostic(page)).rendererId).toBe(renderer);
      expect(errors).toEqual([]);
      await page.screenshot({ path: `${testInfo.outputDir}/ui-${language}-${theme}-900x600.png` });
      record(`A35 ${language}/${theme}`, {
        viewport: { width: 900, height: 600 },
        actualUiText: visibleUi,
        errorText,
        computedColors: {
          toolbar,
          sidebar,
          dialog: dialogColor,
          overlay,
          menu: menuColor,
          option: optionColor,
          materialMenu: materialMenuColor,
          disabled,
          validFocus,
          invalidFocus,
          alert: alertColor,
          status: statusColor,
          tooltipHover,
          tooltipKeyboard,
          tooltipArrow,
          tooltipTriggerFocus,
          projectDisplayStyle,
          projectHoverStyle,
        },
        focusTrap,
        layouts: {
          portal: portalLayout,
          tooltip: tooltipLayout,
          error: errorLayout,
          common: commonLayout,
        },
        tooltip: {
          customTooltipUsed,
          localizedText: t.addLevel,
          keyboardFocus: true,
          savedFileName: savedFile.suggestedFilename(),
          nativeTitleRemoved: true,
        },
        projectName: {
          displayOnly: true,
          noHoverStyleChange: true,
          noTooltip: true,
          noTabStop: true,
        },
        notifications: { toastUsed, production: 'status footer and inline error Alert' },
        errors,
      });
    });
  }
}

test('OS media changes leave explicit theme, uncommitted invalid numeric draft, keyboard focus, camera and selection unchanged', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: '可编辑示例', exact: true }).click();
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();
  await page.getByRole('button', { name: '查看整栋', exact: true }).click();
  const input = page.getByLabel('轴线长度（m）', { exact: true });
  await input.fill('-');
  const draftDoc = await documentOf(page),
    before = await diagnostic(page);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('-');
  await expect(input).toHaveAttribute('aria-invalid', 'false');
  await expect(page.getByRole('button', { name: '墙体 1', exact: true })).toHaveAttribute(
    'data-variant',
    'secondary',
  );
  const readings = [];
  for (const colorScheme of ['dark', 'light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('-');
    await expect(input).toHaveAttribute('aria-invalid', 'false');
    await expect(page.getByRole('button', { name: '墙体 1', exact: true })).toHaveAttribute(
      'data-variant',
      'secondary',
    );
    const after = await diagnostic(page);
    expect(after.rendererId).toBe(before.rendererId);
    expect(after.camera).toEqual(before.camera);
    expect(await documentOf(page)).toEqual(draftDoc);
    readings.push({
      colorScheme,
      rendererId: after.rendererId,
      camera: after.camera,
      value: await input.inputValue(),
      stillFocused: await input.evaluate((element) => element === document.activeElement),
    });
  }
  record('fixed-theme-media-uncommitted-draft', {
    scope: 'Chromium matchMedia emulation, not Windows/macOS OS theme change',
    uncommittedDraft: '-',
    noBlurOrCommitBeforeAndDuringTransitions: true,
    selection: 'Wall 1 retained',
    readings,
  });
});
