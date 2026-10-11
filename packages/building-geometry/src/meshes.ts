import type { ProjectDocument, Slab, SurfaceBinding } from '@building/editor-core';
import type {
  Box,
  GeometryData,
  GeometryGroup,
  Point3,
  SurfacePath,
  SurfaceRole,
  SurfaceSegment,
  WallSolid,
} from './types';
import { close, cuts, inside, length, overlap, ownerAt, sideFor, solids } from './solids';
import { deriveSurfacePathsFromSolids } from './surface-paths';

/** Accumulates role-separated quads and owns CPU buffers until transferring one complete geometry. */
class GeometryBuilder {
  private buckets = new Map<SurfaceRole, { p: number[]; n: number[]; u: number[]; i: number[] }>();
  quad(points: Point3[], normal: Point3, role: SurfaceRole, uv: (p: Point3) => [number, number]) {
    let b = this.buckets.get(role);
    if (!b) {
      b = { p: [], n: [], u: [], i: [] };
      this.buckets.set(role, b);
    }
    const base = b.p.length / 3;
    for (const p of points) {
      b.p.push(...p);
      b.n.push(...normal);
      b.u.push(...uv(p));
    }
    const a = points[0],
      c = points[1],
      d = points[2];
    const cross: Point3 = [
      (c[1] - a[1]) * (d[2] - a[2]) - (c[2] - a[2]) * (d[1] - a[1]),
      (c[2] - a[2]) * (d[0] - a[0]) - (c[0] - a[0]) * (d[2] - a[2]),
      (c[0] - a[0]) * (d[1] - a[1]) - (c[1] - a[1]) * (d[0] - a[0]),
    ];
    const forward = cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2] > 0;
    b.i.push(...(forward ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]).map((i) => i + base));
  }
  /** Allocates final buffers once, keeping role groups stable even for large opening partitions. */
  finish(objectId: string): GeometryData {
    let vertexCount = 0;
    let indexCount = 0;
    for (const bucket of this.buckets.values()) {
      vertexCount += bucket.p.length / 3;
      indexCount += bucket.i.length;
    }
    // Bulk typed-array copies avoid JS argument limits and a second full set of temporary arrays.
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = new Uint32Array(indexCount);
    const groups: GeometryGroup[] = [];
    let vertexOffset = 0;
    let indexOffset = 0;
    for (const role of ['A', 'B', 'top', 'bottom', 'edge', 'reveal'] as SurfaceRole[]) {
      const b = this.buckets.get(role);
      if (!b) {
        continue;
      }
      groups.push({ role, start: indexOffset, count: b.i.length, materialIndex: groups.length });
      positions.set(b.p, vertexOffset * 3);
      normals.set(b.n, vertexOffset * 3);
      uvs.set(b.u, vertexOffset * 2);
      for (const index of b.i) {
        indices[indexOffset++] = index + vertexOffset;
      }
      vertexOffset += b.p.length / 3;
    }
    return {
      objectId,
      positions,
      normals,
      uvs,
      indices,
      groups,
    };
  }
}
function textureUV(binding: SurfaceBinding, u: number, v: number): [number, number] {
  const angle = (binding.rotation * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const x = u / binding.tileWidth,
    y = v / binding.tileHeight;
  return [x * c - y * s + binding.offsetX, x * s + y * c + binding.offsetY];
}
const faceDefs: { axis: 0 | 1 | 2; sign: number }[] = [
  { axis: 0, sign: -1 },
  { axis: 0, sign: 1 },
  { axis: 1, sign: -1 },
  { axis: 1, sign: 1 },
  { axis: 2, sign: -1 },
  { axis: 2, sign: 1 },
];
function boxFaces(box: Box, add: (points: Point3[], normal: Point3, center: Point3) => void) {
  const mins = [box.minX, box.minY, box.minZ],
    maxs = [box.maxX, box.maxY, box.maxZ];
  for (const { axis, sign } of faceDefs) {
    const others = ([0, 1, 2] as const).filter((a) => a !== axis),
      normal: Point3 = [0, 0, 0];
    normal[axis] = sign;
    const points = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ].map(([a, b]) => {
      const p: Point3 = [0, 0, 0];
      p[axis] = sign < 0 ? mins[axis] : maxs[axis];
      p[others[0]] = a ? maxs[others[0]] : mins[others[0]];
      p[others[1]] = b ? maxs[others[1]] : mins[others[1]];
      return p;
    });
    const center: Point3 = [
      (box.minX + box.maxX) / 2,
      (box.minY + box.maxY) / 2,
      (box.minZ + box.maxZ) / 2,
    ];
    center[axis] = points[0][axis];
    add(points, normal, center);
  }
}
function wallGeometry(wallId: string, all: WallSolid[], paths: SurfacePath[]): GeometryData {
  const s = all.find((s) => s.wall.id === wallId);
  if (!s) {
    throw new Error('geometry.wallNotFound');
  }
  const local = all.filter((t) => t.wall.levelId === s.wall.levelId && overlap(s, t));
  const boxes = local.flatMap((t) => [t, ...t.holes]);
  const xs = cuts(
      s.minX,
      s.maxX,
      boxes.flatMap((b) => [b.minX, b.maxX]),
    ),
    ys = cuts(
      s.minY,
      s.maxY,
      boxes.flatMap((b) => [b.minY, b.maxY]),
    ),
    zs = cuts(
      s.minZ,
      s.maxZ,
      boxes.flatMap((b) => [b.minZ, b.maxZ]),
    );
  const builder = new GeometryBuilder(),
    routes = paths.flatMap((p) => p.segments).filter((p) => p.wallId === wallId);
  for (let x = 0; x < xs.length - 1; x++) {
    for (let y = 0; y < ys.length - 1; y++) {
      for (let z = 0; z < zs.length - 1; z++) {
        const cell = {
          minX: xs[x],
          maxX: xs[x + 1],
          minY: ys[y],
          maxY: ys[y + 1],
          minZ: zs[z],
          maxZ: zs[z + 1],
        };
        if (
          !inside(s, [
            (cell.minX + cell.maxX) / 2,
            (cell.minY + cell.maxY) / 2,
            (cell.minZ + cell.maxZ) / 2,
          ])
        ) {
          continue;
        }
        boxFaces(cell, (points, normal, center) => {
          if (ownerAt(local, center, normal)?.wall.id !== wallId) {
            return;
          }
          const onOuter =
            close(center[0], s.minX) ||
            close(center[0], s.maxX) ||
            close(center[2], s.minZ) ||
            close(center[2], s.maxZ);
          const side = onOuter ? sideFor(s, normal) : undefined;
          const role: SurfaceRole =
            normal[1] !== 0
              ? close(center[1], s.maxY)
                ? 'top'
                : close(center[1], s.minY)
                  ? 'bottom'
                  : 'reveal'
              : (side ?? (onOuter ? 'edge' : 'reveal'));
          const binding = s.wall.materials[side ?? 'edge'];
          const candidates = side ? routes.filter((r) => r.side === side) : [];
          const route = candidates.sort((a, b) => {
            const distance = (r: SurfaceSegment) =>
              Math.max(
                Math.min(r.start.x, r.end.x) - center[0],
                0,
                center[0] - Math.max(r.start.x, r.end.x),
              ) +
              Math.max(
                Math.min(r.start.z, r.end.z) - center[2],
                0,
                center[2] - Math.max(r.start.z, r.end.z),
              );
            return distance(a) - distance(b);
          })[0];
          builder.quad(points, normal, role, (p) => {
            if (!side) {
              return [0, 0];
            }
            const along = route
              ? ((p[0] - route.start.x) * (route.end.x - route.start.x) +
                  (p[2] - route.start.z) * (route.end.z - route.start.z)) /
                length(route.start, route.end) ** 2
              : 0;
            const u = route
              ? route.startDistance + along * (route.endDistance - route.startDistance)
              : (p[0] - s.wall.start.x) * s.dx + (p[2] - s.wall.start.z) * s.dz;
            return textureUV(binding, u, p[1] - (route?.verticalOrigin ?? 0));
          });
        });
      }
    }
  }
  return builder.finish(wallId);
}
/** Builds true wall-union boundaries and holes from formal parameters without renderer state. */
export function buildWallGeometry(doc: ProjectDocument, wallId: string): GeometryData {
  const all = solids(doc);
  return wallGeometry(wallId, all, deriveSurfacePathsFromSolids(doc, all));
}
/** Reuse one topology/UV solution for affected objects in a single immutable document revision. */
export function prepareGeometry(doc: ProjectDocument): {
  wall(id: string): GeometryData;
  slab(id: string): GeometryData;
} {
  const all = solids(doc),
    paths = deriveSurfacePathsFromSolids(doc, all);
  return {
    wall: (id) => wallGeometry(id, all, paths),
    slab: (id) => buildSlabGeometry(doc, id),
  };
}
/** Builds the slab's explicit thick solid with independent top/bottom UV and untextured edges. */
export function buildSlabGeometry(doc: ProjectDocument, slabId: string): GeometryData {
  const slab: Slab | undefined = doc.slabs.find((s) => s.id === slabId);
  if (!slab) {
    throw new Error('geometry.slabNotFound');
  }
  const xs = slab.polygon.map((p) => p.x),
    zs = slab.polygon.map((p) => p.z);
  const box = {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
    minY: slab.elevation - slab.thickness,
    maxY: slab.elevation,
  };
  const builder = new GeometryBuilder();
  boxFaces(box, (points, normal) => {
    const role: SurfaceRole = normal[1] > 0 ? 'top' : normal[1] < 0 ? 'bottom' : 'edge';
    builder.quad(points, normal, role, (p) =>
      role === 'edge' ? [0, 0] : textureUV(slab.materials[role], p[0], p[2]),
    );
  });
  return builder.finish(slabId);
}
/** Generates one independent revision's building geometry using a shared topology/UV solution. */
export function buildGeometry(doc: ProjectDocument): Map<string, GeometryData> {
  const all = solids(doc),
    paths = deriveSurfacePathsFromSolids(doc, all),
    result = new Map<string, GeometryData>();
  for (const wall of doc.walls) {
    result.set(wall.id, wallGeometry(wall.id, all, paths));
  }
  for (const slab of doc.slabs) {
    result.set(slab.id, buildSlabGeometry(doc, slab.id));
  }
  return result;
}
/** Maps a generated triangle to its stable semantic material role for selection and export. */
export function surfaceAtTriangle(
  geometry: GeometryData,
  triangleIndex: number,
): SurfaceRole | undefined {
  const index = triangleIndex * 3;
  return geometry.groups.find((g) => index >= g.start && index < g.start + g.count)?.role;
}
