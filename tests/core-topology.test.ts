import { describe, expect, it } from 'vitest';
import {
  EditorCore,
  createEmptyProject,
  createWall,
  createOpening,
  defaultSurface,
} from '@building/editor-core';
import { buildGeometry, deriveSurfacePaths } from '@building/building-geometry';
import type { GeometryData } from '@building/building-geometry';

function sideUV(data: GeometryData, x: number, z: number, side: 'A' | 'B'): number[] {
  const values: number[] = [];
  for (const group of data.groups.filter((candidate) => candidate.role === side)) {
    for (let i = group.start; i < group.start + group.count; i += 1) {
      const index = data.indices[i]!;
      if (
        Math.abs(data.positions[index * 3]! - x) < 1e-5 &&
        Math.abs(data.positions[index * 3 + 2]! - z) < 1e-5
      ) {
        values.push(data.uvs[index * 2]!);
      }
    }
  }
  return values;
}
function unmatchedEdges(data: GeometryData[]): string[] {
  const counts = new Map<string, number>();
  for (const geometry of data) {
    for (let i = 0; i < geometry.indices.length; i += 3) {
      const vertices = [0, 1, 2].map((offset) => {
        const index = geometry.indices[i + offset]! * 3;
        return [0, 1, 2].map((axis) => geometry.positions[index + axis]!.toFixed(5)).join(',');
      });
      for (let side = 0; side < 3; side += 1) {
        const key = [vertices[side]!, vertices[(side + 1) % 3]!].sort().join('|');
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return [...counts].filter(([, count]) => count !== 2).map(([key, count]) => `${count}:${key}`);
}

describe('command → topology → real union geometry and continuous UV regression', () => {
  it('updates L neighbours and both visible phases from one wall dimension command, then undoes exactly', () => {
    const doc = createEmptyProject(),
      a = createWall('level_1', { x: 0, z: 0 }, { x: 2.4, z: 0 });
    const b = createWall('level_1', { x: 2.4, z: 0 }, { x: 2.4, z: 1.8 });
    doc.walls.push(a, b);
    const door = createOpening(a, 'door', 0.3);
    door.width = 0.8;
    doc.openings.push(door);
    const core = new EditorCore(doc),
      original = core.getSnapshot(),
      originalGeometry = buildGeometry(original);
    const result = core.execute({
      type: 'update-wall',
      id: a.id,
      patch: { end: { x: 2.7, z: 0 } },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changeSet.wallIds).toEqual(expect.arrayContaining([a.id, b.id]));
    }
    const geometry = buildGeometry(core.getSnapshot()),
      ga = geometry.get(a.id)!,
      gb = geometry.get(b.id)!;
    expect(sideUV(ga, 2.6, 0.1, 'A')[0]).toBeCloseTo(5.2, 5);
    expect(sideUV(gb, 2.6, 0.1, 'A')[0]).toBeCloseTo(5.2, 5);
    expect(sideUV(ga, 2.8, -0.1, 'B')[0]).toBeCloseTo(5.6, 5);
    expect(sideUV(gb, 2.8, -0.1, 'B')[0]).toBeCloseTo(5.6, 5);
    expect(unmatchedEdges([...geometry.values()])).toEqual([]);
    expect(core.getSnapshot().openings[0]).toBe(original.openings[0]);
    core.undo();
    const restored = buildGeometry(core.getSnapshot());
    for (const [id, data] of originalGeometry) {
      expect(restored.get(id)!.positions).toEqual(data.positions);
      expect(restored.get(id)!.uvs).toEqual(data.uvs);
    }
  });
  it('resizes a closed nonintegral path while keeping the designated seam, physical tiles and watertight surfaces', () => {
    const doc = createEmptyProject(),
      points = [
        { x: 0, z: 0 },
        { x: 2.4, z: 0 },
        { x: 2.4, z: 1.8 },
        { x: 0, z: 1.8 },
      ];
    doc.walls = points.map((point, index) => {
      const wall = createWall('level_1', point, points[(index + 1) % 4]!);
      wall.id = `loop_wall_${index}`;
      return wall;
    });
    doc.continuity.push({
      id: 'loop_inside',
      members: doc.walls.map((wall) => ({ wallId: wall.id, side: 'A', direction: 1 })),
      anchor: { wallId: 'loop_wall_0', side: 'A', endpoint: 'start' },
      seam: { wallId: 'loop_wall_2', side: 'A', endpoint: 'end' },
      verticalOrigin: 0,
    });
    const core = new EditorCore(doc),
      before = core.getSnapshot(),
      originalPath = deriveSurfacePaths(before).find((route) => route.id === 'loop_inside')!;
    expect(originalPath.length).toBeCloseTo(7.6, 6);
    expect(
      core.execute({ type: 'update-wall', id: 'loop_wall_0', patch: { end: { x: 2.7, z: 0 } } }).ok,
    ).toBe(true);
    const after = core.getSnapshot(),
      path = deriveSurfacePaths(after).find((route) => route.id === 'loop_inside')!;
    expect(path.closed).toBe(true);
    expect(path.length).toBeCloseTo(8.2, 6);
    expect(path.seam).toEqual(originalPath.seam);
    expect(after.continuity).toBe(before.continuity);
    expect(after.walls.every((wall) => wall.materials.A.tileWidth === 0.5)).toBe(true);
    expect(unmatchedEdges([...buildGeometry(after).values()])).toEqual([]);
    core.undo();
    expect(
      deriveSurfacePaths(core.getSnapshot()).find((route) => route.id === 'loop_inside')!.length,
    ).toBeCloseTo(7.6, 6);
  });
  it('moves a T host without leaving a detached or hidden continuation across its branch', () => {
    const doc = createEmptyProject(),
      host = createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 0 });
    const branch = createWall('level_1', { x: 2, z: 0 }, { x: 2, z: 2 });
    for (const wall of [host, branch]) {
      wall.materials.A = defaultSurface();
      wall.materials.B = defaultSurface();
    }
    doc.walls.push(host, branch);
    const core = new EditorCore(doc),
      before = core.getSnapshot();
    expect(
      core.execute({
        type: 'update-wall',
        id: host.id,
        patch: { start: { x: 0, z: 0.2 }, end: { x: 4, z: 0.2 } },
      }).ok,
    ).toBe(true);
    const after = core.getSnapshot();
    expect(after.walls[1]!.start).toEqual({ x: 2, z: 0.2 });
    const routes = deriveSurfacePaths(after),
      left = routes.find((route) =>
        route.segments.some((segment) => segment.wallId === branch.id && segment.side === 'A'),
      )!;
    expect(
      left.segments.some((segment) => segment.wallId === host.id && segment.side === 'A'),
    ).toBe(true);
    expect(left.segments.filter((segment) => segment.wallId === host.id)).toHaveLength(1);
    expect(unmatchedEdges([...buildGeometry(after).values()])).toEqual([]);
    core.undo();
    expect(core.getSnapshot().walls).toBe(before.walls);
  });
});
