import { useId, useState } from 'react';
import { Button, Input, Field, FieldGroup, FieldLabel } from '@building/ui';
import {
  wallLength,
  defaultSurface,
  createId,
  type Wall,
  type Slab,
  type Opening,
  type SurfaceBinding,
  type Command,
} from '@building/editor-core';
import { deriveSurfacePaths } from '@building/building-geometry';
import { useEditor, useDocument, useSession, useSignal } from '../app/services';
import { builtInResources } from '../app/materials';
import { importImage } from '../platform';
import { useLanguage } from './i18n';
import { Numeric, Choice } from './fields';
import { useConfirm } from './confirm';
import { deletionContents } from '../app/deletion';

function WallFields({ wall }: { wall: Wall }) {
  const { submit } = useEditor(),
    { t } = useLanguage();
  const length = wallLength(wall);
  const update = (patch: Partial<Wall>) => submit({ type: 'update-wall', id: wall.id, patch });
  return (
    <FieldGroup>
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
      <Numeric label={t('height')} value={wall.height} onCommit={(v) => update({ height: v })} />
      <Numeric
        label={t('thickness')}
        value={wall.thickness}
        onCommit={(v) => update({ thickness: v })}
      />
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
    </FieldGroup>
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
    <FieldGroup>
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
      <Numeric
        label={t('elevation')}
        value={slab.elevation}
        onCommit={(v) => update({ elevation: v })}
      />
      <Numeric
        label={t('x')}
        value={x}
        onCommit={(v) => update({ polygon: slab.polygon.map((p) => ({ ...p, x: p.x + v - x })) })}
      />
      <Numeric
        label={t('z')}
        value={z}
        onCommit={(v) => update({ polygon: slab.polygon.map((p) => ({ ...p, z: p.z + v - z })) })}
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
    </FieldGroup>
  );
}
function OpeningFields({ opening }: { opening: Opening }) {
  const { submit, runtimeRef } = useEditor(),
    { t } = useLanguage();
  const update = (patch: Partial<Opening>) =>
    submit({ type: 'update-opening', id: opening.id, patch });
  return (
    <FieldGroup>
      <Numeric label={t('offset')} value={opening.offset} onCommit={(v) => update({ offset: v })} />
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
      {opening.kind === 'window' ? (
        <Numeric label={t('sill')} value={opening.sill} onCommit={(v) => update({ sill: v })} />
      ) : (
        <>
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
              onClick={() => runtimeRef.current?.animateDoor(opening.id, opening.closedAngle ?? 0)}
            >
              {t('closeDoor')}
            </Button>
          </div>
        </>
      )}
    </FieldGroup>
  );
}

