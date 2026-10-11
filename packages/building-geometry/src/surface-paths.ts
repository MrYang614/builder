import type { ProjectDocument, Vec2 } from '@building/editor-core';
import type { Point3, SurfacePath, SurfaceSegment, WallSolid } from './types';
import {
  solids,
  overlap,
  cuts,
  sideFor,
  ownerAt,
  coord,
  pointCompare,
  length,
  bindingKey,
} from './solids';

/** Visible perimeter routes; a T routes around its concave corners instead of jumping across its branch. */
export function deriveSurfacePaths(doc: ProjectDocument): SurfacePath[] {
  return deriveSurfacePathsFromSolids(doc, solids(doc));
}

/** Reuses the current revision's wall solids instead of repeating the connection/host scan. */
export function deriveSurfacePathsFromSolids(doc: ProjectDocument, ss: WallSolid[]): SurfacePath[] {
  const segments: SurfaceSegment[] = [];
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
          [a.start, a.end].some((p) => coord(p) === coord(b.start) || coord(p) === coord(b.end)) &&
          sameGroup(a, b)
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
