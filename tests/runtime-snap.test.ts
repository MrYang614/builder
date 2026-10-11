import { describe, expect, test, vi } from 'vitest';
import {
  createEmptyProject,
  createOpening,
  createSlab,
  createWall,
  EditorCore,
  type SnapSettings,
} from '@building/editor-core';
import { buildEffectiveWallSnapCandidates } from '@building/building-geometry';
import { RuntimeSnapIndex } from '../packages/three-runtime/src/snap-index';

const points: SnapSettings = { enabled: true, mode: 'points', tolerance: 0.08, gridSize: 0.1 };

function fixture() {
  const document = createEmptyProject('Runtime snapping regression');
  document.id = 'snap-project';
  document.levels.push({ id: 'level_2', name: '2', elevation: 3, height: 3 });
  const wall = createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 0 });
  wall.id = 'wall_1';
  const second = createWall('level_1', { x: 6, z: 2 }, { x: 6, z: 6 });
  second.id = 'wall_2';
  const ghost = createWall('level_2', { x: 10, z: 10 }, { x: 12, z: 10 });
  ghost.id = 'wall_ghost';
  const slab = createSlab('level_1', { x: -2, z: -2 }, { x: -1, z: -1 });
  slab.id = 'slab_1';
  const opening = createOpening(wall, 'door', 1);
  opening.id = 'door_1';
  document.walls.push(wall, second, ghost);
  document.slabs.push(slab);
  document.openings.push(opening);
  return { core: new EditorCore(document), wall, second, ghost, slab, opening };
}

function joinedFixture() {
  const document = createEmptyProject('Joined wall runtime snapping');
  const horizontal = createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 0 });
  horizontal.id = 'wall_a';
  const vertical = createWall('level_1', { x: 4, z: 0 }, { x: 4, z: 3 });
  vertical.id = 'wall_b';
  const unrelated = createWall('level_1', { x: 8, z: 1 }, { x: 8, z: 4 });
  unrelated.id = 'wall_c';
  const slab = createSlab('level_1', { x: -2, z: -2 }, { x: -1, z: -1 });
  slab.id = 'slab_joined';
  document.walls.push(horizontal, vertical, unrelated);
  document.slabs.push(slab);
  return { core: new EditorCore(document), horizontal, vertical, slab };
}

