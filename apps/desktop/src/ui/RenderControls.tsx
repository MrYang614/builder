import { ImageDown, Pause, Play, Square } from 'lucide-react';
import { Button } from '@building/ui';
import { useEditor, useSignal } from '../app/services';
import { savePNG } from '../platform';
import { useLanguage } from './i18n';
import { RenderDialog } from './RenderDialog';

/** Runtime lifecycle actions use the existing render owner; sampling never writes project history. */
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
          <Button.Icon
            size="sm"
            variant="ghost"
            icon={state.pathStatus === 'paused' ? Play : Pause}
            label={t(state.pathStatus === 'paused' ? 'render.resume' : 'render.pause')}
            disabled={transitionBusy}
            onClick={() => runtimeRef.current?.pausePathTracing(state.pathStatus !== 'paused')}
          />
          <Button.Icon
            size="sm"
            variant="ghost"
            icon={Square}
            label={t('render.raster')}
            disabled={isBusy || state.switching}
            onClick={() => void runtimeRef.current?.setPathTracing(false)}
          />
          <Button.Icon
            size="sm"
            variant="ghost"
            icon={ImageDown}
            label={t('render.exportPNG')}
            disabled={isBusy || state.samples < 1 || transitionBusy || state.environmentLoading}
            onClick={() => void save()}
          />
        </>
      )}
    </div>
  );
}