function Materials({ object }: { object: Wall | Slab | Opening }) {
  const { submit, session, notice, busy } = useEditor(),
    doc = useDocument(),
    s = useSession(),
    { t } = useLanguage(),
    id = useId(),
    [group, setGroup] = useState(false),
    busyFlag = useSignalBusy(busy);
  const sides = 'polygon' in object ? ['top', 'bottom', 'edge'] : ['A', 'B', 'edge'];
  const side = sides.includes(s.selectedSurface ?? '') ? s.selectedSurface! : sides[0]!;
  const materials =
    object.materials ??
    ('wallId' in object ? doc.walls.find((w) => w.id === object.wallId)!.materials : undefined)!;
  const binding = materials[side as keyof typeof materials] as SurfaceBinding;
  const isEdge = side === 'edge';
  const path =
    'start' in object && !isEdge
      ? deriveSurfacePaths(doc).find((p) =>
          p.segments.some((seg) => seg.wallId === object.id && seg.side === side),
        )
      : undefined;
  const materialCommands = (next: SurfaceBinding): Command[] => {
    const targets =
      group && path
        ? path.segments.map((seg) => ({ id: seg.wallId, side: seg.side }))
        : [{ id: object.id, side }];
    const seen = new Set<string>();
    return targets
      .filter((target) => {
        const key = target.id + target.side;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .map((target) => ({
        type: 'set-material',
        objectId: target.id,
        side: target.side as 'A',
        binding: next,
      }));
  };
  const apply = (next: SurfaceBinding, resource?: (typeof doc.resources)[number]) => {
    const edits = materialCommands(next);
    const commands: Command[] = [];
    if (resource && !doc.resources.some((r) => r.id === resource.id)) {
      commands.push({ type: 'add-resource', resource });
    }
    commands.push(...edits);
    const ok = submit(commands.length === 1 ? commands[0]! : { type: 'batch', commands });
    if (ok && group) {
      notice.set({ key: 'materialGroupChanged', params: { count: edits.length }, error: false });
    }
    return ok;
  };
  const change = (patch: Partial<SurfaceBinding>) => apply({ ...binding, ...patch });
  const chooseResource = (resourceId: string) => {
    if (resourceId === 'solid') {
      change({ resourceId: undefined });
      return;
    }
    const resource =
      builtInResources.find((r) => r.id === resourceId) ??
      doc.resources.find((r) => r.id === resourceId);
    if (resource) {
      apply({ ...binding, resourceId, color: defaultSurface().color }, resource);
    }
  };
  const importTexture = async () => {
    busy.set(true);
    try {
      const resource = await importImage();
      if (resource) {
        apply({ ...binding, resourceId: resource.id }, resource);
      }
    } catch (error) {
      notice.set({
        key:
          typeof error === 'object' && error && 'code' in error
            ? String(error.code)
            : 'resource.failed',
        error: true,
      });
    } finally {
      busy.set(false);
    }
  };
  const continuity = () => {
    if (!('start' in object) || isEdge || !path) {
      return;
    }
    const old =
      doc.continuity.find((g) => g.id === path.id) ??
      doc.continuity.find((g) => g.members.some((m) => m.wallId === object.id && m.side === side));
    const endpoint = { wallId: object.id, side: side as 'A' | 'B', endpoint: 'start' as const };
    const seen = new Set<string>();
    const members = path.segments
      .filter((seg) => {
        const key = seg.wallId + seg.side;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .map((seg) => ({ wallId: seg.wallId, side: seg.side, direction: 1 as const }));
    if (
      submit({
        type: 'set-continuity',
        group: {
          id: old?.id ?? createId('continuity'),
          members,
          anchor: old?.anchor ?? endpoint,
          verticalOrigin: old?.verticalOrigin ?? 0,
          seam: endpoint,
        },
      })
    ) {
      notice.set({ key: 'seamSet', error: false });
    }
  };
  return (
    <section className="property-section">
      <h3>{t('material')}</h3>
      <FieldGroup>
        <Choice
          label={t('surface')}
          value={side}
          options={sides.map((value) => ({ value, label: t(value) }))}
          onChange={(v) => session.set({ selectedSurface: v as 'A' })}
        />
        <Field>
          <FieldLabel htmlFor={id}>{t('color')}</FieldLabel>
          <Input
            id={id}
            type="color"
            value={binding.color}
            onChange={(e) => change({ color: e.target.value })}
          />
        </Field>
        {!isEdge && (
          <>
            <Choice
              label={t('image')}
              value={binding.resourceId ?? 'solid'}
              options={[
                { value: 'solid', label: t('solid') },
                ...builtInResources.map((r) => ({ value: r.id, label: t(r.name) })),
                ...doc.resources
                  .filter((r) => !r.id.startsWith('builtin_'))
                  .map((r) => ({ value: r.id, label: r.name })),
              ]}
              onChange={chooseResource}
            />
            {binding.resourceId && (
              <img
                className="material-preview"
                src={
                  (
                    doc.resources.find((r) => r.id === binding.resourceId) ??
                    builtInResources.find((r) => r.id === binding.resourceId)
                  )?.dataUrl
                }
                alt={t('image')}
              />
            )}
            <Button variant="outline" disabled={busyFlag} onClick={() => void importTexture()}>
              {t('importImage')}
            </Button>
            <Numeric
              label={t('tileWidth')}
              value={binding.tileWidth}
              onCommit={(v) => change({ tileWidth: v })}
            />
            <Numeric
              label={t('tileHeight')}
              value={binding.tileHeight}
              onCommit={(v) => change({ tileHeight: v })}
            />
            <Numeric
              label={t('rotation')}
              value={binding.rotation}
              onCommit={(v) => change({ rotation: v })}
            />
            <Numeric
              label={t('offsetX')}
              value={binding.offsetX}
              onCommit={(v) => change({ offsetX: v })}
            />
            <Numeric
              label={t('offsetY')}
              value={binding.offsetY}
              onCommit={(v) => change({ offsetY: v })}
            />
            <Button
              variant="outline"
              onClick={() =>
                change({ tileWidth: 0.5, tileHeight: 0.5, rotation: 0, offsetX: 0, offsetY: 0 })
              }
            >
              {t('resetTile')}
            </Button>
            {'start' in object && (
              <>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={group}
                    onChange={(e) => setGroup(e.target.checked)}
                  />
                  {t('group')}
                </label>
                <Button variant="outline" onClick={continuity}>
                  {t('seam')}
                </Button>
                <p className="muted">{t('seamInfo')}</p>
                {path && (
                  <p className="muted texture-route" data-testid="texture-route">
                    {t('routeInfo', {
                      route: path.segments
                        .map(
                          (seg) =>
                            `${t('wall')} ${doc.walls.findIndex((w) => w.id === seg.wallId) + 1} ${seg.side}`,
                        )
                        .join(' → '),
                    })}
                  </p>
                )}
              </>
            )}
          </>
        )}
      </FieldGroup>
    </section>
  );
}
function useSignalBusy(signal: ReturnType<typeof useEditor>['busy']) {
  return useSignal(signal);
}
export function Inspector() {
  const services = useEditor(),
    doc = useDocument(),
    s = useSession(),
    { t } = useLanguage(),
    confirm = useConfirm();
  const object = [...doc.walls, ...doc.slabs, ...doc.openings].find((o) => o.id === s.selectedId);
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
            {t(
              'start' in object
                ? 'wall'
                : 'polygon' in object
                  ? object.purpose === 'roof'
                    ? 'roof'
                    : 'slab'
                  : object.kind,
            )}
            <Button size="sm" variant="destructive" onClick={() => void remove()}>
              {t('delete')}
            </Button>
          </div>
          <section className="property-section">
            {'start' in object ? (
              <WallFields wall={object} />
            ) : 'polygon' in object ? (
              <SlabFields slab={object} />
            ) : (
              <OpeningFields opening={object} />
            )}
          </section>
          <Materials object={object} />
        </div>
      ) : (
        <p className="muted panel-description">{t('noSelection')}</p>
      )}
    </aside>
  );
}
