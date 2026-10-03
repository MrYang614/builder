import { expect, type Page } from '@playwright/test';

/** Theme is a direct toggle; the remaining editor choices use real Select menus. */
export async function choose(page: Page, label: string, value: string) {
  if (label === 'Appearance' || label === '外观') {
    const target =
      value === 'Dark' || value === '暗色'
        ? 'dark'
        : value === 'Light' || value === '亮色'
          ? 'light'
          : null;
    if (!target) {
      throw new Error(`Unsupported theme choice: ${value}`);
    }
    const button = page.getByRole('button', { name: label, exact: true });
    await expect(button).toBeVisible();
    if ((await page.locator('html').getAttribute('data-theme')) !== target) {
      await button.click();
    }
    await expect(page.locator('html')).toHaveAttribute('data-theme', target);
    return;
  }
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: value, exact: true }).click();
}
