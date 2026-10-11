import { describe, expect, test } from 'vitest';
import { createEmptyProject, createOpening, createSlab, createWall } from '@building/editor-core';
import { dragAnchor } from '../packages/three-runtime/src/drag-anchor';

describe('formal drag anchors and pointer grab offsets', () => {
  test('a wall body retains the nearest formal endpoint and aligns it exactly with the resolved target', () => {
    const document = createEmptyProject();
    const wall = createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 0 });
    document.walls.push(wall);
    const before = structuredClone(document);
    const raw = { x: 3.4, z: 0.25 };
    const anchor = dragAnchor(wall, document, raw, true);
    expect(anchor.start).toBe(wall.end);
    expect(anchor.pointerOffset).toEqual({ x: wall.end.x - raw.x, z: -0.25 });
    expect(anchor.constraint).toBeUndefined();
    const pointer = { x: 5.4, z: 2.25 };
    const resolved = {
      x: pointer.x + anchor.pointerOffset!.x,
      z: pointer.z + anchor.pointerOffset!.z,
    };
    const movedEnd = {
      x: wall.end.x + resolved.x - anchor.start.x,
      z: wall.end.z + resolved.z - anchor.start.z,
    };
    expect(resolved).toEqual({ x: 6, z: 2 });
    expect(movedEnd).toEqual(resolved);
    expect(document).toEqual(before);
    expect(raw).toEqual({ x: 3.4, z: 0.25 });
  });

  test('equal-distance wall anchors use stable formal endpoint order', () => {
    const document = createEmptyProject();
    const wall = createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 0 });
    const raw = { x: 2, z: 0.1 };
    expect(dragAnchor(wall, document, raw, true).start).toBe(wall.start);
    expect(dragAnchor(wall, document, raw, true).start).toBe(wall.start);
  });

  test.each([
    { start: { x: 1, z: 2 }, end: { x: 5, z: 2 }, constraint: { z: 2 } },
    { start: { x: 5, z: 2 }, end: { x: 1, z: 2 }, constraint: { z: 2 } },
    { start: { x: 1, z: 2 }, end: { x: 1, z: 5 }, constraint: { x: 1 } },
    { start: { x: 1, z: 5 }, end: { x: 1, z: 2 }, constraint: { x: 1 } },
  ])(
    'wall endpoint edits retain the formal endpoint and its allowed axis: $start -> $end',
    (value) => {
      const document = createEmptyProject();
      const wall = createWall('level_1', value.start, value.end);
      const raw = { x: 3.125, z: 4.875 };
      for (const endpoint of ['start', 'end'] as const) {
        const anchor = dragAnchor(wall, document, raw, true, endpoint);
        expect(anchor.start).toBe(wall[endpoint]);
        expect(anchor.constraint).toEqual(value.constraint);
        expect(anchor.pointerOffset).toBeUndefined();
      }
    },
  );

  test('a slab body chooses its nearest formal vertex instead of the interior pointer position', () => {
    const document = createEmptyProject();
    const slab = createSlab('level_1', { x: -2, z: -2 }, { x: 2, z: 2 });
    const raw = { x: 1.5, z: 1.75 };
    const anchor = dragAnchor(slab, document, raw, true);
    expect(anchor.start).toBe(slab.polygon[2]);
    expect(anchor.pointerOffset).toEqual({ x: 0.5, z: 0.25 });
    expect(anchor.constraint).toBeUndefined();
    const pointer = { x: 4.5, z: 3.75 };
    expect({
      x: pointer.x + anchor.pointerOffset!.x,
      z: pointer.z + anchor.pointerOffset!.z,
    }).toEqual({ x: 5, z: 4 });
  });

  test('a slab corner edit retains the requested formal vertex even if another vertex is nearer', () => {
    const document = createEmptyProject();
    const slab = createSlab('level_1', { x: -2.123456789, z: -1.987654321 }, { x: 2, z: 2 });
    const raw = { x: 1.9, z: 1.9 };
    const anchor = dragAnchor(slab, document, raw, true, undefined, 0);
    expect(anchor.start).toBe(slab.polygon[0]);
    expect(anchor.start).toEqual({ x: -2.123456789, z: -1.987654321 });
    expect(anchor.pointerOffset).toBeUndefined();
    expect(anchor.constraint).toBeUndefined();
  });

  test.each([
    {
      start: { x: 0, z: 0 },
      end: { x: 4, z: 0 },
      raw: { x: 1.02, z: 0.14 },
      point: { x: 1, z: 0.1 },
      constraint: { z: 0.1 },
    },
    {
      start: { x: 0, z: 0 },
      end: { x: 0, z: 4 },
      raw: { x: -0.14, z: 1.02 },
      point: { x: -0.1, z: 1 },
      constraint: { x: -0.1 },
    },
  ])(
    'an opening uses its nearest real corner and locks movement to the host axis: $start -> $end',
    (value) => {
      const document = createEmptyProject();
      const wall = createWall('level_1', value.start, value.end);
      const opening = createOpening(wall, 'door', 1);
      document.walls.push(wall);
      const anchor = dragAnchor(opening, document, value.raw, true);
      expect(anchor.start).toEqual(value.point);
      expect(anchor.constraint).toEqual(value.constraint);
      expect(anchor.pointerOffset).toEqual({
        x: value.point.x - value.raw.x,
        z: value.point.z - value.raw.z,
      });
    },
  );

  test('disabled snapping retains precise raw coordinates for every object and handle', () => {
    const document = createEmptyProject();
    const wall = createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 0 });
    const slab = createSlab('level_1', { x: -2, z: -2 }, { x: 2, z: 2 });
    const opening = createOpening(wall, 'window', 1);
    const raw = { x: 0.123456789123, z: -0.987654321987 };
    for (const object of [wall, slab, opening]) {
      const anchor = dragAnchor(object, document, raw, false, 'start', 0);
      expect(anchor).toEqual({ start: raw });
      expect(anchor.start).toBe(raw);
    }
  });

  test('missing or degenerate opening hosts gracefully retain the raw drag origin', () => {
    const document = createEmptyProject();
    const wall = createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 0 });
    const opening = createOpening(wall, 'door', 1);
    const raw = { x: 0.123456789, z: -0.987654321 };
    expect(dragAnchor(opening, document, raw, true)).toEqual({ start: raw });
    wall.end = { ...wall.start };
    document.walls.push(wall);
    expect(dragAnchor(opening, document, raw, true)).toEqual({ start: raw });
  });

  test('empty slab and zero-length wall data return finite anchors without creating a draft', () => {
    const document = createEmptyProject();
    const raw = { x: 0.125, z: -0.75 };
    const slab = createSlab('level_1', { x: 0, z: 0 }, { x: 2, z: 2 });
    for (const corner of [-1, 4, Number.NaN]) {
      expect(dragAnchor(slab, document, raw, true, undefined, corner)).toEqual({ start: raw });
    }
    slab.polygon = [];
    expect(dragAnchor(slab, document, raw, true)).toEqual({
      start: raw,
      pointerOffset: { x: 0, z: 0 },
      constraint: undefined,
    });
    const wall = createWall('level_1', { x: 1, z: 2 }, { x: 1, z: 2 });
    const anchor = dragAnchor(wall, document, raw, true, 'end');
    expect(anchor).toEqual({
      start: wall.end,
      pointerOffset: undefined,
      constraint: { x: 1 },
    });
    expect(document.walls).toEqual([]);
  });
});
