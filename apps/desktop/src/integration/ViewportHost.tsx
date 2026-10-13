import { useEffect, useLayoutEffect, useRef } from 'react';
import { ThreeRuntime, isRenderErrorStatus } from '@building/three-runtime';
import type { Command } from '@building/editor-core';
import { viewportTokens } from '@building/ui/tokens';
import { useTheme } from '@building/ui/theme';
import { useEditor, useDocument, useSession } from '../app/services';
import { useLanguage } from '../ui/i18n';
export function ViewportHost() {
  const container = useRef<HTMLDivElement>(null);
  const services = useEditor();
  const { resolved } = useTheme();
  const { t } = useLanguage();
  const doc = useDocument(),
    session = useSession();
  const themeRef = useRef(resolved);
  useLayoutEffect(() => {
    themeRef.current = resolved;
  }, [resolved]);
  useEffect(() => {
    if (!container.current) {
      return;
    }
    let runtime: ThreeRuntime;
    try {
      runtime = new ThreeRuntime(
        container.current,
        {
          getDocument: services.core.getSnapshot,
          getSession: services.runtimeSession,
          command: (c) => services.submit(c as Command),
          beginPreview: () => services.core.beginPreview(),
          preview: (token, c) => services.core.preview(token, c),
          cancelPreview: (token) => services.core.cancelPreview(token),
          activateTool: (tool) => services.session.set({ tool }),
          select: services.select,
          renderState: (state) => services.renderState.set(state),
          status: (key, params) => {
            // Snap transitions supplement the editing stage; pointer frames stay in runtime DOM.
            if (key.startsWith('snap.')) {
              const next = key === 'snap.none' ? '' : key;
              if (services.snapFeedback.get() !== next) {
                services.snapFeedback.set(next);
              }
              return;
            }
            const error = key.endsWith('.failed') || isRenderErrorStatus(key);
            if (key.startsWith('hint') && services.editHint.get() !== key) {
              services.editHint.set(key);
            }
            const previous = services.notice.get();
            if (previous.key !== key || previous.error !== error || params) {
              services.notice.set({ key, params, error });
            }
          },
        },
        viewportTokens(themeRef.current),
      );
    } catch (error) {
      services.notice.set({
        key: 'geometry.failed',
        params: { reason: String(error) },
        error: true,
      });
      return;
    }
    runtime.renderer.domElement.dataset.runtimeId = crypto.randomUUID();
    const detachRuntime = services.attachRuntime(runtime);
    if (services.rendererPreference.get() === 'webgpu') {
      void runtime.setRendererBackend('webgpu');
    }
    const unsub = services.core.subscribe((changes) =>
        runtime.sync(services.core.getSnapshot(), changes),
      ),
      unsubSession = services.session.subscribe(() => runtime.setSession()),
      unsubCamera = services.camera.subscribe(() => runtime.setSession());
    if (import.meta.env.DEV) {
      Object.assign(window, {
        __editor: {
          document: services.core.getSnapshot,
          session: services.session.getSnapshot,
          diagnostics: () => runtime.diagnostics(),
          project: (p: { x: number; y: number; z: number }) => runtime.worldToClient(p),
          history: () => services.core.getHistoryState(),
          snapshot: () => runtime.snapshot(),
        },
      });
    }
    return () => {
      unsub();
      unsubSession();
      unsubCamera();
      try {
        runtime.dispose();
      } finally {
        // Detach the disposed owner even when a GPU disposer reports a cleanup failure.
        detachRuntime();
      }
    };
  }, [services]);
  useEffect(
    () => services.runtimeRef.current?.setViewportTheme(viewportTokens(resolved)),
    [resolved, services],
  );
  useEffect(() => {
    services.runtimeRef.current?.renderer.domElement.setAttribute('aria-label', t('viewportLabel'));
    services.runtimeRef.current?.setSession();
  }, [t, services]);
  return (
    <div
      className="viewport"
      ref={container}
      data-testid="viewport-host"
      aria-label={t('app')}
      onPointerDownCapture={(event) => {
        if (event.target instanceof HTMLCanvasElement) {
          event.target.dataset.focusOrigin = 'pointer';
        }
      }}
      onKeyDownCapture={(event) => {
        if (event.target instanceof HTMLCanvasElement) {
          event.target.dataset.focusOrigin = 'keyboard';
        }
      }}
      onBlurCapture={(event) => {
        if (event.target instanceof HTMLCanvasElement) {
          delete event.target.dataset.focusOrigin;
        }
      }}
    >
      {doc.walls.length === 0 && doc.slabs.length === 0 && (
        <div className="viewport-empty">{t('empty')}</div>
      )}
      {session.wholeBuildingPreview && <div className="viewport-mode">{t('preview')}</div>}
    </div>
  );
}
