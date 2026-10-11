import { describe, expect, it } from 'vitest';
import {
  EditorCore,
  createEmptyProject,
  createOpening,
  createWall,
  defaultSurface,
  freezeDocument,
  validateDocument,
} from '@building/editor-core';
import { buildWallGeometry } from '@building/building-geometry';

describe('review regressions for immutable commands and geometry validation', () => {
  it('rejects the latest invalid preview instead of committing an earlier valid candidate', () => {
    const document = createEmptyProject();
    const wall = createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 0 });
    const opening = createOpening(wall, 'door', 1);
    document.walls.push(wall);
    document.openings.push(opening);
    const core = new EditorCore(document);
    const before = core.getSnapshot();
    const token = core.beginPreview();
    expect(
      core.preview(token, { type: 'update-opening', id: opening.id, patch: { offset: 2 } }).ok,
    ).toBe(true);
    const invalid = core.preview(token, {
      type: 'update-opening',
      id: opening.id,
      patch: { offset: 99 },
    });
    expect(invalid.ok).toBe(false);
    expect(core.commitPreview(token)).toMatchObject({
      ok: false,
      error: { code: 'opening.outsideWall' },
    });
    expect(core.getSnapshot()).toBe(before);
    expect(core.getHistoryState().undoCount).toBe(0);
  });

  it('can recover from an invalid preview and commit the latest valid candidate once', () => {
    const document = createEmptyProject();
    const wall = createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 0 });
    const opening = createOpening(wall, 'door', 1);
    document.walls.push(wall);
    document.openings.push(opening);
    const core = new EditorCore(document);
    const token = core.beginPreview();
    expect(
      core.preview(token, { type: 'update-opening', id: opening.id, patch: { offset: 99 } }).ok,
    ).toBe(false);
    expect(
      core.preview(token, { type: 'update-opening', id: opening.id, patch: { offset: 2 } }).ok,
    ).toBe(true);
    expect(core.commitPreview(token).ok).toBe(true);
    expect(core.getSnapshot().openings[0]!.offset).toBe(2);
    expect(core.getHistoryState().undoCount).toBe(1);
    core.undo();
    expect(core.getSnapshot().openings[0]!.offset).toBe(1);
  });

  it.each([{ color: ['#123456'] }, { color: null }, { color: 0 }])(
    'rejects a nonstring material color: %j',
    ({ color }) => {
      const document = createEmptyProject();
      const wall = createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 0 });
      Object.assign(wall.materials.A, { color });
      document.walls.push(wall);
      expect(validateDocument(document)).toMatchObject({
        ok: false,
        error: { code: 'material.invalid' },
      });
    },
  );

  it.each(['', false, null, 0])(
    'rejects an invalid optional material resource ID: %j',
    (resourceId) => {
      const document = createEmptyProject();
      const wall = createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 0 });
      wall.materials.A = Object.assign(defaultSurface(), { resourceId });
      document.walls.push(wall);
      expect(validateDocument(document)).toMatchObject({
        ok: false,
        error: { code: 'material.invalid' },
      });
    },
  );

  it('deeply freezes descendants of an externally shallow-frozen container', () => {
    const nested = { point: { x: 1, z: 2 } };
    const container = Object.freeze({ nested });
    expect(freezeDocument(container)).toBe(container);
    expect(Object.isFrozen(nested)).toBe(true);
    expect(Object.isFrozen(nested.point)).toBe(true);
  });

  it('rejects an axis deviation at the geometry tolerance boundary before installing it', () => {
    const document = createEmptyProject();
    const wall = createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 1e-7 });
    document.walls.push(wall);
    expect(() => buildWallGeometry(document, wall.id)).toThrow('geometry.nonOrthogonalWall');
    expect(validateDocument(document)).toMatchObject({ ok: false });
  });

  it('does not trust resources merely validated while they were still mutable', () => {
    const document = createEmptyProject();
    const resource = {
      id: 'image_1',
      name: 'image.png',
      mime: 'image/png',
      dataUrl: 'data:image/png;base64,aGVsbG8=',
    };
    document.resources.push(resource);
    expect(validateDocument(document)).toEqual({ ok: true });
    resource.dataUrl = 'invalid';
    Object.freeze(resource);
    expect(validateDocument(document)).toMatchObject({
      ok: false,
      error: { code: 'resource.invalid' },
    });
    expect(() => new EditorCore(document)).toThrow('resource.invalid');
  });

  it('does not install unsafe revisions when a loaded project exhausts the integer clock', () => {
    const document = createEmptyProject();
    document.revision = Number.MAX_SAFE_INTEGER;
    const core = new EditorCore(document);
    const before = core.getSnapshot();
    expect(core.execute({ type: 'rename-project', name: 'Changed' })).toMatchObject({ ok: false });
    expect(core.getSnapshot()).toBe(before);
    expect(core.getHistoryState().undoCount).toBe(0);
    expect(core.isDirty()).toBe(false);
    expect(validateDocument(core.getSnapshot())).toEqual({ ok: true });
  });

  it('retains undo history if a fresh undo revision cannot be represented safely', () => {
    const document = createEmptyProject();
    document.revision = Number.MAX_SAFE_INTEGER - 1;
    const core = new EditorCore(document);
    expect(core.execute({ type: 'rename-project', name: 'Changed' }).ok).toBe(true);
    const before = core.getSnapshot();
    expect(core.undo()).toMatchObject({ ok: false });
    expect(core.getSnapshot()).toBe(before);
    expect(core.getHistoryState()).toMatchObject({ undoCount: 1, redoCount: 0 });
    expect(validateDocument(core.getSnapshot())).toEqual({ ok: true });
  });

  it('retains redo history if a fresh redo revision cannot be represented safely', () => {
    const document = createEmptyProject();
    document.revision = Number.MAX_SAFE_INTEGER - 2;
    const core = new EditorCore(document);
    expect(core.execute({ type: 'rename-project', name: 'Changed' }).ok).toBe(true);
    expect(core.undo().ok).toBe(true);
    const before = core.getSnapshot();
    expect(core.redo()).toMatchObject({ ok: false });
    expect(core.getSnapshot()).toBe(before);
    expect(core.getHistoryState()).toMatchObject({ undoCount: 0, redoCount: 1 });
    expect(validateDocument(core.getSnapshot())).toEqual({ ok: true });
  });
});
