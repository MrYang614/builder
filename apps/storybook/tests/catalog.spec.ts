import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';

type StoryEntry = { id: string; type: 'story' | 'docs'; title: string; name: string };
type StoryIndex = { entries: Record<string, StoryEntry> };
const storyDirectory = resolve('apps/storybook/src/stories');
const families = readdirSync(storyDirectory)
  .filter((file) => file.endsWith('.stories.tsx') && file !== 'overview.stories.tsx')
  .map((file) => {
    const source = readFileSync(resolve(storyDirectory, file), 'utf8');
    const id = source.match(/\bid:\s*'([^']+)'/)?.[1];
    if (!id) {
      throw new Error(`No stable Storybook ID in ${file}`);
    }
    return id;
  });

async function capture(page: Page, name: string) {
  const directory = resolve('test-results/ui-foundation-2026-10-13/screenshots');
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: resolve(directory, `${name}.png`), fullPage: true });
}

test('directory exposes every requested family and real props documentation', async ({
  page,
  request,
}) => {
  const response = await request.get('/index.json');
  const index = (await response.json()) as StoryIndex;
  expect(families).toHaveLength(35);
  const entries = Object.values(index.entries).filter((entry) => entry.type === 'story');
  expect(entries.length).toBeGreaterThan(250);
  for (const family of families) {
    expect(index.entries[`${family}--default`]).toBeDefined();
    expect(index.entries[`${family}--dark`]).toBeDefined();
    expect(index.entries[`${family}--narrow`]).toBeDefined();
  }
  await page.goto('/?path=/story/overview-component-directory--directory');
  const frame = page.frameLocator('#storybook-preview-iframe');
  await expect(
    frame.getByRole('heading', { name: 'Building UI component workshop' }),
  ).toBeVisible();
  await expect(frame.getByRole('link')).toHaveCount(35);
  await capture(page, 'component-directory');
  await page.goto('/?path=/docs/input-input--docs');
  await expect(frame.getByText('Input', { exact: true }).first()).toBeVisible();
  await expect(frame.getByText('onValueChange', { exact: false }).first()).toBeVisible();
  await capture(page, 'props-documentation');
});

for (const family of families) {
  test(`all ${family} stories render the shared implementation`, async ({ page, request }) => {
    const index = (await (await request.get('/index.json')).json()) as StoryIndex;
    const entries = Object.values(index.entries).filter(
      (entry) => entry.type === 'story' && entry.id.startsWith(`${family}--`),
    );
    expect(entries.length).toBeGreaterThanOrEqual(4);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const entry of entries) {
      await page.goto(`/iframe.html?id=${entry.id}&viewMode=story`);
      await expect(page.getByTestId('preview-stage'), entry.id).toBeVisible();
      await expect(
        page.getByText('Current code and configuration', { exact: true }),
        entry.id,
      ).toBeVisible();
      await expect(page.getByText('Code compilation error', { exact: true }), entry.id).toHaveCount(
        0,
      );
      await expect(page.getByText('Configuration error', { exact: true }), entry.id).toHaveCount(0);
      await expect(page.getByText('Runtime error', { exact: true }), entry.id).toHaveCount(0);
      const source = await page.getByLabel('Editable TSX code').inputValue();
      expect(source).toContain('@building/ui');
    }
    expect(errors).toEqual([]);
  });
}

for (const { id, name } of [
  { id: 'input-input--default', name: 'input-light' },
  { id: 'input-input--dark', name: 'input-dark' },
  { id: 'input-input--error', name: 'input-error-state' },
  { id: 'input-input-password--default', name: 'password' },
  { id: 'input-input-text-area--default', name: 'textarea' },
  { id: 'actions-button--loading', name: 'button-loading' },
  { id: 'feedback-alert--dark', name: 'feedback-dark' },
]) {
  test(`visual capture ${name}`, async ({ page }) => {
    await page.goto(`/iframe.html?id=${id}&viewMode=story`);
    await expect(page.getByText('Current code and configuration', { exact: true })).toBeVisible();
    await expect(page.getByTestId('preview-stage')).toBeVisible();
    await capture(page, name);
  });
}

test('narrow CJK layout and positioned overlays remain within the preview viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await page.goto('/iframe.html?id=input-select--narrow&viewMode=story');
  await expect(page.getByText('Current code and configuration', { exact: true })).toBeVisible();
  await page.getByTestId('preview-stage').getByRole('combobox').first().click();
  await expect(page.getByRole('listbox')).toBeVisible();
  const bounds = await page.getByRole('listbox').boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(420);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, 'select-narrow-overlay');
  await page.keyboard.press('Escape');
  await page.goto('/iframe.html?id=overlays-dialog--dark&viewMode=story');
  await expect(page.getByText('Current code and configuration', { exact: true })).toBeVisible();
  await page.getByTestId('preview-stage').getByRole('button').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await capture(page, 'dialog-dark-narrow');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('committed examples and JSON configs match the independent browser preview baselines', async ({
  page,
}) => {
  const code = await readFile(resolve('apps/storybook/src/examples/input.example.tsx'), 'utf8');
  const config = JSON.parse(
    await readFile(resolve('apps/storybook/src/config/input.json'), 'utf8'),
  ) as unknown;
  await page.goto('/iframe.html?id=input-input--default&viewMode=story');
  await expect(page.getByLabel('Editable TSX code')).toHaveValue(code);
  expect(JSON.parse(await page.getByLabel('Editable JSON configuration').inputValue())).toEqual(
    config,
  );
});
