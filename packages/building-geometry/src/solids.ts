import type { ProjectDocument, SurfaceBinding, Vec2 } from '@building/editor-core';
import { GEOMETRY_EPSILON } from './types';
import type { Box, Point3, WallSolid } from './types';

export const eps = GEOMETRY_EPSILON;
export const close = (a: number, b: number) => Math.abs(a - b) < eps;
export const coord = (p: Vec2) => `${Math.round(p.x / eps)},${Math.round(p.z / eps)}`;
export const pointCompare = (a: Vec2, b: Vec2) => a.x - b.x || a.z - b.z;
export const length = (a: Vec2, b: Vec2) => Math.hypot(b.x - a.x, b.z - a.z);
export const contains = (b: Box, p: Point3) =>
  p[0] > b.minX - eps / 10 &&
  p[0] < b.maxX + eps / 10 &&
  p[1] > b.minY - eps / 10 &&
  p[1] < b.maxY + eps / 10 &&
  p[2] > b.minZ - eps / 10 &&
  p[2] < b.maxZ + eps / 10;
export const inside = (s: WallSolid, p: Point3) =>
  contains(s, p) && !s.holes.some((h) => contains(h, p));
export const overlap = (a: Box, b: Box) =>
  a.minX <= b.maxX + eps &&
  a.maxX >= b.minX - eps &&
  a.minY <= b.maxY + eps &&
  a.maxY >= b.minY - eps &&
  a.minZ <= b.maxZ + eps &&
  a.maxZ >= b.minZ - eps;

/** Derives joint extensions and through-hole boxes once per immutable revision. */
export function solids(doc: ProjectDocument): WallSolid[] {
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

export function sideFor(s: WallSolid, normal: Point3): 'A' | 'B' | undefined {
  const orientation = s.wall.surfaceOrientation ?? 1;
  const dot = normal[0] * -s.dz * orientation + normal[2] * s.dx * orientation;
  return dot > 0.9 ? 'A' : dot < -0.9 ? 'B' : undefined;
}
/** Assigns only exposed union faces to a stable wall owner, preferring its semantic A/B face. */
export function ownerAt(
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
export function cuts(min: number, max: number, values: number[]) {
  return [min, ...values.filter((v) => v > min + eps && v < max - eps), max]
    .sort((a, b) => a - b)
    .filter((v, i, a) => i === 0 || !close(v, a[i - 1]));
}
export function bindingKey(b: SurfaceBinding) {
  return [
    b.resourceId ?? b.color,
    b.tileWidth,
    b.tileHeight,
    b.rotation,
    b.offsetX,
    b.offsetY,
  ].join('|');
}
