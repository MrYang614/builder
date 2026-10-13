import { Play, Sparkles } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
  FieldGroup,
  FieldSet,
} from '@building/ui';
import { useEditor, useSignal } from '../app/services';
import { Choice } from './fields';
import { useLanguage } from './i18n';

/** Keeps sampling configuration beside its entry point; the runtime owns each render session. */
export function RenderDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const services = useEditor(),
    state = useSignal(services.renderState),
    busy = useSignal(services.busy),
    notice = useSignal(services.notice),
    { t } = useLanguage();
  const pathActive = state.mode === 'pathtrace';
  const starting = state.switching || state.pathStatus === 'building';
  const error = state.error;

  /** Leaves a failed start visible for retry and closes only after the runtime accepts the session. */
  const start = async () => {
    const runtime = services.runtimeRef.current;
    if (!runtime || busy || starting || state.environmentLoading || pathActive) {
      return;
    }
    if (services.notice.get().key === 'render.pathFailed') {
      services.notice.set({ key: 'hintSelect', error: false });
    }
    await runtime.setPathTracing(true);
    if (services.renderState.get().mode === 'pathtrace') {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={busy || starting}>
          <Sparkles aria-hidden="true" />
          {t('render.open')}
        </Button>
      </DialogTrigger>
      <DialogContent className="render-dialog" showCloseButton={false}>
        <DialogTitle>{t('render.open')}</DialogTitle>
        <DialogDescription>{t('render.dialogDescription')}</DialogDescription>
        <FieldSet disabled={busy || starting}>
          <FieldGroup>
            <Choice
              label={t('render.samplesLabel')}
              value={String(state.targetSamples)}
              options={[16, 64, 128, 256, 512].map((value) => ({
                value: String(value),
                label: String(value),
              }))}
              onChange={(value) => services.runtimeRef.current?.setPathSamples(Number(value))}
            />
            <p className="render-hint">{t('render.pathHint')}</p>
            {state.environmentLoading && <output>{t('render.loading')}</output>}
            {starting && <output>{t('render.building')}</output>}
            {error && (
              <p role="alert" className="render-error">
                {t(error, notice.key === error ? notice.params : { reason: '' })}
              </p>
            )}
          </FieldGroup>
        </FieldSet>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('close')}
          </Button>
          {!pathActive && (
            <Button
              disabled={busy || starting || state.environmentLoading}
              onClick={() => void start()}
            >
              <Play aria-hidden="true" />
              {t('render.start')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
