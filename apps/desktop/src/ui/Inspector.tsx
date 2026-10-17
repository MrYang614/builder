import { MousePointer2, Trash2 } from 'lucide-react';
import { Button, Form } from '@building/ui';
import { wallLength, type Wall, type Slab, type Opening } from '@building/editor-core';
import { useEditor, useDocument, useSession } from '../app/services';
import { MaterialFields } from './MaterialFields';
import { useLanguage } from './i18n';
import { Numeric, Choice } from './fields';
import { useConfirm } from './confirm';
import { deletionContents } from '../app/deletion';
import { PanelSection } from './PanelSection';
import { sceneObjectPresentation } from './scene-objects';
import './panels.css';

function WallFields({ wall }: { wall: Wall }) {
  const { submit } = useEditor(),
    { t } = useLanguage();
  const length = wallLength(wall);
  const update = (patch: Partial<Wall>) => submit({ type: 'update-wall', id: wall.id, patch });
  return (
    <>
      <PanelSection title={t('panel.dimensions')}>
        <Form.Group>
          <Numeric
            label={t('length')}
            value={length}
            onCommit={(v) =>
              update({
                end: {
                  x: wall.start.x + ((wall.end.x - wall.start.x) * v) / length,
                  z: wall.start.z + ((wall.end.z - wall.start.z) * v) / length,
                },
              })
            }
          />
          <Numeric
            label={t('height')}
            value={wall.height}
            onCommit={(v) => update({ height: v })}
          />
          <Numeric
            label={t('thickness')}
            value={wall.thickness}
            onCommit={(v) => update({ thickness: v })}
          />
        </Form.Group>
      </PanelSection>
      <PanelSection title={t('panel.placement')}>
        <Form.Group>
          <Numeric
            label={t('startX')}
            value={wall.start.x}
            onCommit={(v) =>
              update({
                start: { ...wall.start, x: v },
                end: { ...wall.end, x: wall.end.x + v - wall.start.x },
              })
            }
          />
          <Numeric
            label={t('startZ')}
            value={wall.start.z}
            onCommit={(v) =>
              update({
                start: { ...wall.start, z: v },
                end: { ...wall.end, z: wall.end.z + v - wall.start.z },
              })
            }
          />
        </Form.Group>
      </PanelSection>
    </>
  );
}
function SlabFields({ slab }: { slab: Slab }) {
  const { submit, session } = useEditor(),
    { t } = useLanguage();
  const xs = slab.polygon.map((p) => p.x),
    zs = slab.polygon.map((p) => p.z),
    x = Math.min(...xs),
    z = Math.min(...zs),
    width = Math.max(...xs) - x,
    depth = Math.max(...zs) - z;
  const update = (patch: Partial<Slab>) => submit({ type: 'update-slab', id: slab.id, patch });
  return (
    <>
      <PanelSection title={t('panel.dimensions')}>
        <Form.Group>
          <Choice
            label={t('purpose')}
            value={slab.purpose}
            options={['floor', 'roof'].map((value) => ({ value, label: t(value) }))}
            onChange={(v) => update({ purpose: v as Slab['purpose'] })}
          />
          <Numeric
            label={t('width')}
            value={width}
            onCommit={(v) =>
              update({ polygon: slab.polygon.map((p) => ({ ...p, x: p.x === x ? x : x + v })) })
            }
          />
          <Numeric
            label={t('depth')}
            value={depth}
            onCommit={(v) =>
              update({ polygon: slab.polygon.map((p) => ({ ...p, z: p.z === z ? z : z + v })) })
            }
          />
          <Numeric
            label={t('thickness')}
            value={slab.thickness}
            onCommit={(v) => update({ thickness: v })}
          />
        </Form.Group>
      </PanelSection>
      <PanelSection title={t('panel.placement')}>
        <Form.Group>
          <Numeric
            label={t('elevation')}
            value={slab.elevation}
            onCommit={(v) => update({ elevation: v })}
          />
          <Numeric
            label={t('x')}
            value={x}
            onCommit={(v) =>
              update({ polygon: slab.polygon.map((p) => ({ ...p, x: p.x + v - x })) })
            }
          />
          <Numeric
            label={t('z')}
            value={z}
            onCommit={(v) =>
              update({ polygon: slab.polygon.map((p) => ({ ...p, z: p.z + v - z })) })
            }
          />
          {slab.purpose === 'roof' && (
            <Button
              variant="outline"
              onClick={() => {
                const s = session.getSnapshot();
                session.set({
                  hiddenIds: s.hiddenIds.includes(slab.id)
                    ? s.hiddenIds.filter((id) => id !== slab.id)
                    : [...s.hiddenIds, slab.id],
                });
              }}
            >
              {t(session.getSnapshot().hiddenIds.includes(slab.id) ? 'showRoof' : 'hideRoof')}
            </Button>
          )}
        </Form.Group>
      </PanelSection>
    </>
  );
}
function OpeningFields({ opening }: { opening: Opening }) {
  const { submit, runtimeRef } = useEditor(),
    { t } = useLanguage();
  const update = (patch: Partial<Opening>) =>
    submit({ type: 'update-opening', id: opening.id, patch });
  return (
    <>
      <PanelSection title={t('panel.dimensions')}>
        <Form.Group>
          <Numeric
            label={t('offset')}
            value={opening.offset}
            onCommit={(v) => update({ offset: v })}
          />
          <Numeric
            label={t('holeWidth')}
            value={opening.width}
            onCommit={(v) => update({ width: v })}
          />
          <Numeric
            label={t('holeHeight')}
            value={opening.height}
            onCommit={(v) => update({ height: v })}
          />
          {opening.kind === 'window' && (
            <Numeric label={t('sill')} value={opening.sill} onCommit={(v) => update({ sill: v })} />
          )}
        </Form.Group>
      </PanelSection>
      {opening.kind === 'door' && (
        <PanelSection title={t('panel.doorMotion')}>
          <Form.Group>
            <Choice
              label={t('hinge')}
              value={opening.hinge}
              options={['left', 'right'].map((value) => ({ value, label: t(value) }))}
              onChange={(v) => update({ hinge: v as Opening['hinge'] })}
            />
            <Choice
              label={t('direction')}
              value={String(opening.direction)}
              options={[
                { value: '1', label: t('A') },
                { value: '-1', label: t('B') },
              ]}
              onChange={(v) => update({ direction: Number(v) as 1 | -1 })}
            />
            <Numeric
              label={t('angle')}
              value={opening.angle}
              onCommit={(v) => update({ angle: v })}
            />
            <Numeric
              label={t('closedAngle')}
              value={opening.closedAngle ?? 0}
              onCommit={(v) => update({ closedAngle: v })}
            />
            <Numeric
              label={t('openAngle')}
              value={opening.openAngle}
              onCommit={(v) => update({ openAngle: v })}
            />
            <Numeric
              label={t('duration')}
              value={opening.duration}
              onCommit={(v) => update({ duration: v })}
            />
            <div className="inline-actions">
              <Button
                variant="outline"
                onClick={() => runtimeRef.current?.animateDoor(opening.id, opening.openAngle)}
              >
                {t('openDoor')}
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  runtimeRef.current?.animateDoor(opening.id, opening.closedAngle ?? 0)
                }
              >
                {t('closeDoor')}
              </Button>
            </div>
          </Form.Group>
        </PanelSection>
      )}
    </>
  );
}

