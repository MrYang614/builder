import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Input } from '@building/ui';
import { Copy, RotateCcw } from 'lucide-react';
import { compileExample } from './compiler';
import { PreviewBoundary } from './error-boundary';
import { parseConfig, validateObject } from './schema';
import {
  claimDraft,
  discardHmrDraft,
  finishHmrUpdate,
  peekHmrDraft,
  releaseDraft,
  saveHmrDraft,
} from './draft-cache';
import type { CompiledExample } from './compiler';
import type { ConfigSchema, PreviewArgs } from './schema';

export type ExampleDefinition = {
  name: string;
  source: string;
  config: PreviewArgs;
  schema: ConfigSchema;
  notes: string;
  keyboard: string;
  api: readonly { prop: string; type: string; defaultValue: string; description: string }[];
  configTarget?: string;
};
type PlaygroundProps = {
  storyId: string;
  example: ExampleDefinition;
  args: PreviewArgs;
  initialArgs: PreviewArgs;
  resetArgs: () => void;
  updateArgs: (args: PreviewArgs) => void;
  theme?: string;
  width?: string;
};
const serialize = (value: PreviewArgs) => JSON.stringify(value, null, 2);

/** Owns only page-memory drafts; Storybook args remain the one source for applied configuration. */
export function Playground({
  storyId,
  example,
  args,
  initialArgs,
  resetArgs,
  updateArgs,
  theme,
  width,
}: PlaygroundProps) {
  const [restored] = useState(() => peekHmrDraft(storyId));
  const [code, setCode] = useState(restored?.code ?? example.source);
  const [config, setConfig] = useState(() => restored?.config ?? serialize(initialArgs));
  const [initialized, setInitialized] = useState(
    Boolean(restored) || serialize(args) === serialize(initialArgs),
  );
  const [lastValidConfig, setLastValidConfig] = useState(() => ({
    args: restored?.args ?? initialArgs,
    signature: serialize(restored?.args ?? initialArgs),
  }));
  const [configError, setConfigError] = useState<string | null>(() => {
    if (!restored) {
      return null;
    }
    try {
      parseConfig(restored.config, example.schema);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
  const [compileError, setCompileError] = useState<string | null>(null);
  const [component, setComponent] = useState<CompiledExample | null>(null);
  const [previewGeneration, setPreviewGeneration] = useState(0);
  const [resetGeneration, setResetGeneration] = useState(0);
  const [compiledSource, setCompiledSource] = useState<string | null>(null);
  const [compiledRevision, setCompiledRevision] = useState(-1);
  const [baselineUpdated, setBaselineUpdated] = useState(false);
  const [copiedSource, setCopiedSource] = useState<string | null>(null);
  const [hmrRevision, setHmrRevision] = useState(0);
  const baseline = useRef(
    restored?.baseline ?? { source: example.source, config: serialize(initialArgs) },
  );
  const applied = useRef(serialize(restored?.args ?? initialArgs));
  const argsText = serialize(args);
  const controlsError = validateObject(args, example.schema);
  if (!controlsError && argsText !== lastValidConfig.signature) {
    setLastValidConfig({ args, signature: argsText });
  }
  const baselineText = serialize(initialArgs);
  if (!initialized && argsText === baselineText) {
    setInitialized(true);
  }
  const currentArgs = useRef(args);
  const latestDraft = useRef({ code, config, args });
  const resetOnExit = useRef(() => {
    resetArgs();
  });
  const hmrSnapshot = useRef(restored ?? null);
  const restorePending = useRef(Boolean(restored));
  const initializePending = useRef(!restored);
  useLayoutEffect(() => {
    currentArgs.current = args;
    latestDraft.current = { code, config, args };
    resetOnExit.current = () => {
      resetArgs();
    };
  }, [args, code, config, resetArgs]);

  useLayoutEffect(() => {
    const owner = claimDraft(storyId);
    return () => {
      releaseDraft(storyId, owner, () => {
        resetOnExit.current();
      });
    };
  }, [storyId]);

  useEffect(() => {
    if (initializePending.current) {
      initializePending.current = false;
      // Manager URL args and cached controls are temporary; real entry starts from this CSF variant.
      resetArgs();
    }
  }, [resetArgs]);

  useEffect(() => {
    if (restorePending.current || !initialized) {
      return;
    }
    if (argsText !== applied.current) {
      applied.current = argsText;
      setConfig(argsText);
      setConfigError(controlsError);
    }
  }, [argsText, args, controlsError, initialized]);

  useEffect(() => {
    if (restored && restorePending.current) {
      restorePending.current = false;
      applied.current = serialize(restored.args);
      updateArgs(restored.args);
    }
  }, [restored, updateArgs]);

  useEffect(() => {
    const previous = baseline.current;
    if (previous.source === example.source && previous.config === baselineText) {
      return;
    }
    const snapshot = hmrSnapshot.current ?? { code, config, args: currentArgs.current };
    const hasDraft = snapshot.code !== previous.source || snapshot.config !== previous.config;
    baseline.current = { source: example.source, config: baselineText };
    if (hasDraft) {
      setBaselineUpdated(true);
      setCode(snapshot.code);
      setConfig(snapshot.config);
      applied.current = serialize(snapshot.args);
      updateArgs(snapshot.args);
    } else {
      setCode(example.source);
      setConfig(baselineText);
      applied.current = baselineText;
      resetArgs();
    }
  }, [example.source, baselineText, code, config, resetArgs, updateArgs]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    void compileExample(code, controller.signal).then(
      (next) => {
        if (!cancelled) {
          setComponent(() => next);
          setPreviewGeneration((generation) => generation + 1);
          setCompileError(null);
          setCompiledSource(code);
          setCompiledRevision(hmrRevision);
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setCompileError(error instanceof Error ? error.message : String(error));
          setCompiledSource(code);
          setCompiledRevision(hmrRevision);
        }
      },
    );
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [code, hmrRevision]);

  useEffect(() => {
    // Snapshot before Vite updates CSF args, so a new baseline cannot erase active JSON drafts.
    const preserve = () => {
      const snapshot = { ...latestDraft.current, baseline: baseline.current };
      hmrSnapshot.current = snapshot;
      saveHmrDraft(storyId, snapshot);
    };
    const refresh = () => {
      finishHmrUpdate();
      setHmrRevision((revision) => revision + 1);
    };
    import.meta.hot?.on('vite:beforeUpdate', preserve);
    import.meta.hot?.on('vite:afterUpdate', refresh);
    return () => {
      import.meta.hot?.off('vite:beforeUpdate', preserve);
      import.meta.hot?.off('vite:afterUpdate', refresh);
    };
  }, [storyId]);

  function editConfig(next: string) {
    setConfig(next);
    try {
      const value = { ...initialArgs, ...parseConfig(next, example.schema) };
      applied.current = serialize(value);
      updateArgs(value);
      setConfigError(null);
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : String(error));
    }
  }

  function reset() {
    // Reset also discards component-local state when source and args already match the baseline.
    setResetGeneration((generation) => generation + 1);
    setCode(example.source);
    setConfig(baselineText);
    applied.current = baselineText;
    resetArgs();
    setConfigError(null);
    setCompileError(null);
    setBaselineUpdated(false);
    setCopiedSource(null);
    hmrSnapshot.current = null;
    discardHmrDraft(storyId);
  }

  async function copyCode() {
    const source = code;
    try {
      await navigator.clipboard.writeText(source);
      setCopiedSource(source);
    } catch {
      setCopiedSource(null);
    }
  }

  const Preview = component;
  const compiling = compiledSource !== code || compiledRevision !== hmrRevision;
  const currentCompileError = compiling ? null : compileError;
  const currentConfigError = configError ?? controlsError;
  const previewArgs = !initialized ? initialArgs : controlsError ? lastValidConfig.args : args;
  const previewArgsText = serialize(previewArgs);
  const stale = !initialized || compiling || currentCompileError || currentConfigError;
  return (
    <main
      className="workbench"
      data-theme={theme === 'dark' ? 'dark' : 'light'}
      data-baseline-config={baselineText}
    >
      <header className="workbench-header">
        <div>
          <h1>{example.name}</h1>
          <p>{example.notes}</p>
        </div>
        <div className="workbench-actions">
          <Button.Group label="Example actions">
            <Button
              variant="outline"
              icon={Copy}
              onClick={() => {
                void copyCode();
              }}
            >
              {copiedSource === code ? 'Copied' : 'Copy code'}
            </Button>
            <Button variant="secondary" icon={RotateCcw} onClick={reset}>
              Reset example
            </Button>
          </Button.Group>
          <p>Browser drafts last until you leave, refresh or reset.</p>
        </div>
      </header>
      {baselineUpdated ? (
        <Alert
          title="Local baseline updated"
          description="Your browser draft is preserved. Reset example to load the latest local source and configuration."
        />
      ) : null}
      <section
        className="workbench-preview"
        aria-label="Live component preview"
        data-width={width === 'narrow' ? 'narrow' : 'comfortable'}
      >
        <div className="preview-caption">
          <h2>Live preview</h2>
          <output>
            {stale ? 'Last valid preview · pending corrections' : 'Current code and configuration'}
          </output>
        </div>
        {currentCompileError ? (
          <Alert
            variant="destructive"
            title="Code compilation error"
            description={currentCompileError}
          />
        ) : null}
        {currentConfigError ? (
          <Alert
            variant="destructive"
            title="Configuration error"
            description={currentConfigError}
          />
        ) : null}
        <div className="preview-stage" data-testid="preview-stage">
          {Preview ? (
            <PreviewBoundary
              key={`${previewGeneration}:${resetGeneration}`}
              revision={previewArgsText}
            >
              <Preview {...previewArgs} />
            </PreviewBoundary>
          ) : (
            <p>{compiling ? 'Compiling example…' : 'Correct the code to begin previewing.'}</p>
          )}
        </div>
        <p className="keyboard-note">Keyboard: {example.keyboard}</p>
      </section>
      <div className="workbench-editors">
        <section aria-labelledby="code-heading">
          <h2 id="code-heading">Example code</h2>
          <p>
            TSX with React state and callbacks. Imports: react, @building/ui, documented
            lucide-react icons.
          </p>
          <Form.Item label="Editable TSX code" id="example-code">
            <Input.TextArea
              id="example-code"
              value={code}
              onValueChange={setCode}
              font="code"
              rows={20}
              spellCheck={false}
              aria-label="Editable TSX code"
            />
          </Form.Item>
        </section>
        <section aria-labelledby="config-heading">
          <h2 id="config-heading">Temporary configuration</h2>
          <p>
            JSON updates the same args as Storybook Controls. Nodes, icons and callbacks are defined
            in code.
            {example.configTarget
              ? ` These keys configure ${example.configTarget} components inside this example.`
              : ''}
          </p>
          <Form.Item
            label="Editable JSON configuration"
            id="example-config"
            error={currentConfigError ?? undefined}
            announceError={false}
          >
            <Input.TextArea
              id="example-config"
              value={config}
              onValueChange={editConfig}
              font="code"
              rows={20}
              spellCheck={false}
              aria-label="Editable JSON configuration"
            />
          </Form.Item>
        </section>
      </div>
      <section className="workbench-api" aria-labelledby="api-heading">
        <h2 id="api-heading">Props reference</h2>
        <div className="api-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Prop</th>
                <th>Type</th>
                <th>Component default</th>
                <th>Example baseline</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(example.schema).map(([prop, field]) => (
                <tr key={prop}>
                  <td>
                    <code>{example.configTarget ? `${example.configTarget}.${prop}` : prop}</code>
                  </td>
                  <td>
                    {example.api.find((detail) => detail.prop === prop)?.type ??
                      field.options?.map(String).join(' | ') ??
                      field.type}
                    {field.nullable ? ' | null' : ''}
                  </td>
                  <td>
                    <code>
                      {field.defaultLabel ?? JSON.stringify(field.defaultValue) ?? 'Not set'}
                    </code>
                  </td>
                  <td>
                    <code>{JSON.stringify(initialArgs[prop]) ?? 'Not set'}</code>
                  </td>
                  <td>{field.description}</td>
                </tr>
              ))}
              {example.api
                .filter((field) => !Object.hasOwn(example.schema, field.prop))
                .map((field) => (
                  <tr key={field.prop}>
                    <td>
                      <code>{field.prop}</code>
                    </td>
                    <td>{field.type}</td>
                    <td>{field.defaultValue}</td>
                    <td>Defined in example code</td>
                    <td>{field.description}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
      <footer className="workbench-footnote">
        Changes live only in this page's memory. Refresh or reset restores the repository baseline.
        Preview TSX executes as trusted local code; no file-write or persistence API is provided.
      </footer>
    </main>
  );
}
