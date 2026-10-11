import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createOpening,
  createWall,
  validateDocument,
} from '@building/editor-core';
import { buildWallGeometry, type GeometryData } from '@building/building-geometry';

function wallFaceArea(geometry: GeometryData): number {
  let area = 0;
  for (const group of geometry.groups.filter((candidate) => candidate.role === 'A')) {
    for (let offset = group.start; offset < group.start + group.count; offset += 3) {
      const a = geometry.indices[offset]! * 3;
      const b = geometry.indices[offset + 1]! * 3;
      const c = geometry.indices[offset + 2]! * 3;
      area +=
        Math.abs(
          (geometry.positions[b]! - geometry.positions[a]!) *
            (geometry.positions[c + 1]! - geometry.positions[a + 1]!) -
            (geometry.positions[b + 1]! - geometry.positions[a + 1]!) *
              (geometry.positions[c]! - geometry.positions[a]!),
        ) / 2;
    }
  }
  return area;
}

describe('review regressions for bounded geometry accumulation', () => {
  it('builds a valid wall with many distinct opening cuts without exceeding argument limits', () => {
    const document = createEmptyProject();
    const wall = createWall('level_1', { x: 0, z: 0 }, { x: 30, z: 0 });
    wall.height = 4;
    document.walls.push(wall);
    document.openings = Array.from({ length: 80 }, (_, index) => ({
      ...createOpening(wall, 'window', 0.2 + index * 0.35),
      width: 0.12,
      height: 0.2,
      sill: 0.1 + index * 0.03,
    }));
    expect(validateDocument(document)).toEqual({ ok: true });
    const geometry = buildWallGeometry(document, wall.id);
    expect(geometry.indices.length).toBeGreaterThan(100_000);
    expect(geometry.positions.length / 3).toBe(geometry.normals.length / 3);
    expect(geometry.uvs.length / 2).toBe(geometry.positions.length / 3);
    expect(geometry.groups.reduce((count, group) => count + group.count, 0)).toBe(
      geometry.indices.length,
    );
    expect(geometry.indices.every((index) => index < geometry.positions.length / 3)).toBe(true);
    expect(geometry.positions.every(Number.isFinite)).toBe(true);
    expect(geometry.uvs.every(Number.isFinite)).toBe(true);
    expect(wallFaceArea(geometry)).toBeCloseTo(30 * 4 - 80 * 0.12 * 0.2, 3);
  });
});
