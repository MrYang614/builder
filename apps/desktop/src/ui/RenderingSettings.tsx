import { useId } from 'react';
import { Button, FieldSet, FieldLegend, FieldGroup, Input } from '@building/ui';
import type { Command, EnvironmentSettings } from '@building/editor-core';
import { useEditor, useDocument, useSession, useSignal } from '../app/services';
import { importEnvironment } from '../platform';
import { Choice, Numeric } from './fields';
import { useLanguage } from './i18n';

const emptyEnvironment = (): EnvironmentSettings => ({
  intensity: 1,
  rotation: 0,
  background: false,
});
export function RenderingSettings() {
  const backgroundId = useId();
  const services = useEditor(),
    doc = useDocument(),
    session = useSession(),
    { t } = useLanguage();
  const state = useSignal(services.renderState),
    busy = useSignal(services.busy),
    notice = useSignal(services.notice);
  const error = notice.error ? notice : state.error ? { key: state.error, error: true } : null;
  const environment = doc.environment ?? emptyEnvironment();
  const resource = doc.environmentResources?.find((item) => item.id === environment.resourceId);
  const failure = (error: unknown) => {
    const key =
      typeof error === 'object' && error && 'code' in error
        ? String(error.code)
        : error instanceof Error && error.message.startsWith('render.')
          ? error.message
          : 'render.environmentFailed';
    services.notice.set({ key, error: true, params: { reason: String(error) } });
  };
  const submitEnvironment = (command: Command) => {
    const accepted = services.submit(command);
    if (accepted) {
      services.notice.set({ key: 'render.environmentUpdated', error: false });
    }
    return accepted;
  };
  const updateEnvironment = (patch: Partial<EnvironmentSettings>) =>
    submitEnvironment({ type: 'set-environment', environment: { ...environment, ...patch } });
  const importPanorama = async () => {
    if (services.busy.get()) {
      return;
    }
    services.busy.set(true);
    const projectId = doc.id;
    try {
      const image = await importEnvironment();
      if (!image) {
        return;
      }
      if (services.core.getSnapshot().id !== projectId) {
        throw new Error('render.projectChanged');
      }
      const current = services.core.getSnapshot();
      const existing = current.environmentResources?.some((item) => item.id === image.id);
      submitEnvironment({
        type: 'batch',
        commands: [
          ...(existing ? [] : [{ type: 'add-environment-resource' as const, resource: image }]),
          {
            type: 'set-environment',
            environment: { ...(current.environment ?? emptyEnvironment()), resourceId: image.id },
          },
        ],
      });
    } catch (error) {
      failure(error);
    } finally {
      services.busy.set(false);
    }
  };
  return (
    <>
      <FieldSet disabled={state.switching || busy}>
        <FieldLegend>{t('render.title')}</FieldLegend>
        <FieldGroup>
          {state.switching && <output>{t('render.switching')}</output>}
          <Choice
            label={t('render.samplesLabel')}
            value={String(state.targetSamples)}
            options={[16, 64, 128, 256, 512].map((value) => ({
              value: String(value),
              label: String(value),
            }))}
            onChange={(value) => services.runtimeRef.current?.setPathSamples(Number(value))}
          />
          <p className="render-hint">{t('render.settingsHint')}</p>
        </FieldGroup>
      </FieldSet>
      <FieldSet disabled={busy || state.mode === 'pathtrace' || !state.postProcessing.available}>
        <FieldLegend>{t('render.postProcessing')}</FieldLegend>
        <FieldGroup>
          <label className="checkbox-label render-check">
            <Input
              type="checkbox"
              checked={state.postProcessing.gtao}
              onChange={(event) =>
                services.runtimeRef.current?.setGTAOEnabled(event.target.checked)
              }
            />
            {t('render.gtao')}
          </label>
          <label className="checkbox-label render-check">
            <Input
              type="checkbox"
              checked={state.postProcessing.taa}
              onChange={(event) => services.runtimeRef.current?.setTAAEnabled(event.target.checked)}
            />
            {t('render.taa')}
          </label>
          <p className="render-hint">{t('render.postProcessingHint')}</p>
          {!state.postProcessing.available && (
            <output>{t('render.postProcessingUnavailable')}</output>
          )}
        </FieldGroup>
      </FieldSet>
      <FieldSet disabled={busy || session.wholeBuildingPreview}>
        <FieldLegend>{t('render.environment')}</FieldLegend>
        <FieldGroup>
          {(doc.environmentResources?.length ?? 0) > 0 && (
            <Choice
              label={t('render.environment')}
              value={environment.resourceId ?? 'none'}
              options={[
                { value: 'none', label: t('render.noEnvironment') },
                ...(doc.environmentResources ?? []).map((item) => ({
                  value: item.id,
                  label: item.name,
                })),
              ]}
              onChange={(value) =>
                updateEnvironment({ resourceId: value === 'none' ? undefined : value })
              }
            />
          )}
          <p className="render-hint">{t('render.environmentHint')}</p>
          <div className="render-actions">
            <Button variant="outline" onClick={() => void importPanorama()}>
              {t('render.importEnvironment')}
            </Button>
            <Button
              variant="outline"
              disabled={!resource}
              onClick={() => updateEnvironment({ resourceId: undefined })}
            >
              {t('render.clearEnvironment')}
            </Button>
            {resource && (
              <Button
                variant="ghost"
                onClick={() =>
                  submitEnvironment({
                    type: 'batch',
                    commands: [
                      {
                        type: 'set-environment',
                        environment: { ...environment, resourceId: undefined },
                      },
                      { type: 'delete-environment-resource', id: resource.id },
                    ],
                  })
                }
              >
                {t('render.deleteEnvironment')}
              </Button>
            )}
          </div>
          <Numeric
            label={t('render.intensity')}
            value={environment.intensity}
            onCommit={(intensity) => updateEnvironment({ intensity })}
          />
          <Numeric
            label={t('render.rotation')}
            value={environment.rotation}
            onCommit={(rotation) => updateEnvironment({ rotation })}
          />
          <label htmlFor={backgroundId} className="checkbox-label render-check">
            <Input
              id={backgroundId}
              type="checkbox"
              checked={environment.background}
              onChange={(event) => updateEnvironment({ background: event.target.checked })}
            />
            {t('render.background')}
          </label>
          {state.environmentLoading && <output>{t('render.loading')}</output>}
        </FieldGroup>
      </FieldSet>
      {error && (
        <p role="alert" className="render-error">
          {t(error.key, 'params' in error ? error.params : { reason: '' })}
        </p>
      )}
    </>
  );
}
