import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function storageSnapshot(page: Page) {
  return page.evaluate(async () => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
    databases: (await indexedDB.databases()).map((database) => database.name).sort(),
  }));
}

for (const scenario of [
  { id: 'input-input--default', name: 'Default', disabled: false },
  { id: 'input-input--disabled', name: 'Disabled', disabled: true },
]) {
  test(`manager reload and real story re-entry discard drafts and restore ${scenario.name} initial args`, async ({
    page,
  }, testInfo) => {
    await page.goto(`/?path=/story/${scenario.id}`);
    const frame = page.frameLocator('#storybook-preview-iframe');
    const codeEditor = frame.getByLabel('Editable TSX code');
    const configEditor = frame.getByLabel('Editable JSON configuration');
    const field = frame.getByTestId('preview-stage').getByLabel('Controlled name / 名称');
    await expect(frame.getByText('Current code and configuration', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: /Controls/ }).click();
    const disabledRow = page
      .getByRole('row')
      .filter({ has: page.getByText('disabled', { exact: true }) });
    const control = disabledRow.getByRole('switch');
    const sourceBaseline = await codeEditor.inputValue();
    const configBaseline = JSON.parse(await configEditor.inputValue()) as Record<string, unknown>;
    expect(configBaseline.disabled).toBe(scenario.disabled);
    expect(configBaseline.size).toBe('md');
    await expect(control).toBeChecked({ checked: scenario.disabled });
    const storageBefore = await storageSnapshot(page);
    const draft = `${sourceBaseline}\n// temporary manager draft`;
    const temporary = { ...configBaseline, size: 'lg', disabled: !scenario.disabled };
    await codeEditor.fill(draft);
    await configEditor.fill(JSON.stringify(temporary));
    await expect(field).toBeEnabled({ enabled: scenario.disabled });
    await expect(control).toBeChecked({ checked: !scenario.disabled });
    await expect(codeEditor).toHaveValue(draft);
    expect(await storageSnapshot(page)).toEqual(storageBefore);
    await frame.getByRole('button', { name: 'Reset example' }).click();
    await expect(codeEditor).toHaveValue(sourceBaseline);
    await expect
      .poll(async () => JSON.parse(await configEditor.inputValue()))
      .toEqual(configBaseline);
    await expect(field).toBeEnabled({ enabled: !scenario.disabled });
    await expect(control).toBeChecked({ checked: scenario.disabled });
    await codeEditor.fill(draft);
    await configEditor.fill(JSON.stringify(temporary));
    await expect(field).toBeEnabled({ enabled: scenario.disabled });
    await page.reload();
    await expect(frame.getByText('Current code and configuration', { exact: true })).toBeVisible();
    await expect(codeEditor).toHaveValue(sourceBaseline);
    await expect
      .poll(async () => JSON.parse(await configEditor.inputValue()))
      .toEqual(configBaseline);
    await expect(field).toBeEnabled({ enabled: !scenario.disabled });
    await expect(control).toBeChecked({ checked: scenario.disabled });
    await codeEditor.fill(draft);
    await configEditor.fill(JSON.stringify(temporary));
    await expect(field).toBeEnabled({ enabled: scenario.disabled });
    await page.getByRole('link', { name: 'Large', exact: true }).click();
    await expect(frame.locator('.workbench')).toHaveAttribute(
      'data-baseline-config',
      JSON.stringify({ ...configBaseline, disabled: false, size: 'lg' }, null, 2),
    );
    await expect
      .poll(async () => JSON.parse(await configEditor.inputValue()))
      .toEqual({ ...configBaseline, disabled: false, size: 'lg' });
    await page.getByRole('link', { name: scenario.name, exact: true }).click();
    await expect(codeEditor).toHaveValue(sourceBaseline);
    await expect
      .poll(async () => JSON.parse(await configEditor.inputValue()))
      .toEqual(configBaseline);
    await expect(field).toBeEnabled({ enabled: !scenario.disabled });
    await expect(control).toBeChecked({ checked: scenario.disabled });
    await page.screenshot({
      path: testInfo.outputPath('manager-baseline-restored.png'),
      fullPage: true,
    });
  });
}
