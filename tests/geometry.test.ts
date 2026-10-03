import { describe, it, expect } from 'vitest';
import {
  createEmptyProject,
  createWall,
  createOpening,
  createSlab,
  type ProjectDocument,
} from '@building/editor-core';
import {
  buildGeometry,
  buildWallGeometry,
  buildSlabGeometry,
  deriveSurfacePaths,
  surfaceAtTriangle,
  type GeometryData,
  type SurfaceRole,
} from '@building/building-geometry';

function straight(): ProjectDocument {
  const doc = createEmptyProject();
  doc.id = 'geometry_project';
  const a = createWall('level_1', { x: 0, z: 0 }, { x: 2.4, z: 0 });
  a.id = 'wall_a';
  const b = createWall('level_1', { x: 2.4, z: 0 }, { x: 4.2, z: 0 });
  b.id = 'wall_b';
  b.materials = structuredClone(a.materials);
  doc.walls = [a, b];
  return doc;
}
function corner(): ProjectDocument {
  const doc = straight();
  doc.walls[1].end = { x: 2.4, z: 1.8 };
  return doc;
}
function triangles(data: GeometryData, role?: SurfaceRole) {
  const result: number[][][] = [];
  for (let i = 0; i < data.indices.length; i += 3) {
    if (role && surfaceAtTriangle(data, i / 3) !== role) {
      continue;
    }
    result.push(
      Array.from(data.indices.slice(i, i + 3), (index) =>
        Array.from(data.positions.slice(index * 3, index * 3 + 3)),
      ),
    );
  }
  return result;
}
function volume(data: GeometryData) {
  return triangles(data).reduce(
    (sum, [a, b, c]) =>
      sum +
      (a[0] * (b[1] * c[2] - b[2] * c[1]) +
        a[1] * (b[2] * c[0] - b[0] * c[2]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
        6,
    0,
  );
}
function quadArea(data: GeometryData, role: SurfaceRole) {
  return triangles(data, role).reduce((sum, [a, b, c]) => {
    const u = b.map((v, i) => v - a[i]),
      v = c.map((n, i) => n - a[i]);
    return (
      sum +
      Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) /
        2
    );
  }, 0);
}
function wallUV(data: GeometryData, x: number, z: number, role: SurfaceRole): number[] {
  const result: number[] = [];
  for (const group of data.groups.filter((g) => g.role === role)) {
    for (let i = group.start; i < group.start + group.count; i++) {
      const index = data.indices[i];
      if (
        Math.abs(data.positions[index * 3] - x) < 1e-5 &&
        Math.abs(data.positions[index * 3 + 2] - z) < 1e-5
      ) {
        result.push(data.uvs[index * 2]);
      }
    }
  }
  return result;
}
function unmatchedEdges(data: GeometryData[]): string[] {
  const edges = new Map<string, number>();
  for (const geometry of data) {
    for (const triangle of triangles(geometry)) {
      for (let i = 0; i < 3; i++) {
        const a = triangle[i].map((v) => v.toFixed(5)).join(','),
          b = triangle[(i + 1) % 3].map((v) => v.toFixed(5)).join(',');
        const key = [a, b].sort().join('|');
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
  }
  return [...edges].filter(([, count]) => count !== 2).map(([edge, count]) => `${count}: ${edge}`);
}

describe('pure TypeScript building geometry A02–A08, A12, A28', () => {
  it('joins 2.4 m + 1.8 m without internal caps, preserving the 4.8 repeat phase', () => {
    const doc = straight(),
      all = buildGeometry(doc),
      a = all.get('wall_a')!,
      b = all.get('wall_b')!;
    expect(volume(a) + volume(b)).toBeCloseTo(4.2 * 0.2 * 2.8, 5);
    expect(quadArea(a, 'edge')).toBeCloseTo(0.2 * 2.8, 5);
    expect(quadArea(b, 'edge')).toBeCloseTo(0.2 * 2.8, 5);
    const au = wallUV(a, 2.4, 0.1, 'A'),
      bu = wallUV(b, 2.4, 0.1, 'A');
    expect(au.length).toBeGreaterThan(0);
    expect(bu.length).toBeGreaterThan(0);
    expect(au[0]).toBeCloseTo(4.8, 5);
    expect(bu[0]).toBeCloseTo(4.8, 5);
  });
  it('uses the actual inner and outer corner lengths and a real union boundary', () => {
    const doc = corner(),
      all = buildGeometry(doc),
      a = all.get('wall_a')!,
      b = all.get('wall_b')!;
    expect(volume(a) + volume(b)).toBeCloseTo((2.4 + 1.8) * 0.2 * 2.8, 5);
    // The inner A-A route turns at x=2.3,z=.1, while B-B turns at x=2.5,z=-.1.
    expect(wallUV(a, 2.3, 0.1, 'A')[0]).toBeCloseTo(wallUV(b, 2.3, 0.1, 'A')[0], 5);
    expect(wallUV(a, 2.5, -0.1, 'B')[0]).toBeCloseTo(wallUV(b, 2.5, -0.1, 'B')[0], 5);
    const routes = deriveSurfacePaths(doc);
    expect(routes.find((p) => p.segments.every((s) => s.side === 'A'))!.length).toBeCloseTo(4, 7);
    expect(routes.find((p) => p.segments.every((s) => s.side === 'B'))!.length).toBeCloseTo(4.4, 7);
    // No duplicate planar triangles or internal end covers at the junction.
    const keys = [...all.values()].flatMap((data) =>
      triangles(data).map((t) =>
        t
          .map((p) => p.map((v) => v.toFixed(5)).join(','))
          .sort()
          .join('|'),
      ),
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(quadArea(a, 'edge') + quadArea(b, 'edge')).toBeCloseTo(2 * 0.2 * 2.8, 5);
    expect(unmatchedEdges([...all.values()])).toEqual([]);
  });
  it('subtracts true door/window holes, emits pure-colour reveals, and preserves remaining UV', () => {
    const doc = straight();
    doc.walls = [doc.walls[0]];
    const original = buildWallGeometry(doc, 'wall_a');
    const door = createOpening(doc.walls[0], 'door', 0.3);
    door.width = 0.8;
    door.height = 2;
    doc.openings = [door];
    const cut = buildWallGeometry(doc, 'wall_a');
    expect(quadArea(cut, 'A')).toBeCloseTo(2.4 * 2.8 - 0.8 * 2, 5);
    expect(quadArea(cut, 'B')).toBeCloseTo(2.4 * 2.8 - 0.8 * 2, 5);
    expect(volume(cut)).toBeCloseTo((2.4 * 2.8 - 0.8 * 2) * 0.2, 5);
    expect(unmatchedEdges([cut])).toEqual([]);
    expect(quadArea(cut, 'reveal')).toBeCloseTo((2 * 2 + 0.8) * 0.2, 5);
    expect(wallUV(cut, 2.4, 0.1, 'A')[0]).toBeCloseTo(wallUV(original, 2.4, 0.1, 'A')[0], 5);
    expect(
      triangles(cut, 'A').every(
        (t) => !t.every((p) => p[0] > 0.3 + 1e-6 && p[0] < 1.1 - 1e-6 && p[1] < 2 - 1e-6),
      ),
    ).toBe(true);
    doc.openings = [];
    expect(buildWallGeometry(doc, 'wall_a').positions).toEqual(original.positions);
    const window = createOpening(doc.walls[0], 'window', 0.4);
    window.width = 1;
    window.height = 0.9;
    window.sill = 1;
    doc.openings = [window];
    const windowCut = buildWallGeometry(doc, 'wall_a');
    expect(quadArea(windowCut, 'reveal')).toBeCloseTo(2 * (1 + 0.9) * 0.2, 5);
  });
  it('routes T surfaces around the visible branch without continuing across hidden host surface', () => {
    const doc = straight();
    doc.walls = [doc.walls[0]];
    doc.walls[0].end.x = 4;
    const branch = createWall('level_1', { x: 2, z: 0 }, { x: 2, z: 1.8 });
    branch.id = 'branch';
    branch.materials = structuredClone(doc.walls[0].materials);
    doc.walls.push(branch);
    const paths = deriveSurfacePaths(doc),
      all = buildGeometry(doc);
    expect([...all.values()].reduce((sum, data) => sum + volume(data), 0)).toBeCloseTo(
      (4 + 1.8 - 0.1) * 0.2 * 2.8,
      5,
    );
    const branchRoute = paths.find((p) =>
      p.segments.some((s) => s.wallId === 'branch' && s.side === 'A'),
    )!;
    expect(branchRoute.segments.some((s) => s.wallId === 'wall_a' && s.side === 'A')).toBe(true);
    expect(branchRoute.segments.filter((s) => s.wallId === 'wall_a').length).toBe(1);
    expect(
      paths.some(
        (p) =>
          p.segments.length === 1 &&
          p.segments[0].wallId === 'wall_a' &&
          p.segments[0].side === 'B',
      ),
    ).toBe(true);
    expect(unmatchedEdges([...all.values()])).toEqual([]);
    // Defining the other route's seam must not sever or reverse this actual boundary.
    branch.materials.B = structuredClone(doc.walls[0].materials.A);
    doc.continuity = [
      {
        id: 'left_T_route',
        members: [
          { wallId: 'wall_a', side: 'A', direction: 1 },
          { wallId: 'branch', side: 'A', direction: 1 },
        ],
        anchor: { wallId: 'wall_a', side: 'A', endpoint: 'start' },
        verticalOrigin: 0,
      },
    ];
    const anchoredPaths = deriveSurfacePaths(doc),
      right = anchoredPaths.find((p) =>
        p.segments.some((s) => s.wallId === 'branch' && s.side === 'B'),
      )!;
    expect(right.segments.some((s) => s.wallId === 'wall_a' && s.side === 'A')).toBe(true);
    const rightHost = right.segments.find((s) => s.wallId === 'wall_a')!,
      rightBranch = right.segments.find((s) => s.wallId === 'branch')!;
    expect(rightHost.startDistance).toBeCloseTo(rightBranch.startDistance, 7);
    expect(Math.sign(rightHost.endDistance - rightHost.startDistance)).toBe(
      -Math.sign(rightBranch.endDistance - rightBranch.startDistance),
    );
  });
  it('keeps face identities and anchors across creation order, holes and explicit endpoint reversal', () => {
    const doc = corner(),
      before = buildGeometry(doc);
    doc.walls.reverse();
    const after = buildGeometry(doc);
    for (const [id, g] of before) {
      expect(after.get(id)!.uvs).toEqual(g.uvs);
    }
    const wall = doc.walls.find((w) => w.id === 'wall_a')!;
    [wall.start, wall.end] = [wall.end, wall.start];
    wall.surfaceOrientation = -1;
    const reversed = buildWallGeometry(doc, wall.id);
    expect(quadArea(reversed, 'A')).toBeCloseTo(quadArea(before.get(wall.id)!, 'A'), 5);
    expect(wallUV(reversed, 2.3, 0.1, 'A')[0]).toBeCloseTo(
      wallUV(before.get(wall.id)!, 2.3, 0.1, 'A')[0],
      5,
    );
  });
  it('propagates an upstream length change into downstream physical UV without resetting the anchor', () => {
    const doc = straight(),
      before = buildGeometry(doc);
    const a = doc.walls[0],
      b = doc.walls[1];
    a.end.x = 2.7;
    b.start.x = 2.7;
    b.end.x = 4.5;
    const after = buildGeometry(doc);
    expect(wallUV(before.get('wall_a')!, 0, 0.1, 'A')[0]).toBeCloseTo(0, 6);
    expect(wallUV(after.get('wall_a')!, 0, 0.1, 'A')[0]).toBeCloseTo(0, 6);
    expect(wallUV(after.get('wall_b')!, 2.7, 0.1, 'A')[0]).toBeCloseTo(5.4, 5);
  });
  it('honours a designated nonintegral closed-loop seam without scaling physical tiles', () => {
    const doc = createEmptyProject();
    const points = [
      { x: 0, z: 0 },
      { x: 2.4, z: 0 },
      { x: 2.4, z: 1.8 },
      { x: 0, z: 1.8 },
    ];
    doc.walls = points.map((p, i) => {
      const w = createWall('level_1', p, points[(i + 1) % 4]);
      w.id = `loop_${i}`;
      w.materials = structuredClone(doc.walls[0]?.materials ?? w.materials);
      return w;
    });
    doc.continuity = [
      {
        id: 'inside',
        members: doc.walls.map((w) => ({ wallId: w.id, side: 'A', direction: 1 })),
        anchor: { wallId: 'loop_0', side: 'A', endpoint: 'start' },
        verticalOrigin: 0,
        seam: { wallId: 'loop_2', side: 'A', endpoint: 'end' },
      },
    ];
    const path = deriveSurfacePaths(doc).find((p) => p.id === 'inside')!;
    expect(path.closed).toBe(true);
    expect(path.length).toBeCloseTo(7.6, 7);
    expect(path.seam.x).toBeCloseTo(0.1, 7);
    expect(path.seam.z).toBeCloseTo(1.7, 7);
    const coordinates = path.segments.flatMap((s) => [s.startDistance, s.endDistance]);
    expect(Math.min(...coordinates)).toBe(0);
    expect(Math.max(...coordinates)).toBeCloseTo(7.6, 7);
    expect(doc.walls.every((w) => w.materials.A.tileWidth === 0.5)).toBe(true);
  });
  it('creates one thick slab with independently identified upper/lower faces and physical UVs', () => {
    const doc = createEmptyProject(),
      slab = createSlab('level_1', { x: 0, z: 0 }, { x: 2, z: 3 }, 3, 'roof');
    doc.slabs = [slab];
    const data = buildSlabGeometry(doc, slab.id);
    expect(volume(data)).toBeCloseTo(2 * 3 * 0.2, 5);
    expect(quadArea(data, 'top')).toBeCloseTo(6, 5);
    expect(quadArea(data, 'bottom')).toBeCloseTo(6, 5);
    expect(data.groups.map((g) => g.role)).toEqual(['top', 'bottom', 'edge']);
    expect(Math.max(...data.positions.filter((_, i) => i % 3 === 1))).toBe(3);
    expect(Math.min(...data.positions.filter((_, i) => i % 3 === 1))).toBeCloseTo(2.8, 5);
    const oldUV = Math.max(...data.uvs);
    slab.polygon[1].x = 4;
    slab.polygon[2].x = 4;
    expect(Math.max(...buildSlabGeometry(doc, slab.id).uvs)).toBeGreaterThan(oldUV);
  });
});
