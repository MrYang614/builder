import { transform } from 'sucrase';
import * as React from 'react';
import * as JsxRuntime from 'react/jsx-runtime';
import * as Ui from '@building/ui';
import { Check, Search, Save, Plus, X, Settings, Moon, Sun, Eye, Copy } from 'lucide-react';
import type { ComponentType } from 'react';
import type { PreviewArgs } from './schema';

const modules: Record<string, unknown> = {
  react: React,
  'react/jsx-runtime': JsxRuntime,
  '@building/ui': Ui,
  'lucide-react': { Check, Search, Save, Plus, X, Settings, Moon, Sun, Eye, Copy },
};

function requirePreview(name: string): unknown {
  if (!Object.hasOwn(modules, name)) {
    throw new Error(
      `Unsupported import "${name}". Use react, @building/ui or documented lucide-react icons.`,
    );
  }
  return modules[name];
}

export type CompiledExample = ComponentType<PreviewArgs>;

/** Compiles trusted local TSX through Sucrase; each Blob module is revoked after evaluation. */
export async function compileExample(
  source: string,
  signal?: AbortSignal,
): Promise<CompiledExample> {
  const compiled = transform(source, {
    transforms: ['typescript', 'jsx', 'imports'],
    jsxRuntime: 'automatic',
    production: true,
    filePath: 'editable-example.tsx',
  }).code;
  const url = URL.createObjectURL(
    new Blob(
      [
        'export default function evaluate(require) { const exports = {}; const module = { exports };\n',
        compiled,
        '\nreturn module.exports.default; }',
      ],
      { type: 'text/javascript' },
    ),
  );
  try {
    const evaluator: { default: (require: typeof requirePreview) => unknown } = await import(
      /* @vite-ignore */ url
    );
    if (signal?.aborted) {
      throw new DOMException('Compilation superseded by a newer draft.', 'AbortError');
    }
    const component = evaluator.default(requirePreview);
    if (typeof component !== 'function') {
      throw new Error('Example must export a default React component function.');
    }
    return component as CompiledExample;
  } finally {
    URL.revokeObjectURL(url);
  }
}
