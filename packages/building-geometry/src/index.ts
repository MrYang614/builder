import type { ProjectDocument, Wall, Slab, SurfaceBinding, Vec2 } from '@building/editor-core';

/** A tolerance in metres; geometry remains independent of rendering and platform APIs. */
export const GEOMETRY_EPSILON = 1e-7;
type Point3 = [number, number, number];
export type SurfaceRole = 'A' | 'B' | 'top' | 'bottom' | 'edge' | 'reveal';
export interface GeometryGroup {
  start: number;
  count: number;
  role: SurfaceRole;
  materialIndex: number;
}
export interface GeometryData {
  objectId: string;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  groups: GeometryGroup[];
}
export interface SurfaceSegment {
  wallId: string;
  side: 'A' | 'B';
  start: Vec2;
  end: Vec2;
  /** Distances along the actual outside/inside boundary, before physical tile scaling. */
  startDistance: number;
  endDistance: number;
  verticalOrigin: number;
}
export interface SurfacePath {
  id: string;
  segments: SurfaceSegment[];
  closed: boolean;
  seam: Vec2;
  length: number;
}
interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}
interface WallSolid extends Box {
  wall: Wall;
  dx: number;
  dz: number;
  base: number;
  holes: Box[];
}
const eps = GEOMETRY_EPSILON;
const close = (a: number, b: number) => Math.abs(a - b) < eps;
const coord = (p: Vec2) => `${Math.round(p.x / eps)},${Math.round(p.z / eps)}`;
const pointCompare = (a: Vec2, b: Vec2) => a.x - b.x || a.z - b.z;
const length = (a: Vec2, b: Vec2) => Math.hypot(b.x - a.x, b.z - a.z);
const contains = (b: Box, p: Point3) =>
  p[0] > b.minX - eps / 10 &&
  p[0] < b.maxX + eps / 10 &&
  p[1] > b.minY - eps / 10 &&
  p[1] < b.maxY + eps / 10 &&
  p[2] > b.minZ - eps / 10 &&
  p[2] < b.maxZ + eps / 10;
const inside = (s: WallSolid, p: Point3) => contains(s, p) && !s.holes.some((h) => contains(h, p));
const overlap = (a: Box, b: Box) =>
  a.minX <= b.maxX + eps &&
  a.maxX >= b.minX - eps &&
  a.minY <= b.maxY + eps &&
  a.maxY >= b.minY - eps &&
  a.minZ <= b.maxZ + eps &&
  a.maxZ >= b.minZ - eps;

function solids(doc: ProjectDocument): WallSolid[] {
  return doc.walls.map((w) => {
    const len = length(w.start, w.end);
    if (len < eps || (!close(w.start.x, w.end.x) && !close(w.start.z, w.end.z))) {
      throw new Error('geometry.nonOrthogonalWall');
    }
    const dx = (w.end.x - w.start.x) / len,
      dz = (w.end.z - w.start.z) / len;
    const h = w.thickness / 2;
    const extend = (p: Vec2) =>
      doc.walls.some((other) => {
        if (other.id === w.id || other.levelId !== w.levelId) {
          return false;
        }
        const odx = other.end.x - other.start.x,
          odz = other.end.z - other.start.z;
        if (Math.abs(dx * odx + dz * odz) > eps) {
          return false;
        }
        return close(odx, 0)
          ? close(p.x, other.start.x) &&
              p.z >= Math.min(other.start.z, other.end.z) - eps &&
              p.z <= Math.max(other.start.z, other.end.z) + eps
          : close(p.z, other.start.z) &&
              p.x >= Math.min(other.start.x, other.end.x) - eps &&
              p.x <= Math.max(other.start.x, other.end.x) + eps;
      })
        ? h
        : 0;
    const e0 = extend(w.start),
      e1 = extend(w.end);
    const start = { x: w.start.x - dx * e0, z: w.start.z - dz * e0 };
    const end = { x: w.end.x + dx * e1, z: w.end.z + dz * e1 };
    const base = doc.levels.find((l) => l.id === w.levelId)?.elevation ?? 0;
    const box = {
      minX: Math.min(start.x, end.x) - Math.abs(dz) * h,
      maxX: Math.max(start.x, end.x) + Math.abs(dz) * h,
      minZ: Math.min(start.z, end.z) - Math.abs(dx) * h,
      maxZ: Math.max(start.z, end.z) + Math.abs(dx) * h,
      minY: base,
      maxY: base + w.height,
    };
    const holes = doc.openings
      .filter((o) => o.wallId === w.id)
      .map((o) => {
        const a = o.offset,
          b = o.offset + o.width;
        const ax = w.start.x + dx * a,
          bx = w.start.x + dx * b;
        const az = w.start.z + dz * a,
          bz = w.start.z + dz * b;
        // Through-holes end at the real thickness faces. Expanding their bounds by eps creates
        // artificial sliver cells in a neighbouring perpendicular wall's partition. Membership
        // already has a tolerance; the topological cut coordinates must stay physically exact.
        return {
          minX: Math.min(ax, bx) - Math.abs(dz) * h,
          maxX: Math.max(ax, bx) + Math.abs(dz) * h,
          minZ: Math.min(az, bz) - Math.abs(dx) * h,
          maxZ: Math.max(az, bz) + Math.abs(dx) * h,
          minY: base + o.sill,
          maxY: base + o.sill + o.height,
        };
      });
    return { ...box, wall: w, dx, dz, base, holes };
  });
}

