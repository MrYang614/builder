import { readFileSync, writeFileSync } from 'node:fs';
export function generatedTokens() {
  const t = JSON.parse(
    readFileSync(new URL('../packages/ui/src/tokens/source.json', import.meta.url), 'utf8'),
  );
  return (
    '/* Generated from tokens/source.json. Do not edit. */\n' +
    Object.entries(t)
      .map(
        ([theme, v]) =>
          `${theme === 'light' ? ':root' : ':root[data-theme="dark"]'} {\n${Object.entries(v)
            .map(([k, x]) => `  --${k}: ${x};`)
            .join('\n')}\n}`,
      )
      .join('\n') +
    '\n'
  );
}
if (process.argv[1]?.endsWith('generate-tokens.mjs')) {
  writeFileSync(
    new URL('../packages/ui/src/styles/tokens.css', import.meta.url),
    generatedTokens(),
  );
}
