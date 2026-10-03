import { describe, expect, it } from 'vitest';
import {
  EditorCore,
  SessionStore,
  ToolStateMachine,
  RevisionGate,
  createEmptyProject,
  createExampleProject,
  createWall,
  createSlab,
  createOpening,
  defaultSurface,
  snapPoint,
  keyboardIntent,
  routeInput,
  validateDocument,
  wallLength,
  documentWarnings,
  deletionImpact,
} from '@building/editor-core';
import type { Command, ProjectDocument } from '@building/editor-core';

function fixture(): { core: EditorCore; wallId: string; doorId: string } {
  const document = createEmptyProject();
  const wall = createWall('level_1', { x: 0, z: 0 }, { x: 4.2, z: 0 });
  const door = createOpening(wall, 'door', 1.2);
  document.walls.push(wall);
  document.openings.push(door);
  return { core: new EditorCore(document), wallId: wall.id, doorId: door.id };
}
function errorCode(result: ReturnType<EditorCore['execute']>): string | undefined {
  return result.ok ? undefined : result.error.code;
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('domain commands, atomic history, snapshots and host dependencies', () => {
  it('starts with valid empty and two-floor editable example documents and no automatic facilities', () => {
    expect(validateDocument(createEmptyProject())).toEqual({ ok: true });
    const example = createExampleProject();
    expect(validateDocument(example)).toEqual({ ok: true });
    expect(example.levels).toHaveLength(2);
    expect(example.openings.filter((o) => o.kind === 'door')).toHaveLength(2);
    expect(example.slabs.filter((s) => s.purpose === 'roof')).toHaveLength(1);
    expect(example.openings.filter((o) => o.kind === 'door').map((o) => o.hinge)).toEqual([
      'left',
      'right',
    ]);
  });
  it('owns frozen cached snapshots, isolates caller data and preserves unchanged references', () => {
    const source = createEmptyProject();
    const core = new EditorCore(source);
    source.levels[0]!.name = 'outside mutation';
    expect(core.getSnapshot().levels[0]!.name).toBe('1');
    expect(core.getSnapshot()).toBe(core.getSnapshot());
    expect(Object.isFrozen(core.getSnapshot().levels[0])).toBe(true);
    const levels = core.getSnapshot().levels;
    expect(
      core.execute({
        type: 'add-wall',
        wall: createWall('level_1', { x: 0, z: 0 }, { x: 2.4, z: 0 }),
      }).ok,
    ).toBe(true);
    expect(core.getSnapshot().levels).toBe(levels);
  });
  it('rejects invalid shortening without deleting, squeezing or altering hosted openings', () => {
    const { core, wallId } = fixture();
    const snapshot = core.getSnapshot();
    const result = core.execute({
      type: 'update-wall',
      id: wallId,
      patch: { end: { x: 1.5, z: 0 } },
    });
    expect(errorCode(result)).toBe('opening.outsideWall');
    expect(core.getSnapshot()).toBe(snapshot);
    expect(core.getHistoryState().undoCount).toBe(0);
  });
  it('deletes wall and hosted objects in one undoable transaction and restores exact material anchors', () => {
    const { core, wallId, doorId } = fixture();
    const before = core.getSnapshot();
    const result = core.execute({ type: 'delete-wall', id: wallId });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changeSet.removedIds).toEqual(expect.arrayContaining([wallId, doorId]));
    }
    expect(core.getSnapshot().openings).toHaveLength(0);
    expect(core.getHistoryState().undoCount).toBe(1);
    core.undo();
    expect(core.getSnapshot().walls[0]).toBe(before.walls[0]);
    expect(core.getSnapshot().openings[0]).toBe(before.openings[0]);
    core.redo();
    expect(core.getSnapshot().walls).toHaveLength(0);
  });
  it('deletes a level with all dependent objects and restores its user roof on undo', () => {
    const core = new EditorCore(createExampleProject());
    const before = core.getSnapshot();
    expect(core.execute({ type: 'delete-level', id: 'level_2' }).ok).toBe(true);
    expect(core.getSnapshot().walls.every((w) => w.levelId === 'level_1')).toBe(true);
    expect(core.getSnapshot().slabs.every((s) => s.levelId === 'level_1')).toBe(true);
    core.undo();
    expect(core.getSnapshot().slabs).toBe(before.slabs);
  });
  it('prevents deleting final level', () => {
    const core = new EditorCore();
    expect(errorCode(core.execute({ type: 'delete-level', id: 'level_1' }))).toBe(
      'level.lastRequired',
    );
  });
  it('modifies upper level elevations as one transaction without silently changing wall heights', () => {
    const core = new EditorCore(createExampleProject());
    const previousHeights = core.getSnapshot().walls.map((w) => w.height);
    expect(
      core.execute({ type: 'update-level', id: 'level_1', patch: { height: 3.5 }, moveAbove: true })
        .ok,
    ).toBe(true);
    expect(core.getSnapshot().levels[1]!.elevation).toBe(3.5);
    expect(core.getSnapshot().walls.map((w) => w.height)).toEqual(previousHeights);
    expect(
      core.getSnapshot().slabs.find((s) => s.levelId === 'level_2' && s.purpose === 'floor')!
        .elevation,
    ).toBe(3.5);
    core.undo();
    expect(core.getSnapshot().levels[1]!.elevation).toBe(3);
  });
  it('reports actual wall/slab penetration and leaves separate elevations explicit', () => {
    const d = createExampleProject();
    const core = new EditorCore(d);
    expect(documentWarnings(core.getSnapshot())).toHaveLength(0);
    const wall = core.getSnapshot().walls.find((object) => object.levelId === 'level_1')!;
    const result = core.execute({ type: 'update-wall', id: wall.id, patch: { height: 3 } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings).toContainEqual({
        code: 'geometry.wallSlabIntersection',
        params: {
          wallId: wall.id,
          slabId: d.slabs.find((slab) => slab.levelId === 'level_2' && slab.purpose === 'floor')!
            .id,
          penetration: 0.2,
        },
      });
    }
    core.undo();
    expect(documentWarnings(core.getSnapshot())).toHaveLength(0);
    expect(deletionImpact(core.getSnapshot(), 'level_2').openings).toHaveLength(2);
  });
  it('restores entire batch when a later command is invalid', () => {
    const { core, wallId } = fixture();
    const before = core.getSnapshot();
    const result = core.execute({
      type: 'batch',
      commands: [
        { type: 'rename-project', name: 'Changed' },
        { type: 'update-wall', id: wallId, patch: { thickness: -0.2 } },
      ],
    });
    expect(result.ok).toBe(false);
    expect(core.getSnapshot()).toBe(before);
  });
  it('keeps preview frames outside subscriptions/history and commits exactly one drag', () => {
    const { core, doorId } = fixture();
    const before = core.getSnapshot();
    let notifications = 0;
    core.subscribe(() => {
      notifications += 1;
    });
    const token = core.beginPreview();
    for (const offset of [1.3, 1.4, 1.5]) {
      const result = core.preview(token, { type: 'update-opening', id: doorId, patch: { offset } });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.document.openings[0]!.offset).toBe(offset);
      }
    }
    expect(core.getSnapshot()).toBe(before);
    expect(notifications).toBe(0);
    expect(core.commitPreview(token).ok).toBe(true);
    expect(notifications).toBe(1);
    expect(core.getHistoryState().undoCount).toBe(1);
    core.undo();
    expect(core.getSnapshot().openings[0]!.offset).toBe(1.2);
  });
  it('cancelled, invalid and stale previews cannot corrupt or overwrite newer edits', () => {
    const { core, doorId } = fixture();
    const before = core.getSnapshot();
    let token = core.beginPreview();
    core.preview(token, { type: 'update-opening', id: doorId, patch: { offset: 2 } });
    core.cancelPreview(token);
    expect(core.getSnapshot()).toBe(before);
    token = core.beginPreview();
    expect(
      core.preview(token, { type: 'update-opening', id: doorId, patch: { offset: 99 } }).ok,
    ).toBe(false);
    expect(errorCode(core.commitPreview(token))).toBe('transaction.empty');
    token = core.beginPreview();
    core.preview(token, { type: 'update-opening', id: doorId, patch: { offset: 2 } });
    core.execute({ type: 'rename-project', name: 'Newer' });
    expect(errorCode(core.commitPreview(token))).toBe('transaction.stale');
    expect(core.getSnapshot().openings[0]!.offset).toBe(1.2);
  });
  it('keeps a newer edit dirty when an old snapshot save finishes and rejects another project completion', () => {
    const { core, doorId } = fixture();
    core.execute({ type: 'update-opening', id: doorId, patch: { angle: 45 } });
    const saving = core.getSnapshot();
    core.execute({ type: 'update-opening', id: doorId, patch: { angle: 65 } });
    expect(core.markSaved(saving.revision)).toBe(false);
    expect(core.isDirty()).toBe(true);
    expect(core.markSaved(core.getSnapshot().revision, 'different_project')).toBe(false);
    expect(core.markSaved(core.getSnapshot().revision)).toBe(true);
    expect(core.isDirty()).toBe(false);
  });
  it('publishes stable status snapshots on save without mutating or recreating formal data', () => {
    const { core, doorId } = fixture();
    let updates = 0;
    const stop = core.subscribeStatus(() => {
      updates += 1;
    });
    core.execute({ type: 'update-opening', id: doorId, patch: { angle: 45 } });
    const document = core.getSnapshot(),
      status = core.getStatusSnapshot();
    expect(status.isDirty).toBe(true);
    expect(status.canUndo).toBe(true);
    expect(core.getStatusSnapshot()).toBe(status);
    core.markSaved(document.revision);
    expect(core.getSnapshot()).toBe(document);
    expect(core.getStatusSnapshot().isDirty).toBe(false);
    expect(updates).toBe(2);
    stop();
  });
  it('updates only connected geometry/UV dependencies plus hosted objects and preserves unrelated refs', () => {
    const d = createEmptyProject();
    const first = createWall('level_1', { x: 0, z: 0 }, { x: 2.4, z: 0 });
    const next = createWall('level_1', { x: 2.4, z: 0 }, { x: 2.4, z: 1.8 });
    const remote = createWall('level_1', { x: 10, z: 10 }, { x: 12, z: 10 });
    const door = createOpening(first, 'door', 0.5);
    d.walls.push(first, next, remote);
    d.openings.push(door);
    const core = new EditorCore(d);
    const remoteRef = core.getSnapshot().walls[2];
    const result = core.execute({ type: 'update-wall', id: first.id, patch: { height: 3 } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changeSet.wallIds).toEqual(expect.arrayContaining([first.id, next.id]));
      expect(result.changeSet.wallIds).not.toContain(remote.id);
      expect(result.changeSet.openingIds).toContain(door.id);
    }
    expect(core.getSnapshot().walls[2]).toBe(remoteRef);
  });
  it('keeps A/B surface identity and door reference offsets across endpoint data reorder', () => {
    const { core, wallId } = fixture();
    const wall = core.getSnapshot().walls[0]!;
    core.execute({ type: 'update-wall', id: wallId, patch: { start: wall.end, end: wall.start } });
    expect(core.getSnapshot().walls[0]!.materials).toBe(wall.materials);
    expect(core.getSnapshot().walls[0]!.start).toEqual(wall.start);
    expect(core.getSnapshot().openings[0]!.offset).toBe(1.2);
    expect(core.getHistoryState().undoCount).toBe(0);
  });
  it('separates slab top/bottom slots and rejects textured edges', () => {
    const d = createEmptyProject();
    const slab = createSlab('level_1', { x: 0, z: 0 }, { x: 3, z: 4 });
    d.slabs.push(slab);
    const core = new EditorCore(d);
    const bottom = core.getSnapshot().slabs[0]!.materials.bottom;
    core.execute({
      type: 'set-material',
      objectId: slab.id,
      side: 'top',
      binding: defaultSurface('#123456'),
    });
    expect(core.getSnapshot().slabs[0]!.materials.bottom).toBe(bottom);
    expect(core.getSnapshot().slabs[0]!.materials.top.color).toBe('#123456');
    const resource = {
      id: 'image_1',
      name: 'test.png',
      mime: 'image/png',
      dataUrl: 'data:image/png;base64,aGVsbG8=',
    };
    core.execute({ type: 'add-resource', resource });
    expect(
      errorCode(
        core.execute({
          type: 'set-material',
          objectId: slab.id,
          side: 'edge',
          binding: { ...defaultSurface(), resourceId: resource.id },
        }),
      ),
    ).toBe('material.edgeMustBeColor');
  });
  it('saves explicit continuity seam and applies group tile change as one command', () => {
    const d = createEmptyProject();
    const a = createWall('level_1', { x: 0, z: 0 }, { x: 2.4, z: 0 });
    const b = createWall('level_1', { x: 2.4, z: 0 }, { x: 2.4, z: 1.8 });
    d.walls.push(a, b);
    const core = new EditorCore(d);
    const group = {
      id: 'continuity_1',
      members: [
        { wallId: a.id, side: 'A' as const, direction: 1 as const },
        { wallId: b.id, side: 'A' as const, direction: 1 as const },
      ],
      anchor: { wallId: a.id, side: 'A' as const, endpoint: 'start' as const },
      seam: { wallId: b.id, side: 'A' as const, endpoint: 'end' as const },
      verticalOrigin: 0,
    };
    expect(core.execute({ type: 'set-continuity', group }).ok).toBe(true);
    core.execute({
      type: 'set-material',
      objectId: a.id,
      side: 'A',
      binding: { ...defaultSurface(), tileWidth: 0.7 },
      applyContinuity: true,
    });
    expect(core.getSnapshot().walls.map((w) => w.materials.A.tileWidth)).toEqual([0.7, 0.7]);
    expect(core.getSnapshot().walls.map((w) => w.materials.B.tileWidth)).toEqual([0.5, 0.5]);
    expect(core.getSnapshot().continuity[0]!.seam).toEqual(group.seam);
    core.undo();
    expect(core.getSnapshot().walls.map((w) => w.materials.A.tileWidth)).toEqual([0.5, 0.5]);
  });
  it('emits no history for unchanged submissions and cleans subscribers', () => {
    const { core, doorId } = fixture();
    let count = 0;
    const remove = core.subscribe(() => {
      count += 1;
    });
    core.execute({ type: 'update-opening', id: doorId, patch: { offset: 1.2 } });
    expect(count).toBe(0);
    expect(core.getHistoryState().undoCount).toBe(0);
    remove();
    core.execute({ type: 'update-opening', id: doorId, patch: { offset: 1.3 } });
    expect(count).toBe(0);
  });
});

