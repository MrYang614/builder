import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { generatedTokens } from './generate-tokens.mjs';
const errors = [];
const root = new URL('../', import.meta.url);
const rootPath = fileURLToPath(root);
const manifests = new Map(
  readdirSync(new URL('packages', root), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const manifest = JSON.parse(
        readFileSync(new URL(`packages/${entry.name}/package.json`, root), 'utf8'),
      );
      return [manifest.name, { directory: entry.name, exports: manifest.exports }];
    }),
);
function dependencies(file, text) {
  const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    ),
    result = [];
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      result.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      result.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return result;
}
function walk(dir) {
  return readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
  );
}
/** Rejects public component appearance overrides while retaining normal page container layout. */
function checkComponentConsumers(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const components = new Set();
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === '@building/ui'
    ) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const binding of bindings.elements) {
          components.add(binding.name.text);
        }
      }
    }
  }
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const family = node.tagName.getText(source).split('.')[0];
      if (components.has(family)) {
        for (const property of node.attributes.properties) {
          if (
            ts.isJsxAttribute(property) &&
            ['className', 'style'].includes(property.name.getText(source))
          ) {
            errors.push(
              `${file}: ${node.tagName.getText(source)} appearance belongs in @building/ui semantic props`,
            );
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
const storybookSources = [
  ...walk('apps/storybook/src'),
  ...walk('apps/storybook/.storybook'),
  'apps/storybook/vite.config.ts',
];
for (const file of [...walk('apps/desktop/src'), ...storybookSources, ...walk('packages')].filter(
  (x) => /\.(ts|tsx|css)$/.test(x),
)) {
  const text = readFileSync(new URL(file, root), 'utf8');
  if (file.startsWith('apps/') && file.endsWith('.tsx')) {
    checkComponentConsumers(file, text);
  }
  const restrictions =
    file.startsWith('packages/editor-core/') || file.startsWith('packages/building-geometry/')
      ? /(?:from\s*|import\s*)['"](?:react|three|@tauri|@building\/ui)|(?<![\w.])(?:window|document)\s*\.(?:createElement|querySelector|addEventListener|location|body)/
      : file.startsWith('packages/ui/')
        ? /from\s*['"](?:three|@tauri|@building\/(?:editor-core|building-geometry|three-runtime))/
        : file.startsWith('packages/three-runtime/')
          ? /from\s*['"](?:react|@building\/ui)/
          : null;
  if (restrictions?.test(text)) {
    errors.push(`${file}: forbidden dependency`);
  }
  if (/\.(ts|tsx)$/.test(file)) {
    for (const dependency of dependencies(file, text)) {
      const pure = /^packages\/(editor-core|building-geometry)\//.test(file),
        ui = file.startsWith('packages/ui/'),
        runtime = file.startsWith('packages/three-runtime/'),
        storybook = file.startsWith('apps/storybook/');
      if (
        (pure &&
          /^(react(?:-dom)?(?:\/|$)|three(?:\/|$)|@tauri|@building\/(ui|three-runtime)(?:\/|$))/.test(
            dependency,
          )) ||
        (ui &&
          /^(three(?:\/|$)|@tauri|@building\/(editor-core|building-geometry|three-runtime)(?:\/|$))/.test(
            dependency,
          )) ||
        (runtime && /^(react(?:-dom)?(?:\/|$)|@building\/ui(?:\/|$))/.test(dependency)) ||
        (storybook &&
          /^(three(?:\/|$)|@tauri|@building\/(editor-core|building-geometry|three-runtime)(?:\/|$))/.test(
            dependency,
          )) ||
        (file.startsWith('apps/desktop/') &&
          /^(storybook(?:\/|$)|@storybook\/|sucrase(?:\/|$))/.test(dependency))
      ) {
        errors.push(`${file}: forbidden import ${dependency}`);
      }
      if (dependency.startsWith('.')) {
        const target = path.resolve(path.dirname(path.join(rootPath, file)), dependency),
          owner = file.match(/^packages\/([^/]+)\//)?.[1];
        if (
          (owner &&
            target.startsWith(path.join(rootPath, 'packages') + path.sep) &&
            !target.startsWith(path.join(rootPath, 'packages', owner) + path.sep)) ||
          (file.startsWith('apps/') &&
            target.startsWith(path.join(rootPath, 'packages') + path.sep))
        ) {
          errors.push(`${file}: cross-package relative import ${dependency}`);
        }
      }
      if (dependency.startsWith('@building/')) {
        const [scope, name, ...parts] = dependency.split('/'),
          manifest = manifests.get(`${scope}/${name}`),
          key = parts.length ? `./${parts.join('/')}` : '.';
        const publicKey =
          manifest &&
          Object.keys(manifest.exports).find(
            (pattern) =>
              pattern === key ||
              (pattern.includes('*') &&
                key.startsWith(pattern.split('*')[0]) &&
                key.endsWith(pattern.split('*')[1])),
          );
        if (!publicKey || key.includes('/src/')) {
          errors.push(`${file}: unexported workspace path ${dependency}`);
        } else {
          const star = publicKey.includes('*')
            ? key.slice(publicKey.split('*')[0].length, key.length - publicKey.split('*')[1].length)
            : '';
          const target = manifest.exports[publicKey].replace('*', star);
          if (!existsSync(path.join(rootPath, 'packages', manifest.directory, target))) {
            errors.push(`${file}: missing public export target ${dependency}`);
          }
        }
      }
    }
  }
  if (
    /^packages\/(editor-core|building-geometry)\//.test(file) &&
    /\b(?:HTMLElement|HTMLCanvasElement|WebGLRenderingContext|Document|Window|ReactNode)\b/.test(
      text,
    )
  ) {
    errors.push(`${file}: display type in pure package`);
  }
  if (/from\s*['"][^'"]*\.\.\/.*packages\//.test(text)) {
    errors.push(`${file}: use public package exports`);
  }
  if (file.startsWith('apps/') || file.startsWith('packages/ui/')) {
    if (file.endsWith('tokens.css')) {
      continue;
    }
    if (/#[\da-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(/.test(text)) {
      errors.push(`${file}: UI color literal`);
    }
    if (
      /(?:bg|text|border|ring|shadow|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d|(?:bg|text|border)-(?:white|black)\b/.test(
        text,
      )
    ) {
      errors.push(`${file}: fixed palette class`);
    }
    if (
      file.includes('/components/') &&
      /\bshadow-(?:2xs|xs|sm|md|lg|xl|2xl)\b/.test(text) &&
      !/shadow-shadow|shadow-\(color:--shadow\)|shadow-\[var\(--shadow\)\]/.test(text)
    ) {
      errors.push(`${file}: shadow must consume semantic token`);
    }
  }
  if (
    /react-three-fiber|@react-three\/fiber/.test(text) ||
    (!file.startsWith('apps/storybook/') && /<iframe/.test(text))
  ) {
    errors.push(`${file}: architecture violation`);
  }
}
const handWrittenSources = [
  ...walk('apps/desktop/src'),
  ...walk('apps/desktop/src-tauri/src'),
  ...storybookSources,
  ...walk('packages'),
].filter((file) => /\.(ts|tsx|rs)$/.test(file));
for (const file of handWrittenSources) {
  const lines = readFileSync(new URL(file, root), 'utf8').split(/\r?\n/);
  const count = lines.at(-1) === '' ? lines.length - 1 : lines.length;
  const ceiling = 500;
  if (count > ceiling) {
    errors.push(`${file}: ${count} lines exceeds ${ceiling}; split responsibility boundaries`);
  }
}
const source = JSON.parse(
  readFileSync(new URL('packages/ui/src/tokens/source.json', root), 'utf8'),
);
if (
  JSON.stringify(Object.keys(source.light).sort()) !==
  JSON.stringify(Object.keys(source.dark).sort())
) {
  errors.push('Theme key mismatch');
}
if (
  readFileSync(new URL('packages/ui/src/styles/tokens.css', root), 'utf8') !== generatedTokens()
) {
  errors.push('Generated tokens stale');
}
const skillManifest = JSON.parse(readFileSync(new URL('docs/skills-manifest.json', root), 'utf8'));
for (const name of ['frontend-design', 'vercel-composition-patterns', 'impeccable']) {
  try {
    const contents = readFileSync(new URL(`.agents/skills/${name}/SKILL.md`, root));
    if (!new RegExp(`^name:\\s*${name}\\s*$`, 'm').test(contents.toString())) {
      errors.push(`Wrong skill identifier ${name}`);
    }
    const pinned = skillManifest.skills.find((skill) => skill.name === name);
    if (!pinned || createHash('sha256').update(contents).digest('hex') !== pinned.sha256) {
      errors.push(`Skill source drift ${name}`);
    }
  } catch {
    errors.push(`Missing skill ${name}`);
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(
  'Source line ceilings, dependency boundaries, UI tokens, generated CSS and skills: PASS',
);
