import { beforeAll, describe, expect, it } from 'vitest';
import type { BufferGeometry, Object3D } from 'three';

let adapter: typeof import('./src/index');

beforeAll(async () => {
  if (!globalThis.document) {
    const documentStub = {
      createElementNS: () => ({
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        complete: false,
      }),
    } as unknown as Document;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: documentStub });
  }
  adapter = await import('./src/index');
});

describe('ez-tree adapter request boundary', () => {
  it('normalizes seed, defaults, and clamps numeric fields without mutating input', async () => {
    const input = {
      seed: -1,
      options: { branch: { levels: 2 } },
      material: { leafAlphaTest: 4 },
      wind: { strength: -1, frequency: 20, scale: 200 },
    } as const;
    const result = adapter.normalizeEzTreeRequest(input);
    expect(result.seed).toBe(0xffffffff);
    expect(result.preset).toBe('Oak Medium');
    expect(result.detail).toBe('medium');
    expect(result.material?.leafAlphaTest).toBe(1);
    expect(result.wind).toMatchObject({ strength: 0, frequency: 10, scale: 100 });
    expect(input.material.leafAlphaTest).toBe(4);
  });

  it('rejects non-finite and non-JSON option values', async () => {
    expect(() => adapter.normalizeEzTreeRequest({ seed: Number.NaN })).toThrow(/finite/);
    expect(() =>
      adapter.normalizeEzTreeRequest({ seed: 1, options: { invalid: Number.POSITIVE_INFINITY } }),
    ).toThrow(/finite/);
    expect(() => adapter.createEzTreeMaterialInput({ barkColor: 'rgb(foo)' })).toThrow(
      /supported CSS color/,
    );
  });

  it('reports the pinned upstream capability boundary', () => {
    expect(adapter.getEzTreeCapabilities()).toEqual({
      supportsPresets: true,
      supportsGeometryOutput: true,
      supportsLods: false,
      supportsWind: false,
      supportsMaterialInjection: false,
    });
  });
});

describe('ez-tree adapter runtime', () => {
  it('creates deterministic tree and geometry results and disposes them repeatedly', () => {
    const first = adapter.createEzTree({ seed: 12345, preset: 'oak', detail: 'low' });
    const second = adapter.createEzTree({ seed: 12345, preset: 'oak', detail: 'low' });
    const different = adapter.createEzTree({ seed: 12346, preset: 'oak', detail: 'low' });
    const positionChecksum = (object: Object3D | undefined): number => {
      const geometry = (object as (Object3D & { geometry?: BufferGeometry }) | undefined)?.geometry;
      const attribute = geometry?.getAttribute('position');
      return attribute
        ? Array.from(attribute.array).reduce((sum, value, index) => sum + value * (index + 1), 0)
        : 0;
    };
    expect(first.object).toBeDefined();
    expect(first.seed).toBe(12345);
    expect(first.preset).toBe('Oak Small');
    expect(first.bounds.isEmpty()).toBe(false);
    expect(first.object.children.length).toBeGreaterThan(0);
    expect(positionChecksum(first.branches)).toBe(positionChecksum(second.branches));
    expect(positionChecksum(first.branches)).not.toBe(positionChecksum(different.branches));
    first.dispose();
    first.dispose();
    second.dispose();
    different.dispose();

    const geometry = adapter.createEzTreeGeometry({ seed: 12345, preset: 'oak', detail: 'low' });
    expect(geometry.branches).toBeDefined();
    expect(geometry.leaves).toBeDefined();
    expect(geometry.vertexCount).toBeGreaterThan(0);
    expect(geometry.triangleCount).toBeGreaterThan(0);
    geometry.dispose();
    geometry.dispose();
  });

  it('marks LOD fallback and unsupported material resources', () => {
    const lods = adapter.createEzTreeLods({
      seed: 7,
      material: { barkTextureId: 'project://bark', leafDoubleSided: false },
    });
    expect(lods.fallback).toBe(true);
    expect(lods.levels).toHaveLength(1);
    expect(lods.warnings.map((warning) => warning.code)).toContain('unsupported-lod');
    expect(lods.warnings.map((warning) => warning.code)).toContain('unsupported-material-field');
    lods.dispose();
  });
});
