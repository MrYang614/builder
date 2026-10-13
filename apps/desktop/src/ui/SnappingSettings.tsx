import type { SnapMode } from '@building/editor-core';
import { Form } from '@building/ui';
import { useEditor, useSession } from '../app/services';
import { Choice, Numeric } from './fields';
import { useLanguage } from './i18n';

/** Edits session-only snap policy without issuing a project or history command. */
export function SnappingSettings() {
  const { session } = useEditor(),
    { snap } = useSession(),
    { t } = useLanguage();
  const modes: Exclude<SnapMode, 'off'>[] = ['all', 'points', 'lines', 'grid'];
  return (
    <Form.Section title={t('snapSettings')}>
      <p className="render-hint">{t('snapHint')}</p>
      <Form.Group>
        <Choice
          label={t('snapMode')}
          value={snap.mode}
          options={modes.map((value) => ({ value, label: t(`snapMode.${value}`) }))}
          onChange={(value) => session.set({ snap: { ...snap, mode: value as SnapMode } })}
        />
        <Numeric
          label={t('snapTolerance')}
          value={snap.tolerance}
          onCommit={(value) => {
            if (value <= 0 || value > 1) {
              return false;
            }
            session.set({ snap: { ...snap, tolerance: value } });
          }}
        />
        <Numeric
          label={t('snapGridSize')}
          value={snap.gridSize}
          onCommit={(value) => {
            if (value <= 0 || value > 10) {
              return false;
            }
            session.set({ snap: { ...snap, gridSize: value } });
          }}
        />
      </Form.Group>
    </Form.Section>
  );
}