describe('validation and file boundary', () => {
  it('propagates an L corner length edit to the perpendicular wall without changing A/B or detached buildings', () => {
    const d = createEmptyProject();
    const a = createWall('level_1', { x: 0, z: 0 }, { x: 2.4, z: 0 });
    const b = createWall('level_1', { x: 2.4, z: 0 }, { x: 2.4, z: 1.8 });
    const remote = createWall('level_1', { x: 10, z: 10 }, { x: 12, z: 10 });
    d.walls.push(a, b, remote);
    d.openings.push(createOpening(b, 'window', 0.3));
    d.openings[0]!.width = 0.8;
    const core = new EditorCore(d),
      before = core.getSnapshot();
    expect(
      core.execute({ type: 'update-wall', id: a.id, patch: { end: { x: 2.7, z: 0 } } }).ok,
    ).toBe(true);
    const changed = core.getSnapshot();
    expect(changed.walls[1]!.start).toEqual({ x: 2.7, z: 0 });
    expect(changed.walls[1]!.end).toEqual({ x: 2.7, z: 1.8 });
    expect(changed.walls[1]!.materials).toBe(before.walls[1]!.materials);
    expect(changed.walls[2]).toBe(before.walls[2]);
    expect(changed.openings[0]).toBe(before.openings[0]);
    expect(core.getHistoryState().undoCount).toBe(1);
    core.undo();
    expect(core.getSnapshot().walls).toBe(before.walls);
    expect(core.getSnapshot().openings).toBe(before.openings);
  });
  it('keeps a closed rectangle connected when one axis length changes and restores all corners atomically', () => {
    const d = createEmptyProject(),
      points = [
        { x: 0, z: 0 },
        { x: 2.4, z: 0 },
        { x: 2.4, z: 1.8 },
        { x: 0, z: 1.8 },
      ];
    d.walls = points.map((point, index) =>
      createWall('level_1', point, points[(index + 1) % points.length]!),
    );
    const core = new EditorCore(d),
      before = core.getSnapshot(),
      token = core.beginPreview();
    const command: Command = {
      type: 'update-wall',
      id: d.walls[0]!.id,
      patch: { end: { x: 3.1, z: 0 } },
    };
    const preview = core.preview(token, command);
    expect(preview.ok).toBe(true);
    expect(core.getSnapshot()).toBe(before);
    if (preview.ok) {
      expect(preview.document.walls[2]!.start).toEqual({ x: 3.1, z: 1.8 });
    }
    expect(core.commitPreview(token).ok).toBe(true);
    const walls = core.getSnapshot().walls;
    for (let index = 0; index < walls.length; index += 1) {
      expect(walls[index]!.end).toEqual(walls[(index + 1) % walls.length]!.start);
    }
    expect(wallLength(walls[0]!)).toBeCloseTo(3.1);
    expect(wallLength(walls[2]!)).toBeCloseTo(3.1);
    expect(walls[3]).toBe(before.walls[3]);
    expect(core.getHistoryState().undoCount).toBe(1);
    core.undo();
    expect(core.getSnapshot().walls).toBe(before.walls);
  });
  it('preserves T attachment on host movement and rejects moving a branch past the host bounds', () => {
    const d = createEmptyProject(),
      host = createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 0 });
    const branch = createWall('level_1', { x: 2, z: 0 }, { x: 2, z: 2 });
    d.walls.push(host, branch);
    const core = new EditorCore(d);
    expect(
      core.execute({
        type: 'update-wall',
        id: host.id,
        patch: { start: { x: 0, z: 0.3 }, end: { x: 4, z: 0.3 } },
      }).ok,
    ).toBe(true);
    expect(core.getSnapshot().walls[1]!.start).toEqual({ x: 2, z: 0.3 });
    expect(core.getSnapshot().walls[1]!.end).toEqual({ x: 2, z: 2 });
    const before = core.getSnapshot();
    expect(
      errorCode(
        core.execute({
          type: 'update-wall',
          id: branch.id,
          patch: { start: { x: 5, z: 0.3 }, end: { x: 5, z: 2 } },
        }),
      ),
    ).toBe('wall.topologyEditUnsupported');
    expect(core.getSnapshot()).toBe(before);
    expect(
      errorCode(
        core.execute({ type: 'update-wall', id: host.id, patch: { end: { x: 1.5, z: 0.3 } } }),
      ),
    ).toBe('wall.topologyEditUnsupported');
    expect(core.getSnapshot()).toBe(before);
  });
  it('rejects an entire propagated corner edit if a neighbouring wall can no longer host its opening', () => {
    const d = createEmptyProject(),
      a = createWall('level_1', { x: 0, z: 0 }, { x: 2.4, z: 0 });
    const b = createWall('level_1', { x: 2.4, z: 0 }, { x: 2.4, z: 1.8 });
    const c = createWall('level_1', { x: 2.4, z: 1.8 }, { x: 0, z: 1.8 });
    d.walls.push(a, b, c);
    const opening = createOpening(c, 'door', 1.0);
    d.openings.push(opening);
    const core = new EditorCore(d),
      before = core.getSnapshot();
    const result = core.execute({
      type: 'update-wall',
      id: a.id,
      patch: { end: { x: 1.5, z: 0 } },
    });
    expect(errorCode(result)).toBe('opening.outsideWall');
    expect(core.getSnapshot()).toBe(before);
    expect(core.getHistoryState().undoCount).toBe(0);
  });
  it('rejects stable endpoint inversion or contradictory orthogonal coordinate requests', () => {
    const d = createEmptyProject(),
      wall = createWall('level_1', { x: 0, z: 0 }, { x: 2.4, z: 0 });
    d.walls.push(wall);
    const core = new EditorCore(d),
      before = core.getSnapshot();
    expect(
      errorCode(
        core.execute({ type: 'update-wall', id: wall.id, patch: { end: { x: -1, z: 0 } } }),
      ),
    ).toBe('wall.topologyEditUnsupported');
    expect(
      errorCode(
        core.execute({
          type: 'update-wall',
          id: wall.id,
          patch: { start: { x: 0, z: 1 }, end: { x: 2.4, z: 2 } },
        }),
      ),
    ).toBe('wall.topologyEditUnsupported');
    expect(core.getSnapshot()).toBe(before);
  });
  it('rejects unsupported schemas and unknown fields without changing current project', () => {
    const core = new EditorCore();
    const before = core.getSnapshot();
    expect(errorCode(core.replace({ ...clone(before), schemaVersion: 2 }))).toBe(
      'project.unsupportedVersion',
    );
    expect(errorCode(core.replace({ ...clone(before), futureField: 42 }))).toBe(
      'project.unknownField',
    );
    const withExtra = clone(before) as ProjectDocument;
    Object.assign(withExtra.levels[0]!, { elevationRule: 'future' });
    expect(errorCode(core.replace(withExtra))).toBe('project.unknownField');
    expect(core.getSnapshot()).toBe(before);
  });
  it('prevents proper cross, overlapping collinear, unequal thickness and nonorthogonal walls', () => {
    const d = createEmptyProject();
    const a = createWall('level_1', { x: -2, z: 0 }, { x: 2, z: 0 });
    d.walls.push(a);
    const core = new EditorCore(d);
    const cases = [
      [createWall('level_1', { x: 0, z: -2 }, { x: 0, z: 2 }), 'wall.crossUnsupported'],
      [createWall('level_1', { x: 0, z: 0 }, { x: 3, z: 0 }), 'wall.overlap'],
      [
        { ...createWall('level_1', { x: 2, z: 0 }, { x: 2, z: 2 }), thickness: 0.4 },
        'wall.unequalJunction',
      ],
      [createWall('level_1', { x: 3, z: 0 }, { x: 5, z: 2 }), 'wall.orthogonalOnly'],
    ] as const;
    for (const [wall, code] of cases) {
      expect(errorCode(core.execute({ type: 'add-wall', wall }))).toBe(code);
    }
    expect(core.getSnapshot().walls).toHaveLength(1);
  });
  it('allows supported T junction with equal thickness', () => {
    const d = createEmptyProject();
    d.walls.push(createWall('level_1', { x: -2, z: 0 }, { x: 2, z: 0 }));
    const core = new EditorCore(d);
    expect(
      core.execute({
        type: 'add-wall',
        wall: createWall('level_1', { x: 0, z: 0 }, { x: 0, z: 2 }),
      }).ok,
    ).toBe(true);
  });
  it('rejects unsupported solid intersections without connected axes', () => {
    const d = createEmptyProject();
    d.walls.push(createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 0 }));
    const core = new EditorCore(d);
    expect(
      errorCode(
        core.execute({
          type: 'add-wall',
          wall: createWall('level_1', { x: 0.5, z: 0.1 }, { x: 3, z: 0.1 }),
        }),
      ),
    ).toBe('wall.solidOverlap');
    expect(
      errorCode(
        core.execute({
          type: 'add-wall',
          wall: createWall('level_1', { x: 3.95, z: 0.05 }, { x: 3.95, z: 2 }),
        }),
      ),
    ).toBe('wall.solidOverlap');
    expect(core.getSnapshot().walls).toHaveLength(1);
  });
  it('rejects a hole blocked by a perpendicular L/T junction and preserves the host', () => {
    const d = createEmptyProject();
    const host = createWall('level_1', { x: -2, z: 0 }, { x: 2, z: 0 });
    const branch = createWall('level_1', { x: 0, z: 0 }, { x: 0, z: 2 });
    d.walls.push(host, branch);
    const core = new EditorCore(d);
    const before = core.getSnapshot();
    expect(
      errorCode(core.execute({ type: 'add-opening', opening: createOpening(host, 'door', 1.6) })),
    ).toBe('opening.junctionConflict');
    expect(core.getSnapshot()).toBe(before);
    const safe = createOpening(host, 'door', 0.2);
    expect(core.execute({ type: 'add-opening', opening: safe }).ok).toBe(true);
    expect(
      errorCode(
        core.execute({
          type: 'update-wall',
          id: branch.id,
          patch: { start: { x: -1, z: 0 }, end: { x: -1, z: 2 } },
        }),
      ),
    ).toBe('opening.junctionConflict');
  });
  it('rejects overlapping hosted openings and invalid windows/door animation fields atomically', () => {
    const { core } = fixture();
    const wall = core.getSnapshot().walls[0]!;
    expect(
      errorCode(core.execute({ type: 'add-opening', opening: createOpening(wall, 'window', 1.3) })),
    ).toBe('opening.overlap');
    const door = core.getSnapshot().openings[0]!;
    expect(
      errorCode(core.execute({ type: 'update-opening', id: door.id, patch: { duration: 0 } })),
    ).toBe('opening.invalidAnimation');
    expect(
      errorCode(core.execute({ type: 'update-opening', id: door.id, patch: { sill: 0.2 } })),
    ).toBe('opening.doorSill');
    expect(core.getSnapshot().openings).toHaveLength(1);
  });
  it('does not auto-create a roof on load or when adding higher levels', () => {
    const core = new EditorCore(createEmptyProject());
    core.execute({
      type: 'add-level',
      level: { id: 'level_2', name: '2', elevation: 3, height: 3 },
    });
    const loaded = new EditorCore(clone(core.getSnapshot()));
    expect(loaded.getSnapshot().slabs).toHaveLength(0);
  });
  it('rejects missing resources and nonfinite dimensions in untrusted files', () => {
    const { core } = fixture();
    const d = clone(core.getSnapshot());
    d.walls[0]!.materials.A.resourceId = 'missing';
    expect(validateDocument(d)).toMatchObject({ ok: false, error: { code: 'resource.missing' } });
    delete d.walls[0]!.materials.A.resourceId;
    d.walls[0]!.height = Number.NaN;
    expect(validateDocument(d)).toMatchObject({ ok: false, error: { code: 'wall.invalid' } });
  });
});