/** Selected entities expose their own command-backed fields without storing another document copy. */
export function Inspector() {
  const services = useEditor(),
    doc = useDocument(),
    s = useSession(),
    { t } = useLanguage(),
    confirm = useConfirm();
  const object = [...doc.walls, ...doc.slabs, ...doc.openings].find((o) => o.id === s.selectedId);
  const presentation = object ? sceneObjectPresentation(object) : undefined;
  const SelectionIcon = presentation?.icon ?? MousePointer2;
  const objects = [...doc.walls, ...doc.slabs, ...doc.openings].filter(
    (item) => item.levelId === s.currentLevelId,
  );
  const remove = async () => {
    if (!object) {
      return;
    }
    if ((await confirm('deleteImpact', false, deletionContents(doc, object.id))) !== 'confirm') {
      return;
    }
    const type =
      'start' in object ? 'delete-wall' : 'polygon' in object ? 'delete-slab' : 'delete-opening';
    services.submit({ type, id: object.id });
  };
  return (
    <aside className="inspector" aria-label={t('properties')}>
      <h2>{t('properties')}</h2>
      {object ? (
        <div key={object.id} className="inspector-content">
          <div className="selection-title">
            <span className="selection-name">
              <SelectionIcon aria-hidden="true" />
              <span>
                {t(presentation!.label)} {objects.findIndex((item) => item.id === object.id) + 1}
              </span>
            </span>
            <Button.Icon
              size="sm"
              variant="danger-ghost"
              icon={Trash2}
              label={t('delete')}
              onClick={() => void remove()}
            />
          </div>
          <div className="entity-fields">
            {'start' in object ? (
              <WallFields wall={object} />
            ) : 'polygon' in object ? (
              <SlabFields slab={object} />
            ) : (
              <OpeningFields opening={object} />
            )}
          </div>
          <MaterialFields object={object} />
        </div>
      ) : (
        <div className="inspector-empty">
          <MousePointer2 aria-hidden="true" />
          <p>{t('noSelection')}</p>
        </div>
      )}
    </aside>
  );
}
