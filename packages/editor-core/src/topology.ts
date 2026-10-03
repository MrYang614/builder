import type { Vec2, Wall } from './model';
import type { DomainError } from './validation';
import { EPSILON, pointOnSegment, samePoint } from './validation';

class CoordinateSets {
  private parents: number[];
  constructor(size: number) {
    this.parents = Array.from({ length: size }, (_, index) => index);
  }
  find(index: number): number {
    const parent = this.parents[index]!;
    if (parent === index) {
      return index;
    }
    this.parents[index] = this.find(parent);
    return this.parents[index]!;
  }
  union(a: number, b: number): void {
    const aa = this.find(a),
      bb = this.find(b);
    if (aa !== bb) {
      this.parents[Math.max(aa, bb)] = Math.min(aa, bb);
    }
  }
}
interface Endpoint {
  wall: Wall;
  endpoint: 'start' | 'end';
  point: Vec2;
}
interface Junction {
  branchIndex: number;
  hostId: string;
}
/**
 * A bounded orthogonal solver. Coincident corners share both coordinates; the two ends of
 * an axis-aligned wall share its perpendicular coordinate. T joints share the host axis,
 * while their position along that host is free only inside the existing host segment.
 * It cannot detach, invert, invent a wall or silently trim hosted doors/windows.
 */
export function propagateWallEndpoints(
  walls: Wall[],
  edited: Wall,
  patch: Partial<Omit<Wall, 'id'>>,
): Wall[] | DomainError {
  if ((!patch.start && !patch.end) || (patch.levelId && patch.levelId !== edited.levelId)) {
    return walls;
  }
  const local = walls.filter((wall) => wall.levelId === edited.levelId);
  const endpoints: Endpoint[] = local.flatMap((wall) => [
    { wall, endpoint: 'start', point: wall.start },
    { wall, endpoint: 'end', point: wall.end },
  ]);
  const x = new CoordinateSets(endpoints.length),
    z = new CoordinateSets(endpoints.length),
    junctions: Junction[] = [];
  for (let index = 0; index < local.length; index += 1) {
    const wall = local[index]!;
    (Math.abs(wall.end.x - wall.start.x) < EPSILON ? x : z).union(index * 2, index * 2 + 1);
  }
  // Endpoint hashing bounds corner lookup even for many unrelated walls in the same layer.
  const buckets = new Map<string, number[]>();
  const bucketKey = (cx: number, cz: number) => `${cx}:${cz}`;
  for (let index = 0; index < endpoints.length; index += 1) {
    const endpoint = endpoints[index]!,
      cx = Math.round(endpoint.point.x / EPSILON),
      cz = Math.round(endpoint.point.z / EPSILON);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        for (const other of buckets.get(bucketKey(cx + dx, cz + dz)) ?? []) {
          if (samePoint(endpoint.point, endpoints[other]!.point)) {
            x.union(index, other);
            z.union(index, other);
          }
        }
      }
    }
    const key = bucketKey(cx, cz);
    buckets.set(key, [...(buckets.get(key) ?? []), index]);
  }
  for (let index = 0; index < endpoints.length; index += 1) {
    const endpoint = endpoints[index]!,
      horizontal = Math.abs(endpoint.wall.end.z - endpoint.wall.start.z) < EPSILON;
    for (let hostIndex = 0; hostIndex < local.length; hostIndex += 1) {
      const host = local[hostIndex]!;
      if (
        host.id === endpoint.wall.id ||
        horizontal === Math.abs(host.end.z - host.start.z) < EPSILON
      ) {
        continue;
      }
      if (
        !pointOnSegment(endpoint.point, host) ||
        samePoint(endpoint.point, host.start) ||
        samePoint(endpoint.point, host.end)
      ) {
        continue;
      }
      (horizontal ? x : z).union(index, hostIndex * 2);
      junctions.push({ branchIndex: index, hostId: host.id });
    }
  }
  const seedsX = new Map<number, number>(),
    seedsZ = new Map<number, number>();
  const conflict = (): DomainError => ({
    code: 'wall.topologyEditUnsupported',
    params: { id: edited.id },
  });
  for (let index = 0; index < endpoints.length; index += 1) {
    const endpoint = endpoints[index]!;
    if (endpoint.wall.id !== edited.id) {
      continue;
    }
    const requested = patch[endpoint.endpoint];
    if (!requested) {
      continue;
    }
    for (const [axis, sets, seeds] of [
      ['x', x, seedsX],
      ['z', z, seedsZ],
    ] as const) {
      if (Math.abs(requested[axis] - endpoint.point[axis]) < EPSILON) {
        continue;
      }
      const group = sets.find(index),
        previous = seeds.get(group);
      if (previous !== undefined && Math.abs(previous - requested[axis]) > EPSILON) {
        return conflict();
      }
      seeds.set(group, requested[axis]);
    }
  }
  if (!seedsX.size && !seedsZ.size) {
    return walls;
  }
  const moved = new Map<string, Wall>();
  const movedEndpoints = endpoints.map((endpoint, index) => ({
    x: seedsX.get(x.find(index)) ?? endpoint.point.x,
    z: seedsZ.get(z.find(index)) ?? endpoint.point.z,
  }));
  for (let index = 0; index < local.length; index += 1) {
    const wall = local[index]!,
      start = movedEndpoints[index * 2]!,
      end = movedEndpoints[index * 2 + 1]!;
    if (samePoint(start, wall.start) && samePoint(end, wall.end)) {
      continue;
    }
    // Crossing the stable reference start would exchange the direction of a face and its hosted offsets.
    const dot =
      (wall.end.x - wall.start.x) * (end.x - start.x) +
      (wall.end.z - wall.start.z) * (end.z - start.z);
    if (
      dot <= EPSILON ||
      (Math.abs(start.x - end.x) > EPSILON && Math.abs(start.z - end.z) > EPSILON)
    ) {
      return conflict();
    }
    moved.set(wall.id, { ...wall, start, end });
  }
  for (const junction of junctions) {
    const host = moved.get(junction.hostId) ?? local.find((wall) => wall.id === junction.hostId)!;
    if (!pointOnSegment(movedEndpoints[junction.branchIndex]!, host)) {
      return conflict();
    }
  }
  return walls.map((wall) => moved.get(wall.id) ?? wall);
}
