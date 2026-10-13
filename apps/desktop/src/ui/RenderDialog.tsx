import { Play, Sparkles } from 'lucide-react';
import { Button, Dialog, Form } from '@building/ui';
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
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('render.open')}
      description={t('render.dialogDescription')}
      closeLabel={t('close')}
      showCloseButton={false}
      trigger={
        <Button size="sm" icon={Sparkles} disabled={busy || starting}>
          {t('render.open')}
        </Button>
      }
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('close')}
          </Button>
          {!pathActive && (
            <Button
              icon={Play}
              disabled={busy || starting || state.environmentLoading}
              loading={starting}
              onClick={() => void start()}
            >
              {t('render.start')}
            </Button>
          )}
        </>
      }
    >
      <Form.Section disabled={busy || starting}>
        <Form.Group>
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
        </Form.Group>
      </Form.Section>
    </Dialog>
  );
}
