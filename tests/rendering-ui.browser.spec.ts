import { choose } from './browser-controls';
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ProjectDocument } from '@building/editor-core';
import type { ThreeRuntime } from '@building/three-runtime';

type Diagnostics = ReturnType<ThreeRuntime['diagnostics']>;
type Instrumented = {
  __editor: { document(): ProjectDocument; diagnostics(): Diagnostics };
};
const snapshot = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.document());
const diagnostics = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.diagnostics());
async function idle(page: Page) {
  await page.waitForFunction(() => {
    const state = (window as unknown as Instrumented).__editor.diagnostics();
    return !state.pendingFrame && !state.render.switching && !state.render.environmentLoading;
  });
}

async function start(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Instrumented).__editor);
  await idle(page);
}
async function evidence(name: string, value: unknown, testInfo: TestInfo) {
  const json = `${JSON.stringify(value, null, 2)}\n`;
  await mkdir(resolve('test-results/theme-toggle/evidence'), { recursive: true });
  await writeFile(testInfo.outputPath(`${name}.json`), json);
  await writeFile(resolve('test-results/theme-toggle/evidence', `${name}.json`), json);
}
async function focusCycle(page: Page, expectedLabels: string[]) {
  const dialog = page.getByRole('dialog');
  const enabled = await dialog.locator('button:enabled,input:enabled').count();
  const steps: {
    tag: string;
    name: string;
    insideDialog: boolean;
    visibleInViewport: boolean;
    focusIndicator: boolean;
    bounds: { x: number; y: number; right: number; bottom: number };
    dialogScrollTop: number;
  }[] = [];
  for (let index = 0; index < enabled * 2 + 4; index++) {
    await page.keyboard.press('Tab');
    const step = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement;
      const rect = active.getBoundingClientRect();
      const style = getComputedStyle(active);
      const label =
        active instanceof HTMLInputElement ? active.labels?.[0]?.textContent : undefined;
      return {
        tag: active.tagName,
        name:
          active.getAttribute('aria-label') ?? label?.trim() ?? active.textContent?.trim() ?? '',
        insideDialog: !!active.closest('[role="dialog"]'),
        visibleInViewport:
          rect.width > 0 &&
          rect.height > 0 &&
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= innerHeight &&
          rect.right <= innerWidth,
        focusIndicator: style.outlineStyle !== 'none' || style.boxShadow !== 'none',
        bounds: { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom },
        dialogScrollTop: active.closest('[role="dialog"]')?.scrollTop ?? -1,
      };
    });
    expect(step.insideDialog).toBe(true);
    expect(step.visibleInViewport, JSON.stringify(step)).toBe(true);
    expect(step.focusIndicator).toBe(true);
    steps.push(step);
  }
  for (const label of expectedLabels) {
    expect(
      steps.some((step) => step.name === label),
      `Keyboard reaches ${label}`,
    ).toBe(true);
  }
  return steps;
}