function sideFor(s: WallSolid, normal: Point3): 'A' | 'B' | undefined {
  const orientation = s.wall.surfaceOrientation ?? 1;
  const dot = normal[0] * -s.dz * orientation + normal[2] * s.dx * orientation;
  return dot > 0.9 ? 'A' : dot < -0.9 ? 'B' : undefined;
}
function ownerAt(
  ss: WallSolid[],
  p: Point3,
  normal: Point3,
  ignoreHoles = false,
): WallSolid | undefined {
  const behind: Point3 = [
    p[0] - normal[0] * eps * 4,
    p[1] - normal[1] * eps * 4,
    p[2] - normal[2] * eps * 4,
  ];
  const front: Point3 = [
    p[0] + normal[0] * eps * 4,
    p[1] + normal[1] * eps * 4,
    p[2] + normal[2] * eps * 4,
  ];
  const occupied = (s: WallSolid, v: Point3) => (ignoreHoles ? contains(s, v) : inside(s, v));
  if (ss.some((s) => occupied(s, front))) {
    return;
  }
  return ss
    .filter((s) => occupied(s, behind))
    .sort(
      (a, b) =>
        Number(!!sideFor(b, normal)) - Number(!!sideFor(a, normal)) ||
        a.wall.id.localeCompare(b.wall.id),
    )[0];
}
function cuts(min: number, max: number, values: number[]) {
  return [min, ...values.filter((v) => v > min + eps && v < max - eps), max]
    .sort((a, b) => a - b)
    .filter((v, i, a) => i === 0 || !close(v, a[i - 1]));
}
function bindingKey(b: SurfaceBinding) {
  return [
    b.resourceId ?? b.color,
    b.tileWidth,
    b.tileHeight,
    b.rotation,
    b.offsetX,
    b.offsetY,
  ].join('|');
}

