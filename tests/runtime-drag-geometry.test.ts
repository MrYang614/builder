import { describe, expect, test } from 'vitest';
import { createOpening, createSlab, createWall, type Slab, type Wall } from '@building/editor-core';
import { dragGeometry } from '../packages/three-runtime/src/drag-geometry';

describe('resolved geometric drag coordinates', () => {
  test.each(['door', 'window'] as const)(
    '%s body moves preserve fractional offsets when snapping is disabled or bypassed',
    (kind) => {
      const host = createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 0 });
      const opening = createOpening(host, kind, 0.75);
      const point = { x: 1.23456789, z: 0 };
      const draft = dragGeometry(opening, { x: 1, z: 0 }, point, undefined, undefined, host);
      expect(draft).toMatchObject({ offset: 0.75 + point.x - 1 });
      expect(opening.offset).toBe(0.75);
    },
  );
  test('wall body moves assign the snapped anchor exactly despite decimal cancellation', () => {
    const wall = createWall(
      'level_1',
      { x: 1.234567891, z: 2.345678912 },
      { x: 4, z: 2.345678912 },
    );
    const before = structuredClone(wall);
    const point = { x: -0.012345678912, z: -0.023456789123 };
    expect(wall.start.x + (point.x - wall.start.x)).not.toBe(point.x);
    const draft = dragGeometry(
      wall,
      wall.start,
      point,
      undefined,
      undefined,
      undefined,
      true,
    ) as Wall;
    expect(draft.start).toEqual(point);
    expect(draft.start).not.toBe(point);
    expect(draft.end.x - draft.start.x).toBeCloseTo(wall.end.x - wall.start.x, 14);
    expect(draft.end.z).toBeCloseTo(point.z, 14);
    expect(wall).toEqual(before);
  });

  test('slab body and corner moves preserve the exact resolved vertex without changing formal geometry', () => {
    const slab = createSlab('level_1', { x: 1.234567891, z: 2.345678912 }, { x: 4, z: 5 });
    const before = structuredClone(slab);
    const point = { x: -0.012345678912, z: -0.023456789123 };
    const anchor = slab.polygon[0]!;
    expect(anchor.x + (point.x - anchor.x)).not.toBe(point.x);
    const body = dragGeometry(slab, anchor, point, undefined, undefined, undefined, true) as Slab;
    const corner = dragGeometry(slab, anchor, point, undefined, 0, undefined, true) as Slab;
    expect(body.polygon[0]).toEqual(point);
    expect(corner.polygon[0]).toEqual(point);
    expect(corner.polygon[2]).toEqual(slab.polygon[2]);
    expect(slab).toEqual(before);
  });
});