test('render settings remain localized focusable and contained in four language theme combinations and a 900x600 viewport', async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await start(page);
  const document = await snapshot(page);
  const initial = await diagnostics(page);
  const screenshotDirectory = testInfo.outputPath('screenshots');
  await mkdir(screenshotDirectory, { recursive: true });
  const variants: {
    language: string;
    theme: string;
    screenshot: string;
    focus: Awaited<ReturnType<typeof focusCycle>>;
  }[] = [];
  for (const language of ['zh-CN', 'en'] as const) {
    if (language === 'en') {
      await choose(page, '语言', 'English');
    }
    const labels =
      language === 'en'
        ? {
            appearance: 'Appearance',
            light: 'Light',
            dark: 'Dark',
            language: 'Language',
            backend: 'Real-time renderer',
            samples: 'Target samples',
            intensity: 'Environment intensity',
            rotation: 'Environment rotation (°)',
            background: 'Show panorama as background',
            import: 'Import panorama',
            start: 'Start path tracing',
            close: 'Close',
            settings: 'Settings',
          }
        : {
            appearance: '外观',
            light: '亮色',
            dark: '暗色',
            language: '语言',
            backend: '实时渲染器',
            samples: '目标采样数',
            intensity: '环境强度',
            rotation: '环境旋转（°）',
            background: '将全景显示为背景',
            import: '导入全景贴图',
            start: '开始光追',
            close: '关闭',
            settings: '设置',
          };
    for (const theme of ['light', 'dark'] as const) {
      await choose(page, labels.appearance, labels[theme]);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await expect(page.getByRole('combobox', { name: labels.backend, exact: true })).toHaveText(
        'WebGL',
      );
      await page.getByRole('button', { name: labels.settings, exact: true }).click();
      await expect(page.getByRole('combobox', { name: labels.samples, exact: true })).toHaveText(
        '128',
      );
      await expect(page.getByLabel(labels.intensity, { exact: true })).toBeVisible();
      await expect(page.getByLabel(labels.rotation, { exact: true })).toBeVisible();
      await expect(
        page.getByRole('checkbox', { name: labels.background, exact: true }),
      ).toBeVisible();
      const focus = await focusCycle(page, [
        labels.samples,
        labels.intensity,
        labels.rotation,
        labels.background,
        labels.import,
        labels.start,
        labels.close,
      ]);
      // Focus the first remaining setting to scroll the modal's beginning into view.
      await page.getByRole('combobox', { name: labels.samples, exact: true }).focus();
      const name = `render-settings-${language === 'en' ? 'en' : 'zh'}-${theme}.png`;
      await page.screenshot({ path: resolve(screenshotDirectory, name) });
      variants.push({ language, theme, screenshot: resolve(screenshotDirectory, name), focus });
      await page.getByRole('button', { name: labels.close, exact: true }).click();
      await idle(page);
      const current = await diagnostics(page);
      expect(current.sceneId).toBe(initial.sceneId);
      expect(current.cameraId).toBe(initial.cameraId);
      expect(current.rendererId).toBe(initial.rendererId);
      expect(current.camera).toEqual(initial.camera);
      expect(await snapshot(page)).toEqual(document);
    }
  }
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.setViewportSize({ width: 900, height: 600 });
  // Observe the responsive layout on both real frames after the CDP resize;
  // do not retry the operation or relax containment when geometry is clipped.
  const resizeFrames = await page.evaluate(async () => {
    const sample = () => {
      const element = globalThis.document.querySelector('[role="dialog"]')!;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        innerHeight,
        visualViewportHeight: visualViewport?.height ?? null,
        maxHeight: style.maxHeight,
        height: rect.height,
        y: rect.y,
        bottom: rect.bottom,
        transitionProperty: style.transitionProperty,
        transitionDuration: style.transitionDuration,
      };
    };
    const frames = [sample()];
    for (let index = 0; index < 2; index++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      frames.push(sample());
    }
    return frames;
  });
  await writeFile(
    testInfo.outputPath('responsive-resize-frames.json'),
    JSON.stringify(resizeFrames, null, 2),
  );
  const dialog = page.getByRole('dialog');
  const layout = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      bounds: {
        x: rect.x,
        y: rect.y,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      pageWidth: globalThis.document.documentElement.clientWidth,
      pageScrollWidth: globalThis.document.documentElement.scrollWidth,
      viewport: { width: innerWidth, height: innerHeight },
      computedMaxHeight: getComputedStyle(element).maxHeight,
      rootClientHeight: globalThis.document.documentElement.clientHeight,
      visualViewportHeight: visualViewport?.height ?? null,
    };
  });
  expect(layout.bounds.x).toBeGreaterThanOrEqual(0);
  expect(layout.bounds.y, JSON.stringify({ layout, resizeFrames })).toBeGreaterThanOrEqual(0);
  expect(layout.bounds.right).toBeLessThanOrEqual(900);
  expect(layout.bounds.bottom).toBeLessThanOrEqual(600);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
  expect(layout.pageScrollWidth).toBeLessThanOrEqual(layout.pageWidth + 1);
  expect(layout.scrollHeight).toBeGreaterThanOrEqual(layout.clientHeight);
  const compactFocus = await focusCycle(page, [
    'Environment intensity',
    'Environment rotation (°)',
    'Show panorama as background',
    'Close',
  ]);
  await page.getByRole('combobox', { name: 'Target samples', exact: true }).focus();
  await page.screenshot({
    path: resolve(screenshotDirectory, 'render-settings-en-dark-900x600.png'),
  });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await snapshot(page)).toEqual(document);
  await evidence(
    'rendering-ui-validation',
    {
      measuredAt: new Date().toISOString(),
      scope:
        'Actual browser Settings dialog, keyboard Tab paths and viewport screenshots; no native desktop or WebGPU hardware claim',
      variants,
      compact: { ...layout, resizeFrames, focus: compactFocus },
      unchangedDocument: true,
      unchangedSceneCameraRenderer: true,
    },
    testInfo,
  );
});

