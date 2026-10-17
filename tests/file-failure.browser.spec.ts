import { evidencePath } from './evidence-path';
import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import type { ProjectDocument } from '@building/editor-core';

type Instrumented = { __editor: { document: () => ProjectDocument } };
test('real saved files with truncation, future version or corrupt images fail visibly and preserve the valid project', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Instrumented).__editor);
  await page.getByRole('button', { name: '庭院样板', exact: true }).click();
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();
  const height = page.getByLabel('高度（m）', { exact: true });
  await height.fill('3.1');
  await height.press('Enter');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const goodPath = resolve(testInfo.outputDir, '有效工程 中文.building');
  await (await downloaded).saveAs(goodPath);
  await expect(page.getByTestId('dirty-state')).toHaveText('已保存');
  const original = await page.evaluate(() =>
    (window as unknown as Instrumented).__editor.document(),
  );
  const bytes = await readFile(goodPath);
  const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  const hash = sha256(bytes);
  const future = unzipSync(bytes),
    manifest = JSON.parse(strFromU8(future['project.json']!));
  future['project.json'] = strToU8(JSON.stringify({ ...manifest, schemaVersion: 2 }));
  const corruptedImage = unzipSync(bytes),
    resourceName = Object.keys(corruptedImage).find((name) => name.startsWith('resources/'))!;
  corruptedImage[resourceName]![32] = corruptedImage[resourceName]![32]! ^ 1;
  const variants = [
    { name: '截断文件', bytes: bytes.subarray(0, 24) },
    { name: '未知版本', bytes: zipSync(future) },
    { name: '资源校验错误', bytes: zipSync(corruptedImage) },
  ];
  const errors = [];
  for (const variant of variants) {
    const path = resolve(testInfo.outputDir, `${variant.name}.building`);
    await writeFile(path, variant.bytes);
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '打开', exact: true }).click();
    await (await chooser).setFiles(path);
    await expect(page.getByRole('alert')).toBeVisible();
    const message = await page.getByRole('alert').innerText();
    expect(message).toMatch(/损坏|校验|版本/);
    expect(
      await page.evaluate(() => (window as unknown as Instrumented).__editor.document()),
    ).toEqual(original);
    await expect(page.getByTestId('dirty-state')).toHaveText('已保存');
    expect(sha256(await readFile(goodPath))).toBe(hash);
    errors.push({
      input: variant.name,
      message,
      originalDocumentPreserved: true,
      validFileHashUnchanged: true,
    });
    await page.getByRole('button', { name: '关闭提示', exact: true }).click();
  }
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await (await chooser).setFiles(goodPath);
  await expect.poll(async () => page.getByRole('status').innerText()).toMatch(/工程已打开/);
  expect(
    await page.evaluate(() => (window as unknown as Instrumented).__editor.document()),
  ).toEqual(original);
  await mkdir(evidencePath('theme-toggle/evidence'), { recursive: true });
  await writeFile(
    evidencePath('theme-toggle/evidence/file-failure-validation.json'),
    JSON.stringify(
      {
        scope:
          'Windows Chromium browser adapter; real Save/Open file UI with actual damaged/future-version/resource-corrupt ZIP files; not native permission or disk-full dialog acceptance',
        validProjectRecovered: true,
        errors,
      },
      null,
      2,
    ) + '\n',
  );
});
