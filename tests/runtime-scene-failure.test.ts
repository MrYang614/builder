import type { Mesh } from 'three';
import { BufferGeometry, MeshStandardMaterial, Texture, TextureLoader } from 'three';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createEmptyProject, createWall } from '@building/editor-core';
import { buildBuilding, buildObject } from '@building/three-runtime/scene';
import { ResourcePool } from '@building/three-runtime/materials';
import { RuntimeBuilding } from '../packages/three-runtime/src/runtime-building';

afterEach(() => vi.restoreAllMocks());

function project() {
  const document = createEmptyProject();
  const first = createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 0 });
  first.id = 'accepted-wall';
  const second = createWall('level_1', { x: 0, z: 2 }, { x: 4, z: 2 });
  second.id = 'failing-wall';
  document.walls.push(first, second);
  return { document, first, second };
}

describe('scene construction failure ownership', () => {
  test('the live building owner releases all objects and its pool after a geometry disposal event fails', () => {
    const { document, first } = project();
    const owner = new RuntimeBuilding(document, vi.fn(), vi.fn());
    owner.sync(document);
    const mesh = owner.get(first.id)!.root.children[0] as Mesh;
    mesh.geometry.addEventListener('dispose', () => {
      throw new Error('injected live geometry cleanup failure');
    });
    expect(() => owner.dispose()).toThrow(AggregateError);
    expect(owner.diagnostics()).toMatchObject({
      objects: 0,
      resources: { materials: 0, textures: 0, references: 0 },
    });
    expect(owner.root.children).toHaveLength(0);
    expect(() => owner.dispose()).not.toThrow();
  });

  test.each(['replace', 'update'] as const)(
    'a committed %s still reconciles live geometry after previous cleanup fails',
    (operation) => {
      const { document, first } = project();
      const status = vi.fn();
      const owner = new RuntimeBuilding(document, vi.fn(), status);
      owner.sync(document);
      const previous = [...owner.entries()].map(([, built]) => built.root);
      const oldPool = Reflect.get(owner, 'resources') as ResourcePool;
      const mesh = owner.get(first.id)!.root.children[0] as Mesh;
      mesh.geometry.addEventListener('dispose', () => {
        throw new Error('injected live geometry cleanup failure');
      });
      const next = {
        ...document,
        id: operation === 'replace' ? 'replacement-project' : document.id,
        revision: document.revision + 1,
        walls: [first],
      };
      expect(() => owner.sync(next)).not.toThrow();
      expect(owner.document).toBe(next);
      expect(owner.diagnostics().objects).toBe(1);
      expect(owner.root.children).toHaveLength(1);
      expect(previous.every((root) => root.children.length === 0)).toBe(true);
      expect(status).toHaveBeenCalledExactlyOnceWith('render.cleanupFailed', {
        reason: 'AggregateError: runtime.cleanupFailed',
      });
      if (operation === 'replace') {
        expect(oldPool.stats).toEqual({ materials: 0, textures: 0, references: 0 });
      }
      owner.dispose();
      expect(owner.diagnostics().resources).toEqual({ materials: 0, textures: 0, references: 0 });
    },
  );

  test.each([false, true])(
    'image completion reports a decode failure only for the retained document (superseded: %s)',
    async (superseded) => {
      const { document } = project();
      let reject!: (reason: Error) => void;
      const pending = new Promise<void>((_resolve, fail) => {
        reject = fail;
      });
      vi.spyOn(ResourcePool.prototype, 'ready')
        .mockReturnValueOnce(pending)
        .mockResolvedValue(undefined);
      const status = vi.fn();
      const owner = new RuntimeBuilding(document, vi.fn(), status);
      owner.sync(document);
      if (superseded) {
        owner.sync({ ...document, revision: document.revision + 1, walls: [] });
      }
      reject(new Error('delayed decode failure'));
      await pending.catch(() => undefined);
      await Promise.resolve();
      if (superseded) {
        expect(status).not.toHaveBeenCalled();
        expect(owner.diagnostics().objects).toBe(0);
      } else {
        expect(status).toHaveBeenCalledExactlyOnceWith('resource.failed', {
          reason: 'Error: delayed decode failure',
        });
      }
      owner.dispose();
    },
  );

  test('a material allocation failure rolls back its geometry and leases while preserving existing shared consumers', () => {
    const { document, first, second } = project();
    const pool = new ResourcePool(document);
    const accepted = buildObject(document, first.id, pool);
    const acceptedStats = pool.stats;
    const dispose = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const acquire = pool.acquire.bind(pool);
    let attempts = 0;
    vi.spyOn(pool, 'acquire').mockImplementation((binding, options) => {
      if (++attempts === 2) {
        throw new Error('injected material allocation failure');
      }
      return acquire(binding, options);
    });
    expect(() => buildObject(document, second.id, pool)).toThrow('material allocation failure');
    expect(attempts).toBe(2);
    expect(dispose).toHaveBeenCalledOnce();
    expect(pool.stats).toEqual(acceptedStats);
    expect(accepted.root.children).toHaveLength(1);
    accepted.dispose();
    expect(pool.stats).toEqual({ materials: 0, textures: 0, references: 0 });
    pool.dispose();
  });

  test('a clean snapshot failure releases completed objects and its private pool before propagating the error', () => {
    const { document, second } = project();
    second.materials.B.resourceId = 'missing-image';
    const disposeGeometry = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const disposePool = vi.spyOn(ResourcePool.prototype, 'dispose');
    expect(() => buildBuilding(document)).toThrow('runtime.resourceMissing:missing-image');
    expect(disposeGeometry).toHaveBeenCalledTimes(2);
    expect(disposePool).toHaveBeenCalledOnce();
    const ownedPool = disposePool.mock.contexts[0] as ResourcePool;
    expect(ownedPool.stats).toEqual({
      materials: 0,
      textures: 0,
      references: 0,
    });
  });

  test('rollback preserves the construction failure and releases remaining leases after a buffer disposer throws', () => {
    const { document, second } = project();
    second.materials.B.resourceId = 'missing-image';
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const disposeGeometry = vi
      .spyOn(BufferGeometry.prototype, 'dispose')
      .mockImplementationOnce(() => {
        throw new Error('injected geometry cleanup failure');
      });
    const disposePool = vi.spyOn(ResourcePool.prototype, 'dispose');
    expect(() => buildBuilding(document)).toThrow('runtime.resourceMissing:missing-image');
    expect(disposeGeometry).toHaveBeenCalledTimes(2);
    expect(disposePool).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledOnce();
    const ownedPool = disposePool.mock.contexts[0] as ResourcePool;
    expect(ownedPool.stats).toEqual({ materials: 0, textures: 0, references: 0 });
  });

  test('normal disposal reports cleanup failure after releasing the remaining objects and stays idempotent', () => {
    const { document } = project();
    const built = buildBuilding(document);
    const disposeGeometry = vi
      .spyOn(BufferGeometry.prototype, 'dispose')
      .mockImplementationOnce(() => {
        throw new Error('injected geometry cleanup failure');
      });
    expect(() => built.dispose()).toThrow(AggregateError);
    expect(disposeGeometry).toHaveBeenCalledTimes(2);
    expect(built.resources.stats).toEqual({ materials: 0, textures: 0, references: 0 });
    expect(built.root.children).toHaveLength(0);
    expect(() => built.dispose()).not.toThrow();
    expect(disposeGeometry).toHaveBeenCalledTimes(2);
  });

  test('a failing final material release still releases its texture and removes all lease accounting', () => {
    const { document, first } = project();
    document.resources.push({
      id: 'texture',
      name: 'texture',
      mime: 'image/png',
      dataUrl: 'data:image/png;base64,fixture',
    });
    const texture = new Texture<HTMLImageElement>();
    const disposeTexture = vi.spyOn(texture, 'dispose');
    vi.spyOn(TextureLoader.prototype, 'load').mockReturnValue(texture);
    const pool = new ResourcePool(document);
    const lease = pool.acquire({ ...first.materials.A, resourceId: 'texture' });
    vi.spyOn(lease.material, 'dispose').mockImplementation(() => {
      throw new Error('injected material cleanup failure');
    });
    expect(() => lease.release()).toThrow(AggregateError);
    expect(disposeTexture).toHaveBeenCalledOnce();
    expect(pool.stats).toEqual({ materials: 0, textures: 0, references: 0 });
    expect(() => lease.release()).not.toThrow();
    expect(() => pool.dispose()).not.toThrow();
    expect(disposeTexture).toHaveBeenCalledOnce();
  });

  test('synchronous texture allocation failure releases the new material without replacing the primary failure', () => {
    const { document, first } = project();
    document.resources.push({
      id: 'texture',
      name: 'texture',
      mime: 'image/png',
      dataUrl: 'data:image/png;base64,fixture',
    });
    const primary = new Error('texture allocation failure');
    vi.spyOn(TextureLoader.prototype, 'load').mockImplementation(() => {
      throw primary;
    });
    const disposeMaterial = vi
      .spyOn(MeshStandardMaterial.prototype, 'dispose')
      .mockImplementation(() => {
        throw new Error('material cleanup failure');
      });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pool = new ResourcePool(document);
    let failure: unknown;
    try {
      pool.acquire({ ...first.materials.A, resourceId: 'texture' });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBe(primary);
    expect(disposeMaterial).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledOnce();
    expect(pool.stats).toEqual({ materials: 0, textures: 0, references: 0 });
    pool.dispose();
  });
});
