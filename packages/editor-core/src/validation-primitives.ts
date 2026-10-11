import type { Opening, SurfaceBinding, Vec2, Wall } from './model';
import { wallLength } from './model';

export const EPSILON = 1e-7;
export interface DomainError {
  code: string;
  params?: Record<string, string | number | string[]>;
}
export type ValidationResult = { ok: true } | { ok: false; error: DomainError };
export const fail = (code: string, params?: DomainError['params']): ValidationResult => ({
  ok: false,
  error: { code, params },
});
export const valid = (): ValidationResult => ({ ok: true });
export const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
export const positive = (value: unknown): value is number =>
  finite(value) && value > EPSILON && value <= 10000;
export const id = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export const point = (value: unknown): value is Vec2 =>
  !!value &&
  typeof value === 'object' &&
  finite((value as Vec2).x) &&
  finite((value as Vec2).z) &&
  Math.abs((value as Vec2).x) <= 100000 &&
  Math.abs((value as Vec2).z) <= 100000;
export const samePoint = (a: Vec2, b: Vec2): boolean =>
  Math.abs(a.x - b.x) < EPSILON && Math.abs(a.z - b.z) < EPSILON;
export const allowed = (value: object, keys: string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));
const bindingKeys = [
  'color',
  'resourceId',
  'tileWidth',
  'tileHeight',
  'rotation',
  'offsetX',
  'offsetY',
];
/** Accepts physical tiling values and registered image IDs; thickness faces always remain color-only. */
export function validateBinding(
  binding: unknown,
  resourceIds: Set<string>,
  edge = false,
): ValidationResult {
  if (!binding || typeof binding !== 'object') {
    return fail('material.invalid');
  }
  if (!allowed(binding, bindingKeys)) {
    return fail('project.unknownField');
  }
  const b = binding as SurfaceBinding;
  if (
    typeof b.color !== 'string' ||
    !/^#[0-9a-f]{6}$/i.test(b.color) ||
    (b.resourceId !== undefined && !id(b.resourceId)) ||
    !positive(b.tileWidth) ||
    !positive(b.tileHeight) ||
    !finite(b.rotation) ||
    !finite(b.offsetX) ||
    !finite(b.offsetY)
  ) {
    return fail('material.invalid');
  }
  if (b.resourceId && !resourceIds.has(b.resourceId)) {
    return fail('resource.missing', { id: b.resourceId });
  }
  if (edge && b.resourceId) {
    return fail('material.edgeMustBeColor');
  }
  return valid();
}
/** Checks host bounds and saved animation parameters without adjusting the requested placement. */
export function validateOpening(opening: Opening, wall: Wall): ValidationResult {
  if (opening.levelId !== wall.levelId) {
    return fail('opening.levelMismatch', { id: opening.id });
  }
  if (
    !positive(opening.width) ||
    !positive(opening.height) ||
    !finite(opening.offset) ||
    !finite(opening.sill) ||
    opening.offset < EPSILON ||
    opening.sill < 0 ||
    opening.offset + opening.width > wallLength(wall) - EPSILON ||
    opening.sill + opening.height > wall.height + EPSILON
  ) {
    return fail('opening.outsideWall', { id: opening.id, wallId: wall.id });
  }
  if (opening.kind !== 'door' && opening.kind !== 'window') {
    return fail('opening.invalid', { id: opening.id });
  }
  if (opening.kind === 'door' && Math.abs(opening.sill) > EPSILON) {
    return fail('opening.doorSill', { id: opening.id });
  }
  if (
    (opening.hinge !== 'left' && opening.hinge !== 'right') ||
    ![1, -1].includes(opening.direction) ||
    !finite(opening.angle) ||
    Math.abs(opening.angle) > 180 ||
    !finite(opening.openAngle) ||
    Math.abs(opening.openAngle) > 180 ||
    (opening.closedAngle !== undefined &&
      (!finite(opening.closedAngle) || Math.abs(opening.closedAngle) > 180)) ||
    !positive(opening.duration)
  ) {
    return fail('opening.invalidAnimation', { id: opening.id });
  }
  return valid();
}
/** Finds endpoint and T-junction dependencies only within one formal floor. */
export function wallsConnected(a: Wall, b: Wall): boolean {
  if (a.levelId !== b.levelId) {
    return false;
  }
  return (
    pointOnSegment(a.start, b) ||
    pointOnSegment(a.end, b) ||
    pointOnSegment(b.start, a) ||
    pointOnSegment(b.end, a)
  );
}
/** Tests bounded segment membership; no infinite-line extension is treated as a connection. */
export function pointOnSegment(p: Vec2, wall: Pick<Wall, 'start' | 'end'>): boolean {
  const dx = wall.end.x - wall.start.x,
    dz = wall.end.z - wall.start.z;
  if (Math.abs((p.x - wall.start.x) * dz - (p.z - wall.start.z) * dx) > EPSILON) {
    return false;
  }
  return (
    p.x >= Math.min(wall.start.x, wall.end.x) - EPSILON &&
    p.x <= Math.max(wall.start.x, wall.end.x) + EPSILON &&
    p.z >= Math.min(wall.start.z, wall.end.z) - EPSILON &&
    p.z <= Math.max(wall.start.z, wall.end.z) + EPSILON
  );
}
/** Rejects unsupported cross/overlap/unequal joints before their union reaches the geometry builder. */
export function validateWallPairs(walls: Wall[]): ValidationResult {
  for (let i = 0; i < walls.length; i += 1) {
    const a = walls[i]!;
    for (let j = i + 1; j < walls.length; j += 1) {
      const b = walls[j]!;
      if (a.levelId !== b.levelId) {
        continue;
      }
      const aHorizontal = Math.abs(a.start.z - a.end.z) < EPSILON;
      const bHorizontal = Math.abs(b.start.z - b.end.z) < EPSILON;
      const crossing =
        aHorizontal !== bHorizontal &&
        pointOnSegment(
          { x: aHorizontal ? b.start.x : a.start.x, z: aHorizontal ? a.start.z : b.start.z },
          a,
        ) &&
        pointOnSegment(
          { x: aHorizontal ? b.start.x : a.start.x, z: aHorizontal ? a.start.z : b.start.z },
          b,
        );
      if (!wallsConnected(a, b) && !crossing) {
        const box = (w: Wall) => ({
          minX:
            Math.min(w.start.x, w.end.x) -
            (Math.abs(w.start.x - w.end.x) < EPSILON ? w.thickness / 2 : 0),
          maxX:
            Math.max(w.start.x, w.end.x) +
            (Math.abs(w.start.x - w.end.x) < EPSILON ? w.thickness / 2 : 0),
          minZ:
            Math.min(w.start.z, w.end.z) -
            (Math.abs(w.start.z - w.end.z) < EPSILON ? w.thickness / 2 : 0),
          maxZ:
            Math.max(w.start.z, w.end.z) +
            (Math.abs(w.start.z - w.end.z) < EPSILON ? w.thickness / 2 : 0),
        });
        const aa = box(a),
          bb = box(b);
        if (
          Math.min(aa.maxX, bb.maxX) - Math.max(aa.minX, bb.minX) > EPSILON &&
          Math.min(aa.maxZ, bb.maxZ) - Math.max(aa.minZ, bb.minZ) > EPSILON
        ) {
          return fail('wall.solidOverlap', { ids: [a.id, b.id] });
        }
      }
      if (aHorizontal === bHorizontal) {
        const sameAxis = aHorizontal
          ? Math.abs(a.start.z - b.start.z) < EPSILON
          : Math.abs(a.start.x - b.start.x) < EPSILON;
        if (sameAxis) {
          const aMin = Math.min(
            aHorizontal ? a.start.x : a.start.z,
            aHorizontal ? a.end.x : a.end.z,
          );
          const aMax = Math.max(
            aHorizontal ? a.start.x : a.start.z,
            aHorizontal ? a.end.x : a.end.z,
          );
          const bMin = Math.min(
            bHorizontal ? b.start.x : b.start.z,
            bHorizontal ? b.end.x : b.end.z,
          );
          const bMax = Math.max(
            bHorizontal ? b.start.x : b.start.z,
            bHorizontal ? b.end.x : b.end.z,
          );
          if (Math.min(aMax, bMax) - Math.max(aMin, bMin) > EPSILON) {
            return fail('wall.overlap', { ids: [a.id, b.id] });
          }
          if (wallsConnected(a, b) && Math.abs(a.thickness - b.thickness) > EPSILON) {
            return fail('wall.unequalJunction', { ids: [a.id, b.id] });
          }
        }
      } else {
        const h = aHorizontal ? a : b,
          v = aHorizontal ? b : a;
        const hit = { x: v.start.x, z: h.start.z };
        if (pointOnSegment(hit, h) && pointOnSegment(hit, v)) {
          const endpointA = samePoint(hit, a.start) || samePoint(hit, a.end);
          const endpointB = samePoint(hit, b.start) || samePoint(hit, b.end);
          if (!endpointA && !endpointB) {
            return fail('wall.crossUnsupported', { ids: [a.id, b.id] });
          }
          if (Math.abs(a.thickness - b.thickness) > EPSILON) {
            return fail('wall.unequalJunction', { ids: [a.id, b.id] });
          }
        }
      }
    }
  }
  return valid();
}
