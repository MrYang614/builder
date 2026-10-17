/** Portable container interoperability; exercises the real Rust file implementation. */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { evidencePath } from './evidence-path';
import assert from 'node:assert/strict';
import { createEmptyProject } from '@building/editor-core';
import {
  encodeProjectContainer,
  decodeProjectContainer,
} from '../apps/desktop/src/platform/container';

const doc = createEmptyProject('跨平台 portability');
doc.resources.push({
  id: 'image_pixel',
  name: '原始 image.png',
  mime: 'image/png',
  dataUrl:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
});
const directory = evidencePath('native/interoperability');
await mkdir(directory, { recursive: true });
const browserPath = resolve(directory, 'browser-generated.building');
const jsonPath = resolve(directory, 'rust-unpacked.json');
const rustPath = resolve(directory, 'rust-generated.building');
await writeFile(browserPath, await encodeProjectContainer(doc));
execFileSync(
  'cargo',
  [
    'run',
    '--manifest-path',
    'apps/desktop/src-tauri/Cargo.toml',
    '--example',
    'project_tool',
    '--',
    'unpack',
    browserPath,
    jsonPath,
  ],
  { stdio: 'inherit' },
);
assert.deepEqual(JSON.parse(await readFile(jsonPath, 'utf8')), doc);
execFileSync(
  'cargo',
  [
    'run',
    '--manifest-path',
    'apps/desktop/src-tauri/Cargo.toml',
    '--example',
    'project_tool',
    '--',
    'pack',
    jsonPath,
    rustPath,
  ],
  { stdio: 'inherit' },
);
assert.deepEqual(await decodeProjectContainer(new Uint8Array(await readFile(rustPath))), doc);
await writeFile(
  resolve(directory, 'result.json'),
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      status: 'passed',
      flow: 'TypeScript ZIP → actual Rust decode → actual Rust ZIP → TypeScript decode',
      exactDocumentAndImageBytesRetained: true,
    },
    null,
    2,
  ),
);
console.log(
  'PASS: browser ZIP → Rust decode → Rust ZIP → browser decode; full image bytes and editable schema retained',
);
