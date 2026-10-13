import { ImageDown, Pause, Play, Square } from 'lucide-react';
import { Button } from '@building/ui';
import { useEditor, useSignal } from '../app/services';
import { savePNG } from '../platform';
import { useLanguage } from './i18n';
import { RenderDialog } from './RenderDialog';

// RenderControls exposes path tracing lifecycle actions and sample progress.
export function RenderControls({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { runtimeRef, busy, renderState, notice } = useEditor();
  const state = useSignal(renderState),
    isBusy = useSignal(busy),
    { t } = useLanguage();
  const save = async () => {
    if (busy.get() || state.samples < 1 || state.pathStatus === 'building') {
      return;
    }
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    busy.set(true);
    try {
      if (await savePNG(await runtime.capturePNG())) {
        notice.set({ key: 'render.pngSaved', error: false });
      }
    } catch (error) {
      const key =
        error instanceof Error && error.message.startsWith('render.')
          ? error.message
          : 'render.captureFailed';
      notice.set({ key, error: true, params: { reason: String(error) } });
    } finally {
      busy.set(false);
    }
  };
  const pathActive = state.mode === 'pathtrace';
  const transitionBusy = state.switching || state.pathStatus === 'building';
  return (
    <div className="render-controls" aria-label={t('render.title')}>
      <RenderDialog open={open} onOpenChange={onOpenChange} />
      {pathActive && (
        <>
          <output className="render-sample-readout" aria-live="off">
            {t(`render.${state.pathStatus}`)} ·{' '}
            {t('render.samples', {
              samples: Math.floor(state.samples),
              target: state.targetSamples,
            })}
          </output>
          <Button
            size="sm"
            variant="outline"
            disabled={transitionBusy}
            onClick={() => runtimeRef.current?.pausePathTracing(state.pathStatus !== 'paused')}
          >
            {state.pathStatus === 'paused' ? (
              <Play aria-hidden="true" />
            ) : (
              <Pause aria-hidden="true" />
            )}
            {t(state.pathStatus === 'paused' ? 'render.resume' : 'render.pause')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isBusy || state.switching}
            onClick={() => void runtimeRef.current?.setPathTracing(false)}
          >
            <Square aria-hidden="true" />
            {t('render.raster')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isBusy || state.samples < 1 || transitionBusy || state.environmentLoading}
            onClick={() => void save()}
          >
            <ImageDown aria-hidden="true" />
            {t('render.exportPNG')}
          </Button>
        </>
      )}
    </div>
  );
}
