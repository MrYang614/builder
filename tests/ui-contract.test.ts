import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { build } from 'vite';
import { tokens, resolveTokens, viewportTokens } from '@building/ui/tokens';
import { resolvedTheme, validTheme } from '@building/ui/theme';
import { languageKeys, translate } from '../apps/desktop/src/ui/i18n';

const workspace = path.resolve(import.meta.dirname, '..');
const read = (file: string) => readFileSync(path.join(workspace, file), 'utf8');
function files(directory: string): string[] {
  return readdirSync(path.join(workspace, directory), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`],
  );
}
function ast(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    read(file),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}
function visit(node: ts.Node, callback: (node: ts.Node) => void): void {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}
function imports(file: string): string[] {
  const result: string[] = [];
  visit(ast(file), (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      result.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      result.push(node.arguments[0].text);
    }
  });
  return result;
}
function errorCodes(): Set<string> {
  const result = new Set<string>();
  const sources = [
    ...files('packages/editor-core/src'),
    ...files('apps/desktop/src/platform'),
  ].filter((file) => /\.(ts|tsx)$/.test(file) && !file.endsWith('.test.ts'));
  for (const file of sources) {
    visit(ast(file), (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        ['fail', 'rejected', 'error'].includes(node.expression.text) &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        result.add(node.arguments[0].text);
      }
      if (
        ts.isPropertyAssignment(node) &&
        (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
        node.name.text === 'code' &&
        ts.isStringLiteral(node.initializer)
      ) {
        result.add(node.initializer.text);
      }
    });
  }
  for (const file of files('apps/desktop/src-tauri/src').filter((file) => file.endsWith('.rs'))) {
    for (const match of read(file).matchAll(/AppError::new\(\s*"([a-z][a-z0-9_]+)"/g)) {
      result.add(match[1]!);
    }
  }
  // OS errors are selected by a match arm rather than AppError::new literal calls.
  for (const code of ['permission_denied', 'file_not_found', 'disk_full', 'io_error']) {
    result.add(code);
  }
  return result;
}
function luminance(hex: string): number {
  const values = [1, 3, 5]
    .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
}
function contrast(a: string, b: string): number {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe('UI contracts: semantic colors, localized errors and public module boundaries', () => {
  it('defines the complete semantic set in both themes from one token source', () => {
    expect(Object.keys(tokens.light).sort()).toEqual(Object.keys(tokens.dark).sort());
    const required = [
      'background',
      'foreground',
      'card',
      'card-foreground',
      'popover',
      'popover-foreground',
      'sidebar',
      'sidebar-foreground',
      'primary',
      'primary-foreground',
      'secondary',
      'secondary-foreground',
      'accent',
      'accent-foreground',
      'muted',
      'muted-foreground',
      'border',
      'input',
      'ring',
      'destructive',
      'destructive-foreground',
      'success',
      'success-foreground',
      'warning',
      'warning-foreground',
      'info',
      'info-foreground',
      'overlay',
      'shadow',
      'disabled',
      'scrollbar',
      'viewport-background',
      'grid',
      'axis',
      'selection',
      'snap',
      'preview',
      'preview-invalid',
    ];
    for (const theme of ['light', 'dark'] as const) {
      expect(Object.keys(resolveTokens(theme))).toEqual(expect.arrayContaining(required));
      for (const color of Object.values(resolveTokens(theme))) {
        expect(color).toMatch(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i);
      }
      expect(viewportTokens(theme).background).toBe(resolveTokens(theme)['viewport-background']);
    }
  });
  it('keeps normal text at 4.5:1 and focus indications at 3:1 in both themes', () => {
    const pairs = [
      ['foreground', 'background'],
      ['card-foreground', 'card'],
      ['popover-foreground', 'popover'],
      ['sidebar-foreground', 'sidebar'],
      ['primary-foreground', 'primary'],
      ['secondary-foreground', 'secondary'],
      ['accent-foreground', 'accent'],
      ['muted-foreground', 'muted'],
      ['destructive-foreground', 'destructive'],
      ['success-foreground', 'success'],
      ['warning-foreground', 'warning'],
      ['info-foreground', 'info'],
    ] as const;
    for (const theme of ['light', 'dark'] as const) {
      for (const [foreground, background] of pairs) {
        expect(
          contrast(tokens[theme][foreground], tokens[theme][background]),
          `${theme} ${foreground}/${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const theme of ['light', 'dark'] as const) {
      for (const background of ['background', 'card', 'sidebar'] as const) {
        expect(
          contrast(tokens[theme].ring, tokens[theme][background]),
          `${theme} focus/${background}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });
  it('checks the exact generated CSS, so changing JSON without regeneration is a failure', () => {
    const expected =
      '/* Generated from tokens/source.json. Do not edit. */\n' +
      Object.entries(tokens)
        .map(
          ([theme, values]) =>
            `${theme === 'light' ? ':root' : ':root[data-theme="dark"]'} {\n${Object.entries(values)
              .map(([key, value]) => `  --${key}: ${value};`)
              .join('\n')}\n}`,
        )
        .join('\n') +
      '\n';
    expect(read('packages/ui/src/styles/tokens.css')).toBe(expected);
  });
  it('migrates legacy and invalid themes to fixed light while preserving explicit light/dark', () => {
    for (const value of ['system', 'unknown', null, '', undefined]) {
      expect(validTheme(value)).toBe('light');
    }
    expect(validTheme('light')).toBe('light');
    expect(validTheme('dark')).toBe('dark');
    expect(resolvedTheme('light')).toBe('light');
    expect(resolvedTheme('dark')).toBe('dark');
    expect(JSON.stringify(tokens)).not.toContain('building-theme');
  });
  it('applies the actual startup script without consulting OS appearance for legacy or manual preferences', () => {
    const script = read('apps/desktop/index.html').match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeDefined();
    for (const mode of ['system', 'invalid', null, 'light', 'dark']) {
      const dataset: { theme?: string } = {};
      let systemQueries = 0;
      runInNewContext(script!, {
        localStorage: { getItem: () => mode },
        document: { documentElement: { dataset } },
        matchMedia: () => {
          systemQueries++;
          return { matches: true };
        },
      });
      expect(dataset.theme, String(mode)).toBe(mode === 'dark' ? 'dark' : 'light');
      expect(systemQueries).toBe(0);
    }
    for (const file of ['packages/ui/src/theme/index.tsx', 'apps/desktop/src/main.tsx']) {
      expect(read(file)).not.toContain('matchMedia');
    }
  });
  it('keeps English/Chinese keys and interpolation placeholders complete', () => {
    expect([...languageKeys.en].sort()).toEqual([...languageKeys.zh].sort());
    for (const key of languageKeys.en) {
      const english = translate('en', key),
        chinese = translate('zh-CN', key);
      expect(english.trim().length, key).toBeGreaterThan(0);
      expect(chinese.trim().length, key).toBeGreaterThan(0);
      expect([...english.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort(), key).toEqual(
        [...chinese.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort(),
      );
    }
    expect(translate('en', 'hintLength', { length: '2.40' })).toContain('2.40');
    expect(translate('zh-CN', 'objectCount', { count: 3 })).toContain('3');
  });
  it('translates every actual core/file/Rust error code without a generic fallback', () => {
    const missing: string[] = [];
    for (const code of errorCodes()) {
      for (const language of ['en', 'zh-CN'] as const) {
        if (translate(language, code) === translate(language, '__unknown_error__')) {
          missing.push(`${language}: ${code}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
  it('resolves every literal UI translation lookup against the real dictionaries', () => {
    const missing: string[] = [];
    for (const file of files('apps/desktop/src').filter(
      (file) => /\.(ts|tsx)$/.test(file) && !file.endsWith('.test.ts'),
    )) {
      visit(ast(file), (node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 't' &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          const key = node.arguments[0].text;
          if (translate('en', key) === translate('en', '__unknown_error__') && key !== 'error') {
            missing.push(`${file}: ${key}`);
          }
        }
      });
    }
    expect(missing).toEqual([]);
  });
  it('enforces no DOM/UI dependencies in core/geometry or building dependencies in UI', () => {
    const violations: string[] = [];
    for (const file of files('packages').filter((file) => /\.(ts|tsx)$/.test(file))) {
      const dependencies = imports(file);
      const pure = /^packages\/(editor-core|building-geometry)\//.test(file);
      const ui = file.startsWith('packages/ui/'),
        runtime = file.startsWith('packages/three-runtime/');
      for (const dependency of dependencies) {
        if (
          pure &&
          /^(react(?:-dom)?(?:\/|$)|three(?:\/|$)|@tauri|@building\/(ui|three-runtime)(?:\/|$))/.test(
            dependency,
          )
        ) {
          violations.push(`${file}: ${dependency}`);
        }
        if (
          ui &&
          /^(three(?:\/|$)|@tauri|@building\/(editor-core|building-geometry|three-runtime)(?:\/|$))/.test(
            dependency,
          )
        ) {
          violations.push(`${file}: ${dependency}`);
        }
        if (runtime && /^(react(?:-dom)?(?:\/|$)|@building\/ui(?:\/|$))/.test(dependency)) {
          violations.push(`${file}: ${dependency}`);
        }
      }
      if (
        pure &&
        /\b(?:HTMLElement|HTMLCanvasElement|WebGLRenderingContext|Document|Window|ReactNode)\b/.test(
          read(file),
        )
      ) {
        violations.push(`${file}: display type in pure module`);
      }
    }
    const tokenGraph = ['packages/ui/src/tokens/index.ts'];
    expect(imports(tokenGraph[0]!)).toEqual(['./source.json']);
    expect(violations).toEqual([]);
  });
  it('uses public workspace exports and blocks cross-package relative/internal imports', () => {
    const packageDirectories = ['editor-core', 'building-geometry', 'three-runtime', 'ui'];
    const manifests = new Map(
      packageDirectories.map((directory) => {
        const manifest = JSON.parse(read(`packages/${directory}/package.json`)) as {
          name: string;
          exports: Record<string, string>;
        };
        return [manifest.name, { directory, exports: manifest.exports }] as const;
      }),
    );
    const violations: string[] = [];
    for (const file of [...files('packages'), ...files('apps/desktop/src')].filter((file) =>
      /\.(ts|tsx)$/.test(file),
    )) {
      for (const dependency of imports(file)) {
        if (dependency.startsWith('.')) {
          const resolved = path.resolve(path.dirname(path.join(workspace, file)), dependency);
          const owner = file.match(/^packages\/([^/]+)\//)?.[1];
          if (
            owner &&
            resolved.startsWith(path.join(workspace, 'packages') + path.sep) &&
            !resolved.startsWith(path.join(workspace, 'packages', owner) + path.sep)
          ) {
            violations.push(`${file}: ${dependency}`);
          }
          if (
            file.startsWith('apps/') &&
            resolved.startsWith(path.join(workspace, 'packages') + path.sep)
          ) {
            violations.push(`${file}: ${dependency}`);
          }
        }
        if (!dependency.startsWith('@building/')) {
          continue;
        }
        const [scope, name, ...subpath] = dependency.split('/'),
          packageName = `${scope}/${name}`,
          manifest = manifests.get(packageName);
        if (!manifest) {
          violations.push(`${file}: unknown ${packageName}`);
          continue;
        }
        const key = subpath.length ? `./${subpath.join('/')}` : '.';
        const matched = Object.keys(manifest.exports).some(
          (pattern) =>
            pattern === key ||
            (pattern.includes('*') &&
              key.startsWith(pattern.split('*')[0]!) &&
              key.endsWith(pattern.split('*')[1]!)),
        );
        if (!matched || key.includes('/src/')) {
          violations.push(`${file}: private ${dependency}`);
        }
      }
    }
    for (const { directory, exports } of manifests.values()) {
      for (const target of Object.values(exports)) {
        if (!target.includes('*')) {
          expect(
            existsSync(path.join(workspace, 'packages', directory, target)),
            `${directory}/${target}`,
          ).toBe(true);
        }
      }
    }
    expect(violations).toEqual([]);
  });
  it('keeps UI literals/palettes and implicit shadcn shadow colors out of component source', () => {
    const violations: string[] = [];
    for (const file of [...files('packages/ui/src'), ...files('apps/desktop/src')].filter(
      (file) =>
        /\.(ts|tsx|css)$/.test(file) && !file.endsWith('tokens.css') && !file.endsWith('.test.ts'),
    )) {
      const text = read(file);
      if (/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch)\s*\(/i.test(text)) {
        violations.push(`${file}: color literal`);
      }
      if (
        /(?:bg|text|border|ring|shadow|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d|(?:bg|text|border)-(?:white|black)\b/.test(
          text,
        )
      ) {
        violations.push(`${file}: fixed palette`);
      }
      if (
        file.includes('/components/') &&
        /\bshadow-(?:2xs|xs|sm|md|lg|xl|2xl)\b/.test(text) &&
        !/shadow-shadow|shadow-\(color:--shadow\)|shadow-\[var\(--shadow\)\]/.test(text)
      ) {
        violations.push(`${file}: shadow needs semantic color`);
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('actual production stylesheet build', () => {
  const artifactBase = path.join(workspace, '.test-artifacts');
  const output = path.join(artifactBase, `ui-contract-${process.pid}-${Date.now()}`);
  let styles = '',
    html = '';
  const modules: string[] = [];
  beforeAll(async () => {
    mkdirSync(artifactBase, { recursive: true });
    await build({
      configFile: path.join(workspace, 'apps/desktop/vite.config.ts'),
      logLevel: 'silent',
      plugins: [
        {
          name: 'record-production-dependency-boundary',
          generateBundle() {
            modules.push(...this.getModuleIds());
          },
        },
      ],
      build: { outDir: output, emptyOutDir: true },
    });
    html = readFileSync(path.join(output, 'index.html'), 'utf8');
    const cssFiles = readdirSync(path.join(output, 'assets')).filter((file) =>
      file.endsWith('.css'),
    );
    expect(cssFiles.length).toBeGreaterThan(0);
    styles = cssFiles
      .map((file) => readFileSync(path.join(output, 'assets', file), 'utf8'))
      .join('\n');
  }, 60000);
  afterAll(() => {
    const checked = path.resolve(output);
    if (checked.startsWith(path.resolve(artifactBase) + path.sep)) {
      rmSync(checked, { recursive: true, force: true });
    }
  });
  it('ships every theme variable, portal overlay/focus rules and shared shadcn styles', () => {
    for (const key of Object.keys(tokens.light)) {
      expect(styles, `--${key}`).toContain(`--${key}:`);
    }
    expect(styles).toMatch(/data-theme\s*=\s*["']?dark/);
    for (const selector of [
      '.bg-background',
      '.bg-popover',
      '.bg-overlay',
      '.text-muted-foreground',
      '.border-input',
    ]) {
      expect(styles).toContain(selector);
    }
    expect(styles).toContain(':focus-visible');
    expect(styles).toContain('--ring');
    expect(styles).toContain('--shadow');
    expect(styles).toContain('.work-area');
    expect(styles).toContain('.viewport');
  });
  it('emits a real app entry and applies startup theme before the module starts', () => {
    expect(html).toMatch(/type="module"[^>]*src="[^" ]+\.js"/);
    expect(html).toContain('building-theme');
    expect(html).not.toContain('prefers-color-scheme');
    expect(html.indexOf('building-theme')).toBeLessThan(html.indexOf('type="module"'));
    expect(html).not.toMatch(/<iframe|\/src\/main\.tsx/);
  });
  it('keeps development-only Storybook and TSX compiler modules outside the actual editor build', () => {
    expect(modules.length).toBeGreaterThan(100);
    expect(
      modules.filter((module) =>
        /(?:apps\/storybook|node_modules\/(?:@storybook|storybook|sucrase))/.test(
          module.replaceAll('\\', '/'),
        ),
      ),
    ).toEqual([]);
  });
});