describe('separate session, standardized input, tools and async version ownership', () => {
  it('session selection/tools do not alter formal revision, dirty flag or history', () => {
    const { core, wallId } = fixture();
    const session = new SessionStore('level_1');
    const before = core.getSnapshot();
    session.set({
      selectedId: wallId,
      selectedSurface: 'A',
      tool: 'material',
      wholeBuildingPreview: true,
    });
    expect(core.getSnapshot()).toBe(before);
    expect(core.isDirty()).toBe(false);
    expect(core.getHistoryState().undoCount).toBe(0);
    core.execute({ type: 'delete-wall', id: wallId });
    session.reconcile(core.getSnapshot());
    expect(session.getSnapshot().selectedId).toBeUndefined();
  });
  it('excludes other floors from endpoint, wall-edge and slab snapping', () => {
    const d = createEmptyProject();
    d.levels.push({ id: 'level_2', name: '2', elevation: 3, height: 3 });
    d.walls.push(createWall('level_2', { x: 1.04, z: 1.04 }, { x: 2, z: 1.04 }));
    d.slabs.push(createSlab('level_2', { x: 1.03, z: 1.03 }, { x: 3, z: 3 }, 3));
    expect(snapPoint({ x: 1.04, z: 1.04 }, d, 'level_1')).toEqual({
      point: { x: 1, z: 1 },
      kind: 'grid',
    });
    expect(snapPoint({ x: 1.04, z: 1.04 }, d, 'level_2').kind).toBe('endpoint');
  });
  it('routes modal/text/IME before dragging/tools and supports Windows/macOS undo', () => {
    const base = { modal: false, text: false, composing: false, activeDrag: false };
    expect(routeInput({ ...base, modal: true, activeDrag: true })).toBe('ui');
    expect(keyboardIntent('Delete', {}, { ...base, text: true })).toBeUndefined();
    expect(keyboardIntent('z', { control: true }, { ...base, composing: true })).toBeUndefined();
    expect(keyboardIntent('z', { control: true }, base)).toBe('undo');
    expect(keyboardIntent('z', { meta: true, shift: true }, base)).toBe('redo');
  });
  it('keeps start point through temporary camera operation, chains walls and Esc cancels only current preview', () => {
    const tools = new ToolStateMachine();
    tools.handle({ type: 'activate', tool: 'wall' });
    tools.handle({ type: 'click', point: { x: 0, z: 0 } });
    tools.handle({ type: 'move', point: { x: 2.4, z: 0.2 } });
    const preview = tools.getState();
    tools.handle({ type: 'camera', active: true });
    tools.handle({ type: 'move', point: { x: 99, z: 99 } });
    expect(tools.getState()).toBe(preview);
    tools.handle({ type: 'camera', active: false });
    const intent = tools.handle({ type: 'click', point: { x: 2.4, z: 0.2 } });
    expect(intent).toEqual({ type: 'create-wall', start: { x: 0, z: 0 }, end: { x: 2.4, z: 0 } });
    expect(tools.getState()).toEqual({ kind: 'start', tool: 'wall', start: { x: 2.4, z: 0 } });
    tools.handle({ type: 'cancel' });
    expect(tools.getState()).toEqual({ kind: 'idle', tool: 'wall' });
    tools.handle({ type: 'cancel' });
    expect(tools.getState()).toEqual({ kind: 'idle', tool: 'select' });
  });
  it('hosted tool validates before submission and failed wall keeps correctable draft', () => {
    const tools = new ToolStateMachine();
    tools.handle({ type: 'activate', tool: 'door' });
    expect(
      tools.handle({
        type: 'click',
        point: { x: 0, z: 0 },
        host: { wallId: 'wall_1', offset: 4, valid: false },
      }),
    ).toBeUndefined();
    expect(
      tools.handle({
        type: 'click',
        point: { x: 0, z: 0 },
        host: { wallId: 'wall_1', offset: 1, valid: true },
      }),
    ).toEqual({ type: 'create-opening', kind: 'door', wallId: 'wall_1', offset: 1 });
    tools.reject({ type: 'create-wall', start: { x: 0, z: 0 }, end: { x: 2, z: 0 } });
    expect(tools.getState().kind).toBe('preview');
  });
  it('rejects older tasks after later tasks, edits, cancellation and project switches', () => {
    const { core, wallId } = fixture();
    const gate = new RevisionGate();
    const d = core.getSnapshot();
    const a = gate.create(d),
      b = gate.create(d);
    expect(gate.accepts(a, d)).toBe(false);
    expect(gate.accepts(b, d)).toBe(true);
    core.execute({ type: 'update-wall', id: wallId, patch: { height: 3 } });
    expect(gate.accepts(b, core.getSnapshot())).toBe(false);
    const c = gate.create(core.getSnapshot());
    gate.cancel();
    expect(gate.accepts(c, core.getSnapshot())).toBe(false);
    const e = gate.create(core.getSnapshot());
    expect(gate.accepts(e, createEmptyProject())).toBe(false);
  });
  it('property and pointer commits share exactly the same dimension validation', () => {
    const { core, wallId } = fixture();
    const command: Command = { type: 'update-wall', id: wallId, patch: { end: { x: 6, z: 0 } } };
    const property = core.execute(command);
    expect(property.ok).toBe(true);
    const propertyValue = wallLength(core.getSnapshot().walls[0]!);
    core.undo();
    const token = core.beginPreview();
    expect(core.preview(token, command).ok).toBe(true);
    core.commitPreview(token);
    expect(wallLength(core.getSnapshot().walls[0]!)).toBe(propertyValue);
  });
});
