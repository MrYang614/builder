/** Real TypeScript↔Rust portable environment IO; no desktop GUI or mocked file calls. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, unlink, rename } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createEmptyProject, defaultEnvironmentSettings } from '@building/editor-core';
import {
  browserEnvironmentResource,
  decodeProjectContainer,
  encodeProjectContainer,
} from '../apps/desktop/src/platform/container';
import { hdrPanorama, exrPanorama } from './environment-fixtures';

const directory = resolve('.test-artifacts/environment-interoperability');
await mkdir(directory, { recursive: true });
const document = createEmptyProject('环境便携工程');
document.environmentResources = [];
for (const [name, bytes] of [
  ['原始 中文.hdr', hdrPanorama()],
  ['原始 中文.exr', exrPanorama()],
] as const) {
  const source = resolve(directory, name);
  await writeFile(source, bytes);
  document.environmentResources.push(
    await browserEnvironmentResource(
      new File([new Uint8Array(await readFile(source)).buffer], name),
    ),
  );
  await unlink(source);
}
document.environment = {
  ...defaultEnvironmentSettings(),
  resourceId: document.environmentResources[1]!.id,
  rotation: 135,
  intensity: 2,
  background: true,
};
const browserPath = resolve(directory, 'browser.building'),
  migratedPath = resolve(directory, '迁移工程.building'),
  unpackedPath = resolve(directory, 'rust-unpacked.json'),
  rustPath = resolve(directory, 'rust.building');
await writeFile(browserPath, await encodeProjectContainer(document));
await rename(browserPath, migratedPath);
const cargo = (...args: string[]) =>
  execFileSync(
    'cargo',
    [
      'run',
      '--manifest-path',
      'apps/desktop/src-tauri/Cargo.toml',
      '--example',
      'project_tool',
      '--',
      ...args,
    ],
    { stdio: 'inherit' },
  );
cargo('unpack', migratedPath, unpackedPath);
assert.deepEqual(JSON.parse(await readFile(unpackedPath, 'utf8')), document);
cargo('pack', unpackedPath, rustPath);
assert.deepEqual(await decodeProjectContainer(new Uint8Array(await readFile(rustPath))), document);
await writeFile(
  resolve(directory, 'result.json'),
  JSON.stringify(
    {
      status: 'passed',
      measuredAt: new Date().toISOString(),
      scope:
        'Windows actual filesystem + Rust binary project_tool; no native GUI or macOS inference',
      sourceImagesDeleted: true,
      projectMoved: true,
      flow: 'TS ZIP → real Rust decode → real Rust ZIP → TS decode',
      hdrExrOriginalBytesAndFormalSettingsRetained: true,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'PASS: HDR/EXR bytes and environment settings survive actual source deletion, migration and TS↔Rust ZIP roundtrip',
);
