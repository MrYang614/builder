import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const evidence = resolve('test-results/ui-foundation-2026-10-13/screenshots');
const storyUrl = (id: string) => `/iframe.html?id=${id}&viewMode=story`;

async function openInput(page: Page) {
  await page.goto(storyUrl('input-input--default'));
  await expect(page.getByLabel('Editable TSX code')).toBeVisible();
  await expect(page.getByText('Current code and configuration', { exact: true })).toBeVisible();
  await expect(page.getByTestId('preview-stage').getByLabel('Controlled name / 名称')).toHaveValue(
    '庭院 Courtyard',
  );
}

async function screenshot(page: Page, name: string) {
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: resolve(evidence, `${name}.png`), fullPage: true });
}

test('code and JSON drafts apply, fail independently, recover, reset and remain in page memory', async ({
  page,
}) => {
  await openInput(page);
  const sourcePath = resolve('apps/storybook/src/examples/input.example.tsx');
  const configPath = resolve('apps/storybook/src/config/input.json');
  const originalSource = await readFile(sourcePath);
  const originalConfig = await readFile(configPath);
  const storageBefore = await page.evaluate(async () => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
    databases: (await indexedDB.databases()).map((database) => database.name).sort(),
  }));
  const codeEditor = page.getByLabel('Editable TSX code');
  const configEditor = page.getByLabel('Editable JSON configuration');
  const codeBaseline = await codeEditor.inputValue();
  const configBaseline = JSON.parse(await configEditor.inputValue()) as Record<string, unknown>;
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy code', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
  const draftCode = `import { useState } from 'react';
import { Button, Form, Input } from '@building/ui';
import { Save } from 'lucide-react';
type PreviewProps = { placeholder?: string; disabled?: boolean };
export default function Example(args: PreviewProps) {
  const [count, setCount] = useState<number>(0);
  return <Form.Group><Input {...args} aria-label="Browser draft" defaultValue="Temporary" />
    <Input.Password aria-label="Composed password" defaultValue="preview" />
    <Button icon={Save} onClick={() => setCount((value) => value + 1)}>Clicked {count}</Button>
  </Form.Group>;
}`;
  await codeEditor.fill(draftCode);
  await expect(page.getByRole('button', { name: 'Copy code', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toHaveCount(0);
  await page.getByTestId('preview-stage').getByRole('button', { name: 'Clicked 0' }).click();
  await expect(
    page.getByTestId('preview-stage').getByRole('button', { name: 'Clicked 1' }),
  ).toBeVisible();
  await configEditor.fill(
    JSON.stringify({ ...configBaseline, placeholder: '配置已生效', disabled: true }),
  );
  await expect(page.getByTestId('preview-stage').getByLabel('Browser draft')).toBeDisabled();
  await expect(
    page.getByTestId('preview-stage').getByRole('button', { name: 'Clicked 1' }),
  ).toBeVisible();
  await expect(page.getByTestId('preview-stage').getByLabel('Browser draft')).toHaveAttribute(
    'placeholder',
    '配置已生效',
  );
  await screenshot(page, 'code-and-configuration');

  await codeEditor.fill('export default function Example() { return <Input ; }');
  await expect(page.getByRole('alert')).toContainText('Code compilation error');
  await expect(
    page.getByText('Last valid preview · pending corrections', { exact: true }),
  ).toBeVisible();
  await screenshot(page, 'compile-error');
  await codeEditor.fill(draftCode);
  await expect(page.getByText('Code compilation error', { exact: true })).toHaveCount(0);
  await configEditor.fill('{');
  await expect(page.getByRole('alert')).toContainText('Configuration error');
  await configEditor.fill(JSON.stringify({ ...configBaseline, disabled: 'invalid' }));
  await expect(page.getByRole('alert')).toContainText('config.disabled must be boolean');
  await screenshot(page, 'configuration-error');
  await configEditor.fill(JSON.stringify({ ...configBaseline, disabled: false }));
  await expect(page.getByTestId('preview-stage').getByLabel('Browser draft')).toBeEnabled();
  await expect(page.getByText('Configuration error', { exact: true })).toHaveCount(0);
  await codeEditor.fill(
    `export default function Example() { throw new Error('Preview-only render failure'); }`,
  );
  await expect(page.getByRole('alert')).toContainText('Runtime error');
  await expect(page.getByRole('alert')).toContainText('Preview-only render failure');
  await screenshot(page, 'runtime-error');
  await codeEditor.fill(draftCode);
  await expect(page.getByTestId('preview-stage').getByLabel('Browser draft')).toBeVisible();
  await expect(page.getByText('Runtime error', { exact: true })).toHaveCount(0);
  await screenshot(page, 'error-recovery');

  expect(await readFile(sourcePath)).toEqual(originalSource);
  expect(await readFile(configPath)).toEqual(originalConfig);
  expect(
    await page.evaluate(async () => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
      databases: (await indexedDB.databases()).map((database) => database.name).sort(),
    })),
  ).toEqual(storageBefore);
  await page.getByRole('button', { name: 'Reset example' }).click();
  await expect(codeEditor).toHaveValue(codeBaseline);
  await expect(configEditor).toHaveValue(JSON.stringify(configBaseline, null, 2));
  await codeEditor.fill(draftCode);
  await expect(page.getByTestId('preview-stage').getByLabel('Browser draft')).toBeVisible();
  await page.reload();
  await expect(codeEditor).toHaveValue(codeBaseline);
  await expect(page.getByTestId('preview-stage').getByLabel('Controlled name / 名称')).toHaveValue(
    '庭院 Courtyard',
  );
});

