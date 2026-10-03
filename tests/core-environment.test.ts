import { describe, expect, it } from 'vitest';
import {
  EditorCore,
  createEmptyProject,
  createExampleProject,
  defaultEnvironmentSettings,
  getEnvironmentSettings,
  inspectEnvironmentBytes,
  environmentResourceBytes,
  ENVIRONMENT_LIMITS,
  validateDocument,
} from '@building/editor-core';
import { environmentFixture, hdrPanorama, exrPanorama } from './environment-fixtures';

describe('formal environment assets and transactional lighting', () => {
  it('keeps old v1 projects unchanged and opt-in lighting absent', () => {
    const document = createEmptyProject();
    const core = new EditorCore(document);
    expect(core.getSnapshot()).toEqual(document);
    expect(core.getSnapshot()).not.toHaveProperty('environment');
    expect(core.getSnapshot()).not.toHaveProperty('environmentResources');
    expect(getEnvironmentSettings(document)).toEqual(defaultEnvironmentSettings());
  });
  it('imports and sets a panorama atomically, undo restores old assets/settings, geometry remains shared', () => {
    const core = new EditorCore(createExampleProject()),
      before = core.getSnapshot(),
      resource = environmentFixture();
    const result = core.execute({
      type: 'batch',
      commands: [
        { type: 'add-environment-resource', resource },
        {
          type: 'set-environment',
          environment: { resourceId: resource.id, intensity: 2, rotation: 90, background: true },
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.code);
    }
    expect(result.changeSet.environmentChanged).toBe(true);
    expect(result.changeSet.environmentResourceIds).toEqual([resource.id]);
    expect(result.changeSet.wallIds).toEqual([]);
    expect(result.changeSet.openingIds).toEqual([]);
    expect(core.getSnapshot().walls).toBe(before.walls);
    expect(core.getSnapshot().resources).toBe(before.resources);
    expect(core.getHistoryState().undoCount).toBe(1);
    expect(core.isDirty()).toBe(true);
    core.undo();
    expect(core.getSnapshot().environment).toBeUndefined();
    expect(core.getSnapshot().environmentResources).toBeUndefined();
    core.redo();
    expect(core.getSnapshot().environment?.resourceId).toBe(resource.id);
    const unchanged = core.getSnapshot();
    core.markSaved(unchanged.revision);
    core.execute({
      type: 'set-environment',
      environment: { ...unchanged.environment!, rotation: 180 },
    });
    expect(core.markSaved(unchanged.revision)).toBe(false);
  });
  it('rejects missing assets, invalid limits and malformed additions without history or mutation', () => {
    const core = new EditorCore(),
      before = core.getSnapshot();
    for (const environment of [
      { resourceId: 'missing', intensity: 1, rotation: 0, background: false },
      { intensity: 11, rotation: 0, background: false },
      { intensity: 1, rotation: -1, background: false },
    ]) {
      expect(core.execute({ type: 'set-environment', environment }).ok).toBe(false);
    }
    expect(
      core.execute({
        type: 'batch',
        commands: [
          { type: 'add-environment-resource', resource: environmentFixture() },
          {
            type: 'set-environment',
            environment: { intensity: 1, rotation: 361, background: true },
          },
        ],
      }).ok,
    ).toBe(false);
    expect(core.getSnapshot()).toBe(before);
    expect(core.getHistoryState().undoCount).toBe(0);
  });
  it('cannot use HDR/EXR as ordinary wall images and protects an active environment asset', () => {
    const core = new EditorCore(createExampleProject()),
      resource = environmentFixture('image/x-exr');
    expect(core.execute({ type: 'add-resource', resource }).ok).toBe(false);
    core.execute({
      type: 'batch',
      commands: [
        { type: 'add-environment-resource', resource },
        {
          type: 'set-environment',
          environment: { resourceId: resource.id, ...defaultEnvironmentSettings() },
        },
      ],
    });
    expect(
      core.execute({
        type: 'set-material',
        objectId: core.getSnapshot().walls[0]!.id,
        side: 'A',
        binding: { ...core.getSnapshot().walls[0]!.materials.A, resourceId: resource.id },
      }).ok,
    ).toBe(false);
    expect(core.execute({ type: 'delete-environment-resource', id: resource.id })).toMatchObject({
      ok: false,
      error: { code: 'environment.resourceInUse' },
    });
    expect(
      core.execute({
        type: 'batch',
        commands: [
          { type: 'set-environment', environment: defaultEnvironmentSettings() },
          { type: 'delete-environment-resource', id: resource.id },
        ],
      }).ok,
    ).toBe(true);
    core.undo();
    expect(core.getSnapshot().environment?.resourceId).toBe(resource.id);
    expect(core.getSnapshot().environmentResources).toHaveLength(1);
  });
  it('checks real binary dimensions and signatures without DOM or MIME guessing from extensions', () => {
    expect(inspectEnvironmentBytes(hdrPanorama())).toEqual({
      mime: 'image/vnd.radiance',
      width: 4,
      height: 2,
    });
    expect(inspectEnvironmentBytes(exrPanorama())).toEqual({
      mime: 'image/x-exr',
      width: 4,
      height: 2,
    });
    expect(environmentResourceBytes(environmentFixture())).toEqual(hdrPanorama());
    expect(() => inspectEnvironmentBytes(new Uint8Array([1, 2, 3]))).toThrow();
    const oversized = new TextEncoder().encode(
      '#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 4096 +X 8193\n1234',
    );
    expect(() => inspectEnvironmentBytes(oversized)).toThrow(/8192/);
    expect(ENVIRONMENT_LIMITS.maxBytes).toBe(64 * 1024 * 1024);
    const unknown = {
      ...createEmptyProject(),
      environment: { ...defaultEnvironmentSettings(), unknown: true },
    };
    expect(validateDocument(unknown).ok).toBe(false);
  });
});
