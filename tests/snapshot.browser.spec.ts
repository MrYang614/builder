import { test, expect, type Page } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { validateBytes } from 'gltf-validator';
import type { ProjectDocument } from '@building/editor-core';

type Gate = { enabled: boolean; pending: number; release: () => void };
type Instrumented = {
  __editor: { document: () => ProjectDocument };
  __snapshotGate: Gate;
};
const documentOf = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.document());
async function number(page: Page, label: string, value: string) {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(value);
  await field.press('Enter');
}

test.beforeEach(async ({ page }) => {
  // Delay real platform work; business commands, user actions and bytes stay unchanged.
  await page.addInitScript(() => {
    const waiters: (() => void)[] = [];
    const gate: Gate = {
      enabled: false,
      pending: 0,
      release: () => {
        gate.enabled = false;
        waiters.splice(0).forEach((resolve) => resolve());
      },
    };
    (window as unknown as Instrumented).__snapshotGate = gate;
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    Object.defineProperty(crypto.subtle, 'digest', {
      value: async (...args: Parameters<SubtleCrypto['digest']>) => {
        if (gate.enabled) {
          gate.pending++;
          await new Promise<void>((resolve) => waiters.push(resolve));
        }
        return digest(...args);
      },
    });
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      if (gate.enabled) {
        gate.pending++;
        waiters.push(() => toBlob.call(this, callback, type, quality));
      } else {
        toBlob.call(this, callback, type, quality);
      }
    };
  });
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Instrumented).__editor);
  await page.getByRole('button', { name: '可编辑示例', exact: true }).click();
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();
  await number(page, '高度（m）', '3.1');
});

test('a late real save keeps new edits dirty and cannot let New discard them', async ({
  page,
}, testInfo) => {
  const original = await documentOf(page);
  await page.evaluate(() => {
    (window as unknown as Instrumented).__snapshotGate.enabled = true;
  });
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as Instrumented).__snapshotGate.pending > 0);
  // The confirmation closed, but file IO has not completed; a real user edits the field.
  await number(page, '高度（m）', '3.4');
  const edited = await documentOf(page);
  expect(edited.walls[0]!.height).toBe(3.4);
  expect(edited.revision).toBeGreaterThan(original.revision);
  await page.evaluate(() => (window as unknown as Instrumented).__snapshotGate.release());
  const file = resolve(testInfo.outputDir, 'previous-revision.building');
  await (await downloaded).saveAs(file);
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
  const stored = JSON.parse(
    strFromU8(unzipSync(await readFile(file))['project.json']!),
  ) as ProjectDocument;
  expect(stored.id).toBe(original.id);
  expect(stored.revision).toBe(original.revision);
  expect(stored.walls[0]!.height).toBe(original.walls[0]!.height);
  expect(await documentOf(page)).toEqual(edited);
  await expect(page.getByTestId('dirty-state')).toHaveText('未保存修改');
  await mkdir('test-results/theme-toggle/evidence', { recursive: true });
  await writeFile(
    'test-results/theme-toggle/evidence/save-race-validation.json',
    JSON.stringify(
      {
        scope:
          'Windows Chromium browser adapter, real UI New/Save/field edit and actual ZIP download; hashing delayed to reproduce late IO, not native dialog validation',
        capturedRevision: stored.revision,
        currentRevision: edited.revision,
        storedHeight: stored.walls[0]!.height,
        currentHeight: edited.walls[0]!.height,
        newWasCancelledForNewerUnsavedChanges: true,
        dirtyPreserved: true,
      },
      null,
      2,
    ) + '\n',
  );
});

test('real export uses its captured document while later UI edits remain independent', async ({
  page,
}, testInfo) => {
  const original = await documentOf(page);
  await page.evaluate(() => {
    (window as unknown as Instrumented).__snapshotGate.enabled = true;
  });
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 GLB', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as Instrumented).__snapshotGate.pending > 0);
  await number(page, '高度（m）', '3.4');
  const edited = await documentOf(page);
  await page.evaluate(() => (window as unknown as Instrumented).__snapshotGate.release());
  const file = resolve(testInfo.outputDir, 'snapshot-before-edit.glb');
  await (await downloaded).saveAs(file);
  const bytes = await readFile(file);
  const report = await validateBytes(bytes, { uri: 'snapshot-before-edit.glb' });
  expect(report.issues.numErrors).toBe(0);
  expect(report.issues.numWarnings).toBe(0);
  const loader = `/@fs/${resolve('node_modules/three/examples/jsm/loaders/GLTFLoader.js').replaceAll('\\', '/')}`;
  const maximum = await page.evaluate(
    async ({ loader, bytes, wallId }) => {
      const { GLTFLoader } = await import(loader);
      const url = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((name) => /\/three\.js(?:\?|$)/.test(name));
      const THREE = await import(url!);
      const gltf = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
      const wall = gltf.scene.getObjectByName(`Wall_${wallId}`);
      if (!wall) {
        throw new Error('Independent loader wall missing');
      }
      return new THREE.Box3().setFromObject(wall).max.y;
    },
    { loader, bytes: [...bytes], wallId: original.walls[0]!.id },
  );
  expect(maximum).toBeCloseTo(original.walls[0]!.height, 6);
  expect(edited.walls[0]!.height).toBe(3.4);
  expect(await documentOf(page)).toEqual(edited);
  await expect(page.getByTestId('dirty-state')).toHaveText('未保存修改');
  await writeFile(
    'test-results/theme-toggle/evidence/export-race-validation.json',
    JSON.stringify(
      {
        scope:
          'Windows Chromium browser adapter, real Export/field UI and actual GLB download; canvas encoding delayed, not native file IO validation',
        capturedHeight: maximum,
        currentHeight: edited.walls[0]!.height,
        sourceAfterExportMatchesEditedDocument: true,
        validatorErrors: report.issues.numErrors,
        validatorWarnings: report.issues.numWarnings,
      },
      null,
      2,
    ) + '\n',
  );
});
