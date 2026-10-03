import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const skills = [
  {
    name: 'frontend-design',
    source: 'https://github.com/anthropics/skills',
    revision: '8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4',
    version: 'commit-pinned',
  },
  {
    name: 'vercel-composition-patterns',
    source: 'https://github.com/vercel-labs/agent-skills',
    revision: '063bee94c3f4df8453406c830b0a7df0f2860278',
    version: '1.0.0',
  },
  {
    name: 'impeccable',
    source: 'https://github.com/pbakaus/impeccable',
    revision: 'e103efe779e2dd01274dabae83531fef00bf2563',
    version: 'plugin4.5.0/engine0.1.11',
  },
].map((skill) => ({
  ...skill,
  path: `.agents/skills/${skill.name}/SKILL.md`,
  sha256: createHash('sha256')
    .update(readFileSync(`.agents/skills/${skill.name}/SKILL.md`))
    .digest('hex'),
}));
writeFileSync(
  'docs/skills-manifest.json',
  JSON.stringify(
    { installedAt: '2026-10-03', reader: 'Codex exec_command/Get-Content -Raw', skills },
    null,
    2,
  ) + '\n',
);
console.log('Recorded three readable pinned Skill sources and SHA256 main-file hashes.');
