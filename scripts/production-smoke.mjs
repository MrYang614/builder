import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { validateBytes } from 'gltf-validator';

const root = resolve('apps/desktop/dist');
const output = resolve(
  process.env.BUILDING_EVIDENCE_ROOT ?? '.test-artifacts',
  'theme-toggle/production',
);
await mkdir(output, { recursive: true });
const contentTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(root + sep)) {
      throw new Error('outside root');
    }
    res.writeHead(200, {
      'Content-Type': contentTypes[extname(path)] ?? 'application/octet-stream',
    });
    res.end(await readFile(path));
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const browser = await chromium.launch({
  args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const results = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${address.port}`);
  await page.locator('canvas').waitFor();
  if ((await page.locator('canvas').count()) !== 1) {
    throw new Error('Expected one production Canvas');
  }
  if (await page.evaluate(() => '__editor' in window)) {
    throw new Error('Dev instrument leaked into production');
  }
  await page.getByRole('button', { name: '可编辑示例', exact: true }).click();
  const runtimeId = await page.locator('canvas').getAttribute('data-runtime-id');
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();
  await page.screenshot({ path: resolve(output, 'production-light-zh.png') });
  results.push({
    name: 'Actual production assets create editable example and one Canvas without dev instrument',
    status: 'passed',
  });
  async function choose(label, value) {
    if (label === '外观' || label === 'Appearance') {
      const target = value === '暗色' || value === 'Dark' ? 'dark' : 'light';
      if ((await page.locator('html').getAttribute('data-theme')) !== target) {
        await page.getByRole('button', { name: label, exact: true }).click();
      }
      await expect(page.locator('html')).toHaveAttribute('data-theme', target);
      await expect(page.getByRole('listbox')).toHaveCount(0);
      return;
    }
    await page.getByRole('combobox', { name: label, exact: true }).click();
    await page.getByRole('option', { name: value, exact: true }).click();
  }
  await choose('外观', '暗色');
  await choose('语言', 'English');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('dialog', { name: 'Settings', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor();
  if ((await page.locator('html').getAttribute('data-theme')) !== 'dark') {
    throw new Error('Dark theme missing');
  }
  if ((await page.locator('canvas').getAttribute('data-runtime-id')) !== runtimeId) {
    throw new Error('Theme rebuilt renderer');
  }
  await page.screenshot({ path: resolve(output, 'production-dark-en.png') });
  await page.setViewportSize({ width: 900, height: 600 });
  const size = await page.evaluate(() => ({
    width: innerWidth,
    body: document.documentElement.scrollWidth,
  }));
  if (size.body > size.width) {
    throw new Error('Horizontal layout overflow at supported minimum width');
  }
  await page.screenshot({ path: resolve(output, 'production-min-dark-en.png') });
  results.push({
    name: 'Actual production English/dark Portal, stable renderer, minimum900x600 layout',
    status: 'passed',
    size,
  });
  await page.getByRole('button', { name: 'Door 6', exact: true }).click();
  const angle = page.getByLabel('Current angle (°)', { exact: true });
  await angle.fill('45');
  await angle.press('Enter');
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export GLB', exact: true }).click();
  const download = await event;
  const glbPath = resolve(output, 'production-door.glb');
  await download.saveAs(glbPath);
  const bytes = await readFile(glbPath);
  const report = await validateBytes(bytes, { uri: 'production-door.glb' });
  if (report.issues.numErrors) {
    throw new Error(JSON.stringify(report.issues));
  }
  const length = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + length).toString());
  if (gltf.animations.length !== 4) {
    throw new Error('Expected two independent Open/Close pairs');
  }
  if (!gltf.images?.every((image) => image.bufferView !== undefined)) {
    throw new Error('Images not embedded');
  }
  results.push({
    name: 'Compiled production user property edit and actual GLB download/Validator',
    status: 'passed',
    byteLength: bytes.byteLength,
    errors: report.issues.numErrors,
    warnings: report.issues.numWarnings,
    animations: gltf.animations.map((clip) => clip.name),
  });
  if (errors.length) {
    throw new Error(errors.join('\n'));
  }
  results.push({ name: 'No production page exceptions', status: 'passed' });
} catch (error) {
  results.push({ name: 'production smoke', status: 'failed', error: String(error) });
  process.exitCode = 1;
} finally {
  await writeFile(
    resolve(output, 'production-smoke.json'),
    JSON.stringify(
      {
        time: new Date().toISOString(),
        scope:
          'Actual Vite production assets in Chromium software WebGL browser; not release Tauri or installed application validation',
        results,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
  server.close();
}
