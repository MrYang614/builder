import { existsSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..');
const target =
  process.env.TAURI_ENV_TARGET_TRIPLE ??
  execFileSync('rustc', ['-vV'], { encoding: 'utf8' })
    .match(/host: (.+)/)?.[1]
    ?.trim();
if (!target) {
  throw new Error('Unable to determine Rust target triple');
}
execFileSync(
  'cargo',
  [
    'build',
    '--release',
    '--target',
    target,
    '--manifest-path',
    'rust/Cargo.toml',
    '-p',
    'building',
  ],
  {
    cwd: root,
    stdio: 'inherit',
  },
);
const windowsTarget = target.includes('windows');
const executable = windowsTarget ? 'building.exe' : 'building';
const source = resolve(root, 'rust', 'target', target, 'release', executable);
if (!existsSync(source)) {
  throw new Error(`CLI build did not produce ${source}`);
}
const bin = resolve(root, 'apps', 'desktop', 'src-tauri', 'bin');
mkdirSync(bin, { recursive: true });
const destination = resolve(
  bin,
  `${executable.replace(/\.exe$/, '')}-${target}${windowsTarget ? '.exe' : ''}`,
);
copyFileSync(source, destination);
if (!windowsTarget) {
  chmodSync(destination, 0o755);
}
console.error(`building CLI copied to ${destination}`);
