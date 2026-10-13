import { expect, type Page } from '@playwright/test';
import { choose } from './browser-controls';

/** Uses the same localized viewport entry and Dialog as a user configuring progressive rendering. */
export async function openRenderDialog(page: Page) {
  const english = (await page.locator('html').getAttribute('lang')) === 'en';
  const dialog = page.getByRole('dialog');
  if (!(await dialog.isVisible())) {
    await page
      .getByRole('button', {
        name: english ? 'Real-time rendering' : '实时渲染',
        exact: true,
      })
      .click();
  }
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('combobox', {
      name: english ? 'Target samples' : '目标采样数',
      exact: true,
    }),
  ).toBeVisible();
  return english;
}

/** Configures through the render Dialog and clicks the explicit start action, including failure retry. */
export async function startPathTracing(page: Page, samples?: number) {
  const english = await openRenderDialog(page);
  if (samples !== undefined) {
    await choose(page, english ? 'Target samples' : '目标采样数', String(samples));
  }
  await page
    .getByRole('dialog')
    .getByRole('button', { name: english ? 'Start path tracing' : '开始光追', exact: true })
    .click();
}