describe('runtime formal snap candidate cache and feedback ownership', () => {
  test('joined wall queries use visible outer corners and finite extended edges with shared self filtering', () => {
    const { core, horizontal, vertical } = joinedFixture();
    const index = new RuntimeSnapIndex();
    const document = core.getSnapshot();
    const settings = { ...points, tolerance: 0.03 };
    const raw = { x: 4.12, z: -0.12 };
    expect(index.resolve(raw, document, 'level_1', [], settings)).toMatchObject({
      kind: 'point',
      targetKind: 'anchor',
      point: { x: 4.1, z: -0.1 },
      relatedObjectIds: [horizontal.id, vertical.id],
    });
    for (const ownerId of [horizontal.id, vertical.id]) {
      expect(index.resolve(raw, document, 'level_1', [], settings, ownerId)).toMatchObject({
        kind: 'raw',
        point: raw,
      });
    }
    const extension = index.resolve({ x: 4.05, z: -0.12 }, document, 'level_1', [], {
      ...settings,
      mode: 'lines',
    });
    expect(extension).toMatchObject({
      kind: 'line',
      targetKind: 'wall-edge',
      objectId: horizontal.id,
      point: { x: 4.05, z: -0.1 },
      segment: { start: { x: 0, z: -0.1 }, end: { x: 4.1, z: -0.1 } },
    });
    expect(extension.point.x).toBeGreaterThan(horizontal.end.x);
    expect(
      index.resolve({ x: 4.05, z: 0.1 }, document, 'level_1', [], {
        ...settings,
        mode: 'lines',
      }).kind,
    ).toBe('raw');
    expect(core.getSnapshot()).toBe(document);
    expect(core.getHistoryState().undoCount).toBe(0);
  });

  test('wall boundary caches survive material and slab edits and retain unchanged owners after a wall edit', () => {
    const { core, horizontal, vertical, slab } = joinedFixture();
    const index = new RuntimeSnapIndex();
    const settings = { ...points, tolerance: 0.03 };
    const corner = { x: 4.12, z: -0.12 };
    index.resolve(corner, core.getSnapshot(), 'level_1', [], settings);
    expect(index.diagnostics()).toMatchObject({ boundaryBuilds: 1, boundaryGroupBuilds: 3 });
    const material = core.execute({
      type: 'set-material',
      objectId: horizontal.id,
      side: 'A',
      binding: { ...horizontal.materials.A, tileWidth: 0.75 },
    });
    if (!material.ok) {
      throw new Error(material.error.code);
    }
    index.sync(core.getSnapshot(), material.changeSet);
    expect(index.resolve(corner, core.getSnapshot(), 'level_1', [], settings).point).toEqual({
      x: 4.1,
      z: -0.1,
    });
    const slabChange = core.execute({
      type: 'update-slab',
      id: slab.id,
      patch: { polygon: slab.polygon.map((point) => ({ x: point.x - 1, z: point.z })) },
    });
    if (!slabChange.ok) {
      throw new Error(slabChange.error.code);
    }
    index.sync(core.getSnapshot(), slabChange.changeSet);
    index.resolve(corner, core.getSnapshot(), 'level_1', [], settings);
    expect(index.diagnostics()).toMatchObject({ boundaryBuilds: 1, boundaryGroupBuilds: 3 });

    const wallChange = core.execute({
      type: 'update-wall',
      id: vertical.id,
      patch: { end: { x: 4, z: 4 } },
    });
    if (!wallChange.ok) {
      throw new Error(wallChange.error.code);
    }
    index.sync(core.getSnapshot(), wallChange.changeSet);
    expect(
      index.resolve({ x: 4.12, z: 4.02 }, core.getSnapshot(), 'level_1', [], settings),
    ).toMatchObject({ targetKind: 'anchor', objectId: vertical.id, point: { x: 4.1, z: 4 } });
    expect(index.diagnostics()).toMatchObject({ boundaryBuilds: 2, boundaryGroupBuilds: 4 });
  });

  test('valid wall-height edits invalidate height-dependent exposed boundary corners', () => {
    const { core, horizontal, vertical } = joinedFixture();
    const index = new RuntimeSnapIndex();
    const settings = { ...points, tolerance: 0.01 };
    const raw = { x: 4.1, z: 0.1 };
    const before = core.getSnapshot();
    expect(index.resolve(raw, before, 'level_1', [], settings).kind).toBe('raw');
    const counters = index.diagnostics();
    const changed = core.execute({
      type: 'update-wall',
      id: vertical.id,
      patch: { height: 0.005 },
    });
    expect(changed.ok).toBe(true);
    if (!changed.ok) {
      throw new Error(changed.error.code);
    }
    const document = core.getSnapshot();
    const direct = buildEffectiveWallSnapCandidates(document, 'level_1').find(
      (candidate) => candidate.point?.x === raw.x && candidate.point.z === raw.z,
    );
    expect(direct).toMatchObject({ objectId: horizontal.id, point: raw, targetKind: 'anchor' });
    index.sync(document, changed.changeSet);
    const result = index.resolve(raw, document, 'level_1', [], settings);
    expect(result).toMatchObject({
      kind: 'point',
      objectId: direct!.objectId,
      point: direct!.point,
      targetKind: direct!.targetKind,
      relatedObjectIds: direct!.relatedObjectIds,
    });
    expect(index.diagnostics()).toMatchObject({
      objectBuilds: counters.objectBuilds + 1,
      boundaryBuilds: counters.boundaryBuilds + 1,
      rebuilds: counters.rebuilds + 1,
    });
    expect(before.walls.find((wall) => wall.id === vertical.id)!.height).toBe(vertical.height);
    expect(core.getSnapshot()).toBe(document);
    expect(core.getHistoryState().undoCount).toBe(1);
  });

  test('reuses an unchanged level index and normalizes hidden ID order', () => {
    const { core, wall, second, slab } = fixture();
    const index = new RuntimeSnapIndex();
    const document = core.getSnapshot();
    const first = index.resolve({ x: 0.02, z: 0.03 }, document, 'level_1', [], points);
    expect(first).toMatchObject({ point: wall.start, objectId: wall.id, levelId: 'level_1' });
    for (const raw of [
      { x: 0.01, z: 0 },
      { x: 3.98, z: 0.02 },
      { x: 100, z: 100 },
    ]) {
      index.resolve(raw, document, 'level_1', [], points);
    }
    expect(index.diagnostics()).toMatchObject({ objectBuilds: 4, rebuilds: 1, queries: 4 });

    const hidden = index.resolve(
      { x: 0.02, z: 0.03 },
      document,
      'level_1',
      [second.id, slab.id],
      points,
    );
    const reordered = index.resolve(
      { x: 0.02, z: 0.03 },
      document,
      'level_1',
      [slab.id, second.id],
      points,
    );
    expect(reordered).toEqual(hidden);
    expect(index.diagnostics()).toMatchObject({ objectBuilds: 4, rebuilds: 2, queries: 6 });
    expect(core.getSnapshot()).toBe(document);
    expect(core.getHistoryState().undoCount).toBe(0);
  });

  test('a committed revision replaces moved and removed targets before the next pointer query', () => {
    const { core, wall } = fixture();
    const index = new RuntimeSnapIndex();
    expect(
      index.resolve({ x: 4.02, z: 0 }, core.getSnapshot(), 'level_1', [], points),
    ).toMatchObject({
      objectId: wall.id,
      point: wall.end,
    });
    expect(
      core.execute({ type: 'update-wall', id: wall.id, patch: { end: { x: 5, z: 0 } } }).ok,
    ).toBe(true);
    expect(index.resolve({ x: 4.02, z: 0 }, core.getSnapshot(), 'level_1', [], points).kind).toBe(
      'raw',
    );
    expect(
      index.resolve({ x: 5.02, z: 0 }, core.getSnapshot(), 'level_1', [], points),
    ).toMatchObject({
      objectId: wall.id,
      point: { x: 5, z: 0 },
    });
    expect(core.execute({ type: 'delete-wall', id: wall.id }).ok).toBe(true);
    expect(index.resolve({ x: 5.02, z: 0 }, core.getSnapshot(), 'level_1', [], points).kind).toBe(
      'raw',
    );
    expect(index.diagnostics()).toMatchObject({ objectBuilds: 6, rebuilds: 3, queries: 4 });
  });

  test('material-only ChangeSets preserve geometry groups and the prepared index', () => {
    const { core, wall } = fixture();
    const index = new RuntimeSnapIndex();
    const raw = { x: 0.02, z: 0.03 };
    const first = index.resolve(raw, core.getSnapshot(), 'level_1', [], points);
    const changed = core.execute({
      type: 'set-material',
      objectId: wall.id,
      side: 'A',
      binding: { ...wall.materials.A, tileWidth: 0.75 },
    });
    expect(changed.ok).toBe(true);
    if (!changed.ok) {
      throw new Error(changed.error.code);
    }
    const document = core.getSnapshot();
    index.sync(document, changed.changeSet);
    expect(index.diagnostics()).toMatchObject({ objectBuilds: 4, rebuilds: 1 });
    expect(index.resolve(raw, document, 'level_1', [], points)).toEqual(first);
    expect(index.diagnostics()).toMatchObject({ objectBuilds: 4, rebuilds: 1, queries: 2 });
    expect(core.getSnapshot()).toBe(document);
    expect(core.getHistoryState().undoCount).toBe(1);
  });

  test('an affected local ChangeSet rebuilds its object while retaining unrelated groups', () => {
    const { core, second } = fixture();
    const index = new RuntimeSnapIndex();
    index.resolve({ x: 6.02, z: 6.02 }, core.getSnapshot(), 'level_1', [], points);
    const changed = core.execute({
      type: 'update-wall',
      id: second.id,
      patch: { end: { x: 6, z: 7 } },
    });
    expect(changed.ok).toBe(true);
    if (!changed.ok) {
      throw new Error(changed.error.code);
    }
    expect(changed.changeSet.wallIds).toEqual([second.id]);
    index.sync(core.getSnapshot(), changed.changeSet);
    expect(index.diagnostics()).toMatchObject({ objectBuilds: 5, rebuilds: 1 });
    expect(
      index.resolve({ x: 6.02, z: 6.02 }, core.getSnapshot(), 'level_1', [], points).kind,
    ).toBe('raw');
    expect(
      index.resolve({ x: 6.02, z: 7.02 }, core.getSnapshot(), 'level_1', [], points),
    ).toMatchObject({
      objectId: second.id,
      point: { x: 6, z: 7 },
    });
    expect(index.diagnostics()).toMatchObject({ objectBuilds: 5, rebuilds: 2, queries: 3 });
  });

  test.each(['projectId', 'revision', 'previousRevision'] as const)(
    'invalid ChangeSet %s falls back to current geometry instead of retaining a moved target',
    (field) => {
      const { core, wall } = fixture();
      const index = new RuntimeSnapIndex();
      const previous = core.getSnapshot();
      expect(index.resolve({ x: 4.02, z: 0 }, previous, 'level_1', [], points)).toMatchObject({
        objectId: wall.id,
        point: wall.end,
      });
      const changed = core.execute({
        type: 'update-wall',
        id: wall.id,
        patch: { end: { x: 5, z: 0 } },
      });
      expect(changed.ok).toBe(true);
      if (!changed.ok) {
        throw new Error(changed.error.code);
      }
      const invalid = {
        ...changed.changeSet,
        affectedIds: [],
        levelIds: [],
        ...(field === 'projectId'
          ? { projectId: 'another-project' }
          : field === 'revision'
            ? { revision: changed.changeSet.revision + 1 }
            : { previousRevision: changed.changeSet.previousRevision + 1 }),
      };
      const document = core.getSnapshot();
      index.sync(document, invalid);
      expect(index.diagnostics()).toMatchObject({ objectBuilds: 6, rebuilds: 1 });
      expect(index.resolve({ x: 4.02, z: 0 }, document, 'level_1', [], points).kind).toBe('raw');
      expect(index.resolve({ x: 5.02, z: 0 }, document, 'level_1', [], points)).toMatchObject({
        objectId: wall.id,
        point: { x: 5, z: 0 },
      });
      expect(index.diagnostics()).toMatchObject({ objectBuilds: 6, rebuilds: 2, queries: 3 });
      expect(core.getSnapshot()).toBe(document);
    },
  );

  test('host geometry changes rebuild wall and hosted opening groups through the same ChangeSet', () => {
    const { core, wall, opening } = fixture();
    const index = new RuntimeSnapIndex();
    const raw = { x: 1.01, z: 0.11 };
    expect(index.resolve(raw, core.getSnapshot(), 'level_1', [], points).objectId).toBe(opening.id);
    const changed = core.execute({ type: 'update-wall', id: wall.id, patch: { thickness: 0.4 } });
    expect(changed.ok).toBe(true);
    if (!changed.ok) {
      throw new Error(changed.error.code);
    }
    expect(changed.changeSet.openingIds).toContain(opening.id);
    index.sync(core.getSnapshot(), changed.changeSet);
    expect(index.diagnostics()).toMatchObject({ objectBuilds: 6, rebuilds: 1 });
    expect(index.resolve(raw, core.getSnapshot(), 'level_1', [], points).kind).toBe('raw');
    expect(
      index.resolve({ x: 1.01, z: 0.21 }, core.getSnapshot(), 'level_1', [], points),
    ).toMatchObject({
      objectId: opening.id,
      point: { x: 1, z: 0.2 },
    });
    expect(index.diagnostics()).toMatchObject({ objectBuilds: 6, rebuilds: 2 });
  });

  test('same-position host replacement updates opening ownership used by self and hidden filtering', () => {
    const { core, wall, opening } = fixture();
    const index = new RuntimeSnapIndex();
    const raw = { x: 1.01, z: 0.11 };
    expect(index.resolve(raw, core.getSnapshot(), 'level_1', [], points).objectId).toBe(opening.id);
    const replacementWall = { ...wall, id: 'wall_replacement' };
    const changed = core.execute({
      type: 'batch',
      commands: [
        { type: 'delete-wall', id: wall.id },
        { type: 'add-wall', wall: replacementWall },
        { type: 'add-opening', opening: { ...opening, wallId: replacementWall.id } },
      ],
    });
    expect(changed.ok).toBe(true);
    if (!changed.ok) {
      throw new Error(changed.error.code);
    }
    index.sync(core.getSnapshot(), changed.changeSet);
    expect(
      index.resolve(raw, core.getSnapshot(), 'level_1', [], points, replacementWall.id).kind,
    ).toBe('raw');
    expect(
      index.resolve(raw, core.getSnapshot(), 'level_1', [replacementWall.id], points).kind,
    ).toBe('raw');
    expect(index.resolve(raw, core.getSnapshot(), 'level_1', [], points)).toMatchObject({
      objectId: opening.id,
      relatedObjectIds: [replacementWall.id],
    });
    expect(index.diagnostics()).toMatchObject({ objectBuilds: 6, rebuilds: 4 });
  });

  test('geometry edits on another floor do not rebuild active-floor candidates', () => {
    const { core, wall, ghost } = fixture();
    const index = new RuntimeSnapIndex();
    const raw = { x: 0.02, z: 0.03 };
    index.resolve(raw, core.getSnapshot(), 'level_1', [], points);
    const changed = core.execute({
      type: 'update-wall',
      id: ghost.id,
      patch: { end: { x: 13, z: 10 } },
    });
    expect(changed.ok).toBe(true);
    if (!changed.ok) {
      throw new Error(changed.error.code);
    }
    index.sync(core.getSnapshot(), changed.changeSet);
    expect(index.resolve(raw, core.getSnapshot(), 'level_1', [], points).objectId).toBe(wall.id);
    expect(index.diagnostics()).toMatchObject({ objectBuilds: 4, rebuilds: 1, queries: 2 });
  });

  test('a new project identity cannot reuse another project at the same revision', () => {
    const { core, wall } = fixture();
    const index = new RuntimeSnapIndex();
    index.resolve({ x: 4.02, z: 0 }, core.getSnapshot(), 'level_1', [], points);
    const replacement = createEmptyProject('Replacement');
    replacement.id = 'replacement-project';
    const result = index.resolve({ x: 4.02, z: 0 }, replacement, 'level_1', [], points);
    expect(result).toMatchObject({ kind: 'raw', point: { x: 4.02, z: 0 } });
    expect(result.objectId).not.toBe(wall.id);
    expect(index.diagnostics()).toMatchObject({ objectBuilds: 4, rebuilds: 2, queries: 2 });
  });

  test('switching levels excludes ghost targets and rebuilds only on each level change', () => {
    const { core, wall, ghost } = fixture();
    const index = new RuntimeSnapIndex();
    const document = core.getSnapshot();
    const raw = { x: 10.02, z: 10.03 };
    expect(index.resolve(raw, document, 'level_1', [], points).kind).toBe('raw');
    expect(index.resolve(raw, document, 'level_2', [], points)).toMatchObject({
      objectId: ghost.id,
      levelId: 'level_2',
      point: ghost.start,
    });
    expect(index.resolve({ x: 0.02, z: 0.03 }, document, 'level_2', [], points).kind).toBe('raw');
    expect(index.resolve({ x: 0.02, z: 0.03 }, document, 'level_1', [], points)).toMatchObject({
      objectId: wall.id,
    });
    expect(index.diagnostics()).toMatchObject({ objectBuilds: 9, rebuilds: 3, queries: 4 });
  });

  test('hidden objects and openings on a hidden host are excluded, then restored when visible', () => {
    const { core, wall, slab, opening } = fixture();
    const index = new RuntimeSnapIndex();
    const document = core.getSnapshot();
    const corner = { x: 1.01, z: 0.11 };
    expect(index.resolve(corner, document, 'level_1', [], points)).toMatchObject({
      objectId: opening.id,
      targetKind: 'opening-corner',
      point: { x: 1, z: 0.1 },
    });
    for (const hidden of [[opening.id], [wall.id]]) {
      expect(index.resolve(corner, document, 'level_1', hidden, points).kind).toBe('raw');
    }
    expect(index.resolve({ x: 4.01, z: 0.01 }, document, 'level_1', [wall.id], points).kind).toBe(
      'raw',
    );
    expect(index.resolve({ x: -2.02, z: -2.02 }, document, 'level_1', [slab.id], points).kind).toBe(
      'raw',
    );
    expect(index.resolve(corner, document, 'level_1', [], points).objectId).toBe(opening.id);
  });

  test('current edited object is filtered per query without rebuilding the shared index', () => {
    const { core, wall, second } = fixture();
    const index = new RuntimeSnapIndex();
    const document = core.getSnapshot();
    const raw = { x: 0.02, z: 0.03 };
    expect(index.resolve(raw, document, 'level_1', [], points).objectId).toBe(wall.id);
    expect(index.resolve(raw, document, 'level_1', [], points, wall.id)).toMatchObject({
      point: raw,
      kind: 'raw',
    });
    expect(
      index.resolve({ x: 6.02, z: 2.03 }, document, 'level_1', [], points, wall.id).objectId,
    ).toBe(second.id);
    expect(index.resolve(raw, document, 'level_1', [], points).objectId).toBe(wall.id);
    expect(index.diagnostics()).toMatchObject({ objectBuilds: 4, rebuilds: 1, queries: 4 });
  });

  test('a wall drag excludes its own hosted opening anchors', () => {
    const { core, wall } = fixture();
    const index = new RuntimeSnapIndex();
    const raw = { x: 1.01, z: 0.11 };
    expect(index.resolve(raw, core.getSnapshot(), 'level_1', [], points, wall.id)).toMatchObject({
      point: raw,
      kind: 'raw',
    });
  });

  test('temporary bypass returns precise raw coordinates without creating a candidate index', () => {
    const { core, wall } = fixture();
    const index = new RuntimeSnapIndex();
    const document = core.getSnapshot();
    const session = { levelId: 'level_1', hiddenIds: [], snap: points };
    const raw = { x: 0.0123456789, z: 0.0234567891 };
    const bypassed = index.resolvePointer(raw, true, document, session);
    expect(bypassed).toMatchObject({ point: raw, kind: 'raw', distance: 0 });
    expect(bypassed.point).not.toBe(raw);
    expect(index.diagnostics()).toMatchObject({
      objectBuilds: 0,
      rebuilds: 0,
      queries: 0,
      candidates: 0,
    });
    expect(index.resolvePointer(raw, false, document, session).objectId).toBe(wall.id);
    expect(index.resolvePointer(raw, true, document, session).kind).toBe('raw');
    expect(index.resolvePointer(raw, false, document, session).objectId).toBe(wall.id);
    expect(index.diagnostics()).toMatchObject({ objectBuilds: 4, rebuilds: 1, queries: 2 });
    expect(core.getSnapshot()).toBe(document);
    expect(core.getHistoryState().undoCount).toBe(0);
  });

  test('setting changes resolve from one index and disabled mode preserves raw input', () => {
    const { core, wall } = fixture();
    const index = new RuntimeSnapIndex();
    const document = core.getSnapshot();
    const raw = { x: 0.023456789, z: 0.034567891 };
    expect(index.resolve(raw, document, 'level_1', [], points).objectId).toBe(wall.id);
    for (const snap of [
      { ...points, enabled: false },
      { ...points, mode: 'off' as const },
    ]) {
      expect(
        index.resolvePointer(raw, false, document, { levelId: 'level_1', hiddenIds: [], snap }),
      ).toMatchObject({
        kind: 'raw',
        point: raw,
        distance: 0,
      });
    }
    expect(index.resolve(raw, document, 'level_1', [], points).objectId).toBe(wall.id);
    expect(index.diagnostics()).toMatchObject({ objectBuilds: 4, rebuilds: 1 });
  });

  test('feedback changes once per target type and clears once when a target disappears or bypasses', () => {
    const { core } = fixture();
    const index = new RuntimeSnapIndex();
    const status = vi.fn<(code: string) => void>();
    const document = core.getSnapshot();
    const session = { levelId: 'level_1', hiddenIds: [], snap: points };
    for (const raw of [
      { x: 0.01, z: 0.02 },
      { x: 0.03, z: 0.01 },
    ]) {
      index.publishFeedback(index.resolvePointer(raw, false, document, session), status);
    }
    expect(status).toHaveBeenCalledExactlyOnceWith('snap.wall-endpoint');
    const line = index.resolve({ x: 2, z: 0.02 }, document, 'level_1', [], {
      ...points,
      mode: 'lines',
    });
    index.publishFeedback(line, status);
    index.publishFeedback(line, status);
    expect(status.mock.calls.map(([code]) => code)).toEqual([
      'snap.wall-endpoint',
      'snap.wall-centerline',
    ]);
    const raw = index.resolvePointer({ x: 0.01, z: 0.02 }, true, document, session);
    index.publishFeedback(raw, status);
    index.publishFeedback(raw, status);
    expect(status.mock.calls.map(([code]) => code)).toEqual([
      'snap.wall-endpoint',
      'snap.wall-centerline',
      'snap.none',
    ]);
  });

  test('reset clears one active feedback and releases candidates before rebuilding the next query', () => {
    const { core } = fixture();
    const index = new RuntimeSnapIndex();
    const status = vi.fn<(code: string) => void>();
    const document = core.getSnapshot();
    const result = index.resolve({ x: 0.02, z: 0.02 }, document, 'level_1', [], points);
    index.publishFeedback(result, status);
    index.reset(status);
    index.reset(status);
    expect(status.mock.calls.map(([code]) => code)).toEqual(['snap.wall-endpoint', 'snap.none']);
    const next = index.resolve({ x: 0.02, z: 0.02 }, document, 'level_1', [], points);
    index.publishFeedback(next, status);
    expect(status.mock.calls.map(([code]) => code)).toEqual([
      'snap.wall-endpoint',
      'snap.none',
      'snap.wall-endpoint',
    ]);
    expect(index.diagnostics()).toMatchObject({ objectBuilds: 8, rebuilds: 2, queries: 2 });
  });

  test('camera feedback clearing retains the world index and permits a new target announcement', () => {
    const { core } = fixture();
    const index = new RuntimeSnapIndex();
    const status = vi.fn<(code: string) => void>();
    const document = core.getSnapshot();
    const result = index.resolve({ x: 0.02, z: 0.02 }, document, 'level_1', [], points);
    index.publishFeedback(result, status);
    const candidates = index.diagnostics().candidates;
    index.clearFeedback(status);
    index.clearFeedback(status);
    expect(index.diagnostics()).toMatchObject({ objectBuilds: 4, rebuilds: 1, candidates });
    expect(status.mock.calls.map(([code]) => code)).toEqual(['snap.wall-endpoint', 'snap.none']);
    const next = index.resolve({ x: 0.02, z: 0.02 }, document, 'level_1', [], points);
    index.publishFeedback(next, status);
    expect(index.diagnostics()).toMatchObject({ objectBuilds: 4, rebuilds: 1, queries: 2 });
    expect(status.mock.calls.map(([code]) => code)).toEqual([
      'snap.wall-endpoint',
      'snap.none',
      'snap.wall-endpoint',
    ]);
  });
});