test('invalid environment values and corrupt HDR show one visible error inside the settings dialog while preserving project data', async ({
  page,
}, testInfo) => {
  await start(page);
  const document = await snapshot(page);
  const initial = await diagnostics(page);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const input = page.getByLabel('环境强度', { exact: true });
  await input.fill('11');
  await input.press('Enter');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByRole('alert')).toHaveText(
    '环境强度须为 0–10，旋转须为 0–360°。原设置已保留。',
  );
  await expect(page.getByRole('alert')).toHaveCount(1);
  expect(await snapshot(page)).toEqual(document);
  await input.press('Escape');
  await expect(input).toHaveValue('1');
  const rotation = page.getByLabel('环境旋转（°）', { exact: true });
  await rotation.fill('-1');
  await rotation.press('Enter');
  await expect(rotation).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByRole('alert')).toBeVisible();
  expect(await snapshot(page)).toEqual(document);
  await rotation.press('Escape');
  await expect(rotation).toHaveValue('0');
  // Deliberately truncated Radiance bytes exercise the actual file chooser/decode failure.
  // This is an invalid-file fixture, never represented as a successfully loaded environment.
  const corrupt = testInfo.outputPath('corrupt-panorama.hdr');
  await writeFile(corrupt, '#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 16 +X 32\n');
  const fileChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '导入全景贴图', exact: true }).click();
  await (await fileChooser).setFiles(corrupt);
  await expect(dialog.getByRole('alert')).toHaveText(
    '请选择有效的等距柱状 HDR、EXR、PNG 或 JPEG 全景贴图。',
  );
  await expect(page.getByRole('alert')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '导入全景贴图', exact: true })).toBeEnabled();
  await idle(page);
  expect(await snapshot(page)).toEqual(document);
  const current = await diagnostics(page);
  expect(current.resources).toEqual(initial.resources);
  expect(current.environment.textureId).toBeNull();
  expect(current.sceneId).toBe(initial.sceneId);
  await page.screenshot({ path: testInfo.outputPath('corrupt-hdr-visible-inside-dialog.png') });
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await choose(page, '语言', 'English');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText(
    'Choose a valid equirectangular HDR, EXR, PNG or JPEG panorama.',
  );
  await expect(page.getByRole('alert')).toHaveCount(1);
  expect(await snapshot(page)).toEqual(document);
  await evidence(
    'rendering-errors-validation',
    {
      measuredAt: new Date().toISOString(),
      rejectedIntensity: 11,
      rejectedRotation: -1,
      numericAriaInvalid: true,
      corruptRadianceRejected: true,
      errorInsideDialog: true,
      errorLocalizedInBothLanguages: true,
      visibleAlertCount: 1,
      unchangedDocument: true,
      unchangedResources: true,
    },
    testInfo,
  );
});

test('saved WebGPU preference starts with the actual backend and an unsupported device can explicitly save its working WebGL fallback', async ({
  page,
}, testInfo) => {
  // This seeds a real persisted user preference, not GPU capability or editor commands.
  // A marker prevents the initialization script from overriding the subsequent UI save.
  await page.addInitScript(() => {
    if (!localStorage.getItem('render-settings-startup-test-seeded')) {
      localStorage.setItem(
        'building-editor.settings.v1',
        JSON.stringify({ themeMode: 'light', language: 'zh-CN', rendererBackend: 'webgpu' }),
      );
      localStorage.setItem('render-settings-startup-test-seeded', 'true');
    }
  });
  await start(page);
  const document = await snapshot(page);
  const started = await diagnostics(page);
  const capability = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    return { gpuAPI: !!navigator.gpu, adapter: !!adapter };
  });
  const dialog = page.getByRole('dialog');
  let branch: string;
  if (started.actualBackend === 'webgpu') {
    branch = 'Actual WebGPU adapter initialized; the UI then switches to and persists WebGL.';
    expect(capability.adapter).toBe(true);
    await choose(page, '实时渲染器', 'WebGL');
    await idle(page);
  } else {
    branch =
      'Actual unsupported WebGPU startup falls back to WebGL; user explicitly saves the current working backend.';
    expect(started.actualBackend).toBe('webgl');
    expect(started.render.backend).toBe('webgl');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('此设备无法启动 WebGPU，原渲染器仍可使用。');
    await expect(page.getByRole('alert')).toHaveCount(1);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await choose(page, '实时渲染器', '使用并保存当前 WebGL 渲染器');
    await idle(page);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('combobox', { name: '实时渲染器', exact: true }).click();
    await expect(
      page.getByRole('option', { name: '使用并保存当前 WebGL 渲染器', exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
  }
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('building-editor.settings.v1') ?? 'null')
            ?.rendererBackend,
      ),
    )
    .toBe('webgl');
  expect(await snapshot(page)).toEqual(document);
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as Instrumented).__editor);
  await idle(page);
  const restarted = await diagnostics(page);
  expect(restarted.actualBackend).toBe('webgl');
  expect(restarted.render.backend).toBe('webgl');
  expect(restarted.render.error).toBeUndefined();
  await expect(page.getByRole('combobox', { name: '实时渲染器', exact: true })).toHaveText('WebGL');
  await page.getByRole('combobox', { name: '实时渲染器', exact: true }).click();
  await expect(
    page.getByRole('option', { name: '使用并保存当前 WebGL 渲染器', exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);
  await evidence(
    'rendering-startup-preference-validation',
    {
      measuredAt: new Date().toISOString(),
      capability,
      branch,
      startupActualBackend: started.actualBackend,
      savedPreference: 'webgl',
      restartActualBackend: restarted.actualBackend,
      settingsReopenedAndRestored: true,
      limitation:
        started.actualBackend === 'webgpu'
          ? null
          : 'WebGPU rendering on a physical supported adapter remains unverified; this test validates the actual unsupported-device fallback.',
    },
    testInfo,
  );
});