test('Storybook Controls and JSON editor update the same applied configuration', async ({
  page,
}) => {
  await page.goto('/?path=/story/input-input--default');
  const frame = page.frameLocator('#storybook-preview-iframe');
  await expect(frame.getByLabel('Editable JSON configuration')).toBeVisible();
  await page.getByRole('tab', { name: /Controls/ }).click();
  const disabledRow = page
    .getByRole('row')
    .filter({ has: page.getByText('disabled', { exact: true }) });
  await disabledRow.getByText('True', { exact: true }).click();
  await expect(
    frame.getByTestId('preview-stage').getByLabel('Controlled name / 名称'),
  ).toBeDisabled();
  const configEditor = frame.getByLabel('Editable JSON configuration');
  const args = JSON.parse(await configEditor.inputValue()) as Record<string, unknown>;
  expect(args.disabled).toBe(true);
  await configEditor.fill(JSON.stringify({ ...args, disabled: false, size: 'lg' }));
  await expect(
    frame.getByTestId('preview-stage').getByLabel('Controlled name / 名称'),
  ).toBeEnabled();
  await expect(disabledRow.getByRole('switch')).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Update story', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create new story', exact: true })).toHaveCount(0);
  await screenshot(page, 'storybook-controls');
});

test('reset restores baseline component state without code or configuration edits', async ({
  page,
}) => {
  await openInput(page);
  const code = await page.getByLabel('Editable TSX code').inputValue();
  const config = await page.getByLabel('Editable JSON configuration').inputValue();
  const field = page.getByTestId('preview-stage').getByLabel('Controlled name / 名称');
  await field.fill('User-edited baseline value');
  await expect(field).toHaveValue('User-edited baseline value');
  await expect(
    page.getByTestId('preview-stage').getByText('Current value: User-edited baseline value'),
  ).toBeVisible();
  await expect(page.getByLabel('Editable TSX code')).toHaveValue(code);
  await expect(page.getByLabel('Editable JSON configuration')).toHaveValue(config);
  await page.getByRole('button', { name: 'Reset example' }).click();
  await expect(field).toHaveValue('庭院 Courtyard');
  await expect(
    page.getByTestId('preview-stage').getByText('Current value: 庭院 Courtyard'),
  ).toBeVisible();
  await expect(page.getByLabel('Editable TSX code')).toHaveValue(code);
  await expect(page.getByLabel('Editable JSON configuration')).toHaveValue(config);
});

