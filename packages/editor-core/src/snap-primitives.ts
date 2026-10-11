import type { Vec2 } from './model';
import type { SnapSegment } from './snap';

export const SEGMENT_EPSILON = 1e-12;
export const COORDINATE_EPSILON = 1e-7;

export const finitePoint = (point: Vec2): boolean =>
  Number.isFinite(point.x) && Number.isFinite(point.z);

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function compareNumber(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function comparePoint(a: Vec2, b: Vec2): number {
  return compareNumber(a.x, b.x) || compareNumber(a.z, b.z);
}

function compareIdentifierOrder(a: readonly string[], b: readonly string[]): number {
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = a[index]!.localeCompare(b[index]!);
    if (difference) {
      return difference;
    }
  }
  return compareNumber(a.length, b.length);
}

/** Ownership breaks otherwise identical target ties, including supplied overlapping segments. */
export function compareIdentifiers(a: readonly string[] = [], b: readonly string[] = []): number {
  return compareIdentifierOrder([...a].sort(), [...b].sort()) || compareIdentifierOrder(a, b);
}

/** Rejects targets off a locked editing axis; tolerances are metric rather than screen based. */
export function satisfiesConstraint(point: Vec2, constraint?: Partial<Vec2>): boolean {
  return (
    (!constraint ||
      constraint.x === undefined ||
      Math.abs(point.x - constraint.x) <= COORDINATE_EPSILON) &&
    (!constraint ||
      constraint.z === undefined ||
      Math.abs(point.z - constraint.z) <= COORDINATE_EPSILON)
  );
}

/** Closest finite-segment point; exact stored endpoints and axis coordinates avoid rounding drift. */
export function projectToSegment(point: Vec2, segment: SnapSegment): Vec2 | undefined {
  const dx = segment.end.x - segment.start.x;
  const dz = segment.end.z - segment.start.z;
  const squared = dx * dx + dz * dz;
  if (squared < COORDINATE_EPSILON ** 2) {
    return undefined;
  }
  const t = Math.max(
    0,
    Math.min(1, ((point.x - segment.start.x) * dx + (point.z - segment.start.z) * dz) / squared),
  );
  if (t === 0 || t === 1) {
    return { ...(t === 0 ? segment.start : segment.end) };
  }
  return {
    x: dz === 0 ? point.x : segment.start.x + dx * t,
    z: dx === 0 ? point.z : segment.start.z + dz * t,
  };
}

/** Crossing interiors only; endpoints keep their formal semantic node candidates. */
export function intersection(a: SnapSegment, b: SnapSegment): Vec2 | undefined {
  const r = { x: a.end.x - a.start.x, z: a.end.z - a.start.z };
  const s = { x: b.end.x - b.start.x, z: b.end.z - b.start.z };
  const denominator = r.x * s.z - r.z * s.x;
  if (Math.abs(denominator) < SEGMENT_EPSILON) {
    return undefined;
  }
  const q = { x: b.start.x - a.start.x, z: b.start.z - a.start.z };
  const t = (q.x * s.z - q.z * s.x) / denominator;
  const u = (q.x * r.z - q.z * r.x) / denominator;
  if (
    t <= SEGMENT_EPSILON ||
    t >= 1 - SEGMENT_EPSILON ||
    u <= SEGMENT_EPSILON ||
    u >= 1 - SEGMENT_EPSILON
  ) {
    return undefined;
  }
  return { x: a.start.x + t * r.x, z: a.start.z + t * r.z };
}