/** Visible perimeter routes; a T routes around its concave corners instead of jumping across its branch. */
export function deriveSurfacePaths(doc: ProjectDocument): SurfacePath[] {
  const ss = solids(doc),
    segments: SurfaceSegment[] = [];
  for (const s of ss) {
    const local = ss.filter((t) => t.wall.levelId === s.wall.levelId && overlap(s, t));
    const alongX = Math.abs(s.dx) > 0.9;
    const axialCuts = cuts(
      alongX ? s.minX : s.minZ,
      alongX ? s.maxX : s.maxZ,
      local.flatMap((t) => (alongX ? [t.minX, t.maxX] : [t.minZ, t.maxZ])),
    );
    for (const sign of [-1, 1]) {
      const normal: Point3 = alongX ? [0, 0, sign] : [sign, 0, 0];
      const side = sideFor(s, normal)!;
      const perpendicular = alongX ? (sign < 0 ? s.minZ : s.maxZ) : sign < 0 ? s.minX : s.maxX;
      let current: SurfaceSegment | undefined;
      for (let i = 0; i < axialCuts.length - 1; i++) {
        const a = axialCuts[i],
          b = axialCuts[i + 1];
        const p: Point3 = alongX
          ? [(a + b) / 2, s.base + Math.min(s.wall.height / 2, 0.01), perpendicular]
          : [perpendicular, s.base + Math.min(s.wall.height / 2, 0.01), (a + b) / 2];
        if (ownerAt(local, p, normal, true)?.wall.id !== s.wall.id) {
          current = undefined;
          continue;
        }
        const start = alongX ? { x: a, z: perpendicular } : { x: perpendicular, z: a };
        const end = alongX ? { x: b, z: perpendicular } : { x: perpendicular, z: b };
        if (current && coord(current.end) === coord(start)) {
          current.end = end;
        } else {
          current = {
            wallId: s.wall.id,
            side,
            start,
            end,
            startDistance: 0,
            endDistance: 0,
            verticalOrigin: 0,
          };
          segments.push(current);
        }
      }
    }
  }
  const paths: SurfacePath[] = [],
    pending = new Set(segments);
  const sameGroup = (a: SurfaceSegment, b: SurfaceSegment) => {
    const ga = doc.continuity.find((g) =>
      g.members.some((m) => m.wallId === a.wallId && m.side === a.side),
    );
    const gb = doc.continuity.find((g) =>
      g.members.some((m) => m.wallId === b.wallId && m.side === b.side),
    );
    const wa = doc.walls.find((w) => w.id === a.wallId)!,
      wb = doc.walls.find((w) => w.id === b.wallId)!;
    // An explicit anchor must not disconnect another physically adjacent matching face
    // merely because that face has not yet been listed in a saved continuity group.
    return (
      wa.levelId === wb.levelId &&
      (ga && gb ? ga.id === gb.id : true) &&
      bindingKey(wa.materials[a.side]) === bindingKey(wb.materials[b.side])
    );
  };
  while (pending.size) {
    const first = [...pending].sort(
      (a, b) => pointCompare(a.start, b.start) || pointCompare(a.end, b.end),
    )[0];
    const component = new Set<SurfaceSegment>([first]),
      queue = [first];
    while (queue.length) {
      const a = queue.pop()!;
      for (const b of pending) {
        if (
          !component.has(b) &&
          sameGroup(a, b) &&
          [a.start, a.end].some((p) => coord(p) === coord(b.start) || coord(p) === coord(b.end))
        ) {
          component.add(b);
          queue.push(b);
        }
      }
    }
    const points = new Map<string, Vec2>(),
      edges = new Map<string, SurfaceSegment[]>();
    for (const s of component) {
      for (const p of [s.start, s.end]) {
        points.set(coord(p), p);
        edges.set(coord(p), [...(edges.get(coord(p)) ?? []), s]);
      }
    }
    const ends = [...points.values()]
      .filter((p) => edges.get(coord(p))!.length === 1)
      .sort(pointCompare);
    const group = doc.continuity.find((g) =>
      g.members.some((m) => [...component].some((s) => s.wallId === m.wallId && s.side === m.side)),
    );
    const designated = group?.seam ?? group?.anchor;
    let anchor: Vec2 | undefined;
    if (designated) {
      const wall = doc.walls.find((w) => w.id === designated.wallId);
      const candidates = [...component]
        .filter((s) => s.wallId === designated.wallId && s.side === designated.side)
        .flatMap((s) => [s.start, s.end]);
      if (wall && candidates.length) {
        const target = wall[designated.endpoint];
        anchor = candidates.sort((a, b) => length(a, target) - length(b, target))[0];
      }
    }
    const closed = ends.length === 0;
    let point = closed && anchor ? anchor : (ends[0] ?? [...points.values()].sort(pointCompare)[0]);
    const seam = { ...point },
      ordered: SurfaceSegment[] = [];
    let distance = 0;
    while (true) {
      const candidates = (edges.get(coord(point)) ?? []).filter(
        (s) => component.has(s) && !ordered.includes(s),
      );
      if (!candidates.length) {
        break;
      }
      const edge = candidates.sort((a, b) =>
        pointCompare(
          coord(a.start) === coord(point) ? a.end : a.start,
          coord(b.start) === coord(point) ? b.end : b.start,
        ),
      )[0];
      const forward = coord(edge.start) === coord(point),
        len = length(edge.start, edge.end);
      edge.startDistance = forward ? distance : distance + len;
      edge.endDistance = forward ? distance + len : distance;
      edge.verticalOrigin = group?.verticalOrigin ?? 0;
      ordered.push(edge);
      distance += len;
      point = forward ? edge.end : edge.start;
    }
    // Open-route anchors provide a signed coordinate without changing physical tile size.
    if (anchor && !closed) {
      const at = ordered.find(
        (s) => coord(s.start) === coord(anchor) || coord(s.end) === coord(anchor),
      );
      const shift = at
        ? coord(at.start) === coord(anchor)
          ? at.startDistance
          : at.endDistance
        : 0;
      for (const s of ordered) {
        s.startDistance -= shift;
        s.endDistance -= shift;
      }
    }
    if (group) {
      const reference = group.members.find(
        (m) => m.wallId === group.anchor.wallId && m.side === group.anchor.side,
      );
      const edge = ordered.find((s) => s.wallId === reference?.wallId && s.side === reference.side);
      const wall = doc.walls.find((w) => w.id === reference?.wallId);
      if (reference && edge && wall) {
        const along =
          (edge.end.x - edge.start.x) * (wall.end.x - wall.start.x) +
          (edge.end.z - edge.start.z) * (wall.end.z - wall.start.z);
        const orientation = along * (edge.endDistance - edge.startDistance) * reference.direction;
        if (orientation < 0) {
          for (const s of ordered) {
            s.startDistance = -s.startDistance;
            s.endDistance = -s.endDistance;
          }
        }
      }
    }
    for (const s of ordered) {
      pending.delete(s);
    }
    // A perimeter of a supported wall union has degree <= 2. Never silently loop on malformed inputs.
    if (!ordered.length) {
      pending.delete(first);
    }
    paths.push({
      id:
        group?.id ??
        `route:${coord(seam)}:${bindingKey(doc.walls.find((w) => w.id === first.wallId)!.materials[first.side])}`,
      segments: ordered,
      closed,
      seam,
      length: distance,
    });
  }
  return paths;
}

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
  finish(objectId: string): GeometryData {
    const p: number[] = [],
      n: number[] = [],
      u: number[] = [],
      i: number[] = [],
      groups: GeometryGroup[] = [];
    for (const role of ['A', 'B', 'top', 'bottom', 'edge', 'reveal'] as SurfaceRole[]) {
      const b = this.buckets.get(role);
      if (!b) {
        continue;
      }
      const base = p.length / 3;
      groups.push({ role, start: i.length, count: b.i.length, materialIndex: groups.length });
      p.push(...b.p);
      n.push(...b.n);
      u.push(...b.u);
      i.push(...b.i.map((v) => v + base));
    }
    return {
      objectId,
      positions: new Float32Array(p),
      normals: new Float32Array(n),
      uvs: new Float32Array(u),
      indices: new Uint32Array(i),
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
function wallGeometry(
  doc: ProjectDocument,
  wallId: string,
  all: WallSolid[],
  paths: SurfacePath[],
): GeometryData {
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
  void doc;
  return builder.finish(wallId);
}
export function buildWallGeometry(doc: ProjectDocument, wallId: string): GeometryData {
  return wallGeometry(doc, wallId, solids(doc), deriveSurfacePaths(doc));
}
/** Reuse one topology/UV solution for affected objects in a single immutable document revision. */
export function prepareGeometry(doc: ProjectDocument): {
  wall(id: string): GeometryData;
  slab(id: string): GeometryData;
} {
  const all = solids(doc),
    paths = deriveSurfacePaths(doc);
  return {
    wall: (id) => wallGeometry(doc, id, all, paths),
    slab: (id) => buildSlabGeometry(doc, id),
  };
}
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
export function buildGeometry(doc: ProjectDocument): Map<string, GeometryData> {
  const all = solids(doc),
    paths = deriveSurfacePaths(doc),
    result = new Map<string, GeometryData>();
  for (const wall of doc.walls) {
    result.set(wall.id, wallGeometry(doc, wall.id, all, paths));
  }
  for (const slab of doc.slabs) {
    result.set(slab.id, buildSlabGeometry(doc, slab.id));
  }
  return result;
}
export function surfaceAtTriangle(
  geometry: GeometryData,
  triangleIndex: number,
): SurfaceRole | undefined {
  const index = triangleIndex * 3;
  return geometry.groups.find((g) => index >= g.start && index < g.start + g.count)?.role;
}