test('props documentation separates component defaults from scenario baselines without duplicate props', async ({
  page,
}) => {
  for (const entry of [
    {
      story: 'overlays-dialog',
      prop: 'title',
      component: 'Required',
      baseline: '"Project settings / 项目设置"',
    },
    { story: 'overlays-tooltip', prop: 'delayDuration', component: '250', baseline: '150' },
    { story: 'feedback-progress', prop: 'value', component: 'null', baseline: '45' },
    { story: 'input-input-number', prop: 'step', component: 'Not set', baseline: '0.1' },
  ]) {
    await page.goto(storyUrl(`${entry.story}--default`));
    await expect(page.getByText('Current code and configuration', { exact: true })).toBeVisible();
    const row = page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: entry.prop, exact: true }) });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole('cell').nth(2)).toHaveText(entry.component);
    await expect(row.getByRole('cell').nth(3)).toHaveText(entry.baseline);
  }
  await page.goto(storyUrl('input-select--default'));
  await expect(page.getByText('Current code and configuration', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'options', exact: true }) }),
  ).toHaveCount(1);
});

test('local component, example and configuration HMR preserve browser drafts and refresh reset baselines', async ({
  page,
}, testInfo) => {
  await openInput(page);
  const sourcePath = resolve('apps/storybook/src/examples/input.example.tsx');
  const configPath = resolve('apps/storybook/src/config/input.json');
  const componentPath = resolve('packages/ui/src/components/input.tsx');
  const originals = await Promise.all(
    [sourcePath, configPath, componentPath].map((path) => readFile(path)),
  );
  await mkdir(testInfo.outputPath('originals'), { recursive: true });
  await Promise.all(
    ['input.example.tsx', 'input.json', 'input.tsx'].map((name, index) =>
      writeFile(testInfo.outputPath('originals', name), originals[index]!),
    ),
  );
  const editor = page.getByLabel('Editable TSX code');
  const localDraft = (await editor.inputValue()).replace('Current value:', 'Browser draft value:');
  await editor.fill(localDraft);
  await expect(
    page.getByTestId('preview-stage').getByText('Browser draft value: 庭院 Courtyard'),
  ).toBeVisible();
  try {
    const component = originals[2]!.toString('utf8');
    const marker = 'data-foundation-hmr="component-updated"';
    const changed = component.replace('<InputControl', `<InputControl ${marker}`);
    expect(changed).not.toBe(component);
    await writeFile(componentPath, changed);
    await expect(
      page.getByTestId('preview-stage').locator('[data-foundation-hmr="component-updated"]'),
    ).toHaveCount(2);
    await expect(editor).toHaveValue(localDraft);
    await writeFile(
      sourcePath,
      originals[0]!.toString('utf8').replace('Current value:', 'Local baseline value:'),
    );
    await expect(page.getByText('Local baseline updated', { exact: true })).toBeVisible();
    await expect(editor).toHaveValue(localDraft);
    const config = JSON.parse(originals[1]!.toString('utf8')) as Record<string, unknown>;
    const updatedConfig = { ...config, placeholder: 'Local HMR configuration' };
    await writeFile(configPath, JSON.stringify(updatedConfig, null, 2) + '\n');
    await expect(page.locator('.workbench')).toHaveAttribute(
      'data-baseline-config',
      JSON.stringify(updatedConfig, null, 2),
    );
    await expect(editor).toHaveValue(localDraft);
    await page.getByRole('button', { name: 'Reset example' }).click();
    await expect(
      page.getByTestId('preview-stage').getByText('Local baseline value: 庭院 Courtyard'),
    ).toBeVisible();
    await expect(
      page.getByTestId('preview-stage').getByLabel('Controlled name / 名称'),
    ).toHaveAttribute('placeholder', 'Local HMR configuration');
    await screenshot(page, 'hmr-updated-baseline');
  } finally {
    await Promise.all(
      [sourcePath, configPath, componentPath].map((path, index) =>
        writeFile(path, originals[index]!),
      ),
    );
    await expect(page.locator('.workbench')).toHaveAttribute(
      'data-baseline-config',
      JSON.stringify(JSON.parse(originals[1]!.toString('utf8')), null, 2),
    );
  }
  await page.getByRole('button', { name: 'Reset example' }).click();
  await expect(
    page.getByTestId('preview-stage').getByLabel('Controlled name / 名称'),
  ).toHaveAttribute('placeholder', 'Name / 名称');
  await expect(page.getByTestId('preview-stage').locator('[data-foundation-hmr]')).toHaveCount(0);
  expect(await readFile(sourcePath)).toEqual(originals[0]);
  expect(await readFile(configPath)).toEqual(originals[1]);
  expect(await readFile(componentPath)).toEqual(originals[2]);
});
