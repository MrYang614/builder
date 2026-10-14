import { describe, expect, it } from 'vitest';
import { createWall, EditorCore, createEmptyProject } from '@building/editor-core';
import { CommandGateway } from './command-gateway';

describe('CommandGateway', () => {
  it('rejects stale project, revision and document epoch writes', () => {
    const core = new EditorCore(createEmptyProject());
    const gateway = new CommandGateway(core);
    const wall = createWall(core.getSnapshot().levels[0]!.id, { x: 0, z: 0 }, { x: 2, z: 0 });
    const initial = gateway.getSnapshot();

    expect(
      gateway.execute({ type: 'add-wall', wall }, { baseRevision: initial.revision + 1 }),
    ).toMatchObject({
      ok: false,
      error: { code: 'revision.conflict' },
    });
    expect(
      gateway.execute({ type: 'add-wall', wall }, { documentEpoch: initial.documentEpoch + 1 }),
    ).toMatchObject({
      ok: false,
      error: { code: 'document_epoch.conflict' },
    });
    expect(
      gateway.execute({ type: 'add-wall', wall }, { projectId: 'other-project' }),
    ).toMatchObject({
      ok: false,
      error: { code: 'revision.conflict' },
    });
    expect(core.getSnapshot().walls).toHaveLength(0);
  });

  it('dry-runs without consuming an active pointer preview', () => {
    const core = new EditorCore(createEmptyProject());
    const gateway = new CommandGateway(core);
    const levelId = core.getSnapshot().levels[0]!.id;
    const previewWall = createWall(levelId, { x: 0, z: 0 }, { x: 2, z: 0 });
    const dryRunWall = createWall(levelId, { x: 0, z: 1 }, { x: 2, z: 1 });
    const token = core.beginPreview();
    expect(core.preview(token, { type: 'add-wall', wall: previewWall }).ok).toBe(true);

    expect(gateway.dryRun({ type: 'add-wall', wall: dryRunWall }).ok).toBe(true);
    expect(core.commitPreview(token).ok).toBe(true);
    expect(core.getSnapshot().walls.map((wall) => wall.id)).toEqual([previewWall.id]);
  });

  it('does not advance the epoch when replacement validation fails', () => {
    const core = new EditorCore(createEmptyProject());
    const gateway = new CommandGateway(core);
    const before = gateway.getSnapshot();

    expect(gateway.replace({ schemaVersion: 999 })).toMatchObject({ ok: false });
    expect(gateway.getSnapshot()).toEqual(before);
  });
});
