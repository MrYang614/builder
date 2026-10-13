import { Plus } from 'lucide-react';
import { Button, Form } from '@building/ui';
import { createId, type Command } from '@building/editor-core';
import { useEditor, useDocument, useSession } from '../app/services';
import { deletionContents } from '../app/deletion';
import { Numeric, TextField } from './fields';
import { useConfirm } from './confirm';
import { useLanguage } from './i18n';

// Floors renders level navigation and object selection.
export function Floors() {
  const { core, session, submit } = useEditor(),
    doc = useDocument(),
    s = useSession(),
    { t } = useLanguage(),
    confirm = useConfirm();
  const level = doc.levels.find((l) => l.id === s.currentLevelId)!;
  const add = () => {
    const last = [...doc.levels].sort((a, b) => a.elevation - b.elevation).at(-1)!;
    const id = createId('level');
    if (
      submit({
        type: 'add-level',
        level: {
          id,
          name: String(doc.levels.length + 1),
          elevation: last.elevation + last.height,
          height: 3,
        },
      })
    ) {
      session.set({ currentLevelId: id, selectedId: undefined, selectedSurface: undefined });
    }
  };
  const remove = async () => {
    if ((await confirm('deleteImpact', false, deletionContents(doc, level.id))) === 'confirm') {
      submit({ type: 'delete-level', id: level.id });
    }
  };
  const objects = [...doc.walls, ...doc.slabs, ...doc.openings].filter(
    (o) => o.levelId === s.currentLevelId,
  );
  return (
    <aside className="floors" aria-label={t('levels')}>
      <div className="panel-heading">
        <h2>{t('levels')}</h2>
        <Button.Icon
          size="sm"
          variant="ghost"
          label={t('addLevel')}
          icon={Plus}
          onClick={add}
          disabled={s.wholeBuildingPreview}
        />
      </div>
      <div className="floor-list">
        {doc.levels.map((l) => (
          <Button
            key={l.id}
            variant={l.id === level.id ? 'secondary' : 'ghost'}
            width="full"
            alignment="between"
            suffix={l.elevation.toFixed(2) + ' m'}
            onClick={() => {
              session.set({
                currentLevelId: l.id,
                selectedId: undefined,
                selectedSurface: undefined,
              });
            }}
          >
            {l.name}
          </Button>
        ))}
      </div>
      <section className="level-fields" key={level.id}>
        <Form.Group>
          <TextField
            label={t('name')}
            value={level.name}
            onCommit={(name) => submit({ type: 'update-level', id: level.id, patch: { name } })}
          />
          <Numeric
            label={t('levelElevation')}
            value={level.elevation}
            onCommit={(v) =>
              submit({ type: 'update-level', id: level.id, patch: { elevation: v } })
            }
          />
          <Numeric
            label={t('levelHeight')}
            value={level.height}
            onCommit={asyncLevelHeight(submit, level.id)}
          />
          <p className="muted">{t('levelShift')}</p>
          <Button
            variant="outline"
            disabled={doc.levels.length === 1 || s.wholeBuildingPreview}
            onClick={() => void remove()}
          >
            {t('deleteLevel')}
          </Button>
        </Form.Group>
      </section>
      <section className="object-list">
        <h3>{t('objects')}</h3>
        <p className="muted">{t('objectCount', { count: objects.length })}</p>
        {objects.map((o, i) => (
          <Button
            key={o.id}
            size="sm"
            variant={s.selectedId === o.id ? 'secondary' : 'ghost'}
            width="full"
            alignment="start"
            onClick={() => session.set({ selectedId: o.id, selectedSurface: undefined })}
          >
            {t(
              'start' in o
                ? 'wall'
                : 'polygon' in o
                  ? o.purpose === 'roof'
                    ? 'roof'
                    : 'slab'
                  : o.kind,
            )}{' '}
            {i + 1}
          </Button>
        ))}
      </section>
      <span className="muted floor-version">
        {core.getSnapshot().schemaVersion === 1 ? t('schema') : ''}
      </span>
    </aside>
  );
}
function asyncLevelHeight(submit: (c: Command) => boolean, id: string) {
  return (height: number) =>
    submit({ type: 'update-level', id, patch: { height }, moveAbove: true });
}
