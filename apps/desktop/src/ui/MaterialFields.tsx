import { useState } from 'react';
import { Button, Checkbox, Input, Form } from '@building/ui';
import {
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
import { builtInResources, findMaterialResource } from '../app/materials';
import { importImage } from '../platform';
import { useLanguage } from './i18n';
import { Numeric, Choice } from './fields';

/** Owns selected-face material commands, resource import and continuity editing. */
export function MaterialFields({ object }: { object: Wall | Slab | Opening }) {
  const { core, submit, session, notice, busy } = useEditor(),
    doc = useDocument(),
    s = useSession(),
    { t } = useLanguage(),
    [group, setGroup] = useState(false),
    busyFlag = useSignal(busy);
  const sides = 'polygon' in object ? ['top', 'bottom', 'edge'] : ['A', 'B', 'edge'];
  const side = sides.includes(s.selectedSurface ?? '') ? s.selectedSurface! : sides[0]!;
  const materials =
    object.materials ??
    ('wallId' in object ? doc.walls.find((w) => w.id === object.wallId)!.materials : undefined)!;
  const binding = materials[side as keyof typeof materials] as SurfaceBinding;
  const isEdge = side === 'edge';
  const previewResource = findMaterialResource(doc.resources, binding.resourceId);
  const path =
    'start' in object && !isEdge
      ? deriveSurfacePaths(doc).find((p) =>
          p.segments.some((seg) => seg.wallId === object.id && seg.side === side),
        )
      : undefined;
  const materialCommands = (next: SurfaceBinding): Command[] => {
    const currentPath =
      group && 'start' in object && !isEdge
        ? deriveSurfacePaths(core.getSnapshot()).find((candidate) =>
            candidate.segments.some(
              (segment) => segment.wallId === object.id && segment.side === side,
            ),
          )
        : path;
    const targets =
      group && currentPath
        ? currentPath.segments.map((seg) => ({ id: seg.wallId, side: seg.side }))
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
    if (resource && !core.getSnapshot().resources.some((r) => r.id === resource.id)) {
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
    if (busy.get()) {
      return;
    }
    busy.set(true);
    try {
      const resource = await importImage();
      if (resource) {
        const current = core.getSnapshot();
        if (current.id !== doc.id) {
          notice.set({ key: 'render.projectChanged', error: true });
          return;
        }
        const target = [...current.walls, ...current.slabs, ...current.openings].find(
          (item) => item.id === object.id,
        );
        const currentMaterials =
          target?.materials ??
          (target && 'wallId' in target
            ? current.walls.find((wall) => wall.id === target.wallId)?.materials
            : undefined);
        // Resource decoding may finish after another face property edit; preserve that edit.
        const latest = currentMaterials?.[side as keyof typeof currentMaterials] ?? binding;
        apply({ ...latest, resourceId: resource.id }, resource);
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
      <Form.Group>
        <Choice
          label={t('surface')}
          value={side}
          options={sides.map((value) => ({ value, label: t(value) }))}
          onChange={(v) => session.set({ selectedSurface: v as 'A' })}
        />
        <Form.Item label={t('color')}>
          <Input type="color" value={binding.color} onValueChange={(color) => change({ color })} />
        </Form.Item>
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
                src={previewResource?.dataUrl}
                alt={previewResource?.name ?? t('image')}
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
                <Checkbox label={t('group')} checked={group} onCheckedChange={setGroup} />
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
      </Form.Group>
    </section>
  );
}
