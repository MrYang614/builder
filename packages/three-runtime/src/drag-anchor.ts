import type { Opening, ProjectDocument, Slab, Vec2, Wall } from '@building/editor-core';

export interface SnapAxisConstraint {
  x?: number;
  z?: number;
}
export interface DragAnchor {
  start: Vec2;
  pointerOffset?: Vec2;
  constraint?: SnapAxisConstraint;
}

/** Retains a formal anchor; body moves keep grab offsets, handles follow the precise editing plane. */
export function dragAnchor(
  object: Wall | Slab | Opening,
  document: ProjectDocument,
  raw: Vec2,
  enabled: boolean,
  endpoint?: 'start' | 'end',
  corner?: number,
): DragAnchor {
  if (!enabled) {
    return { start: raw };
  }
  let points: readonly Vec2[];
  let constraint: SnapAxisConstraint | undefined;
  if ('start' in object) {
    points = endpoint ? [object[endpoint]] : [object.start, object.end];
    if (endpoint) {
      constraint =
        Math.abs(object.end.x - object.start.x) > 0.001
          ? { z: object.start.z }
          : { x: object.start.x };
    }
  } else if ('polygon' in object) {
    if (corner !== undefined && (!Number.isInteger(corner) || !object.polygon[corner])) {
      return { start: raw };
    }
    points = corner === undefined ? object.polygon : [object.polygon[corner]!];
  } else {
    const wall = document.walls.find((candidate) => candidate.id === object.wallId);
    if (!wall) {
      return { start: raw };
    }
    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.z - wall.start.z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-7) {
      return { start: raw };
    }
    points = [object.offset, object.offset + object.width].flatMap((offset) =>
      [-1, 1].map((side) => ({
        x: wall.start.x + (dx * offset - (dz * wall.thickness * side) / 2) / length,
        z: wall.start.z + (dz * offset + (dx * wall.thickness * side) / 2) / length,
      })),
    );
  }
  let start = points[0] ?? raw;
  let distance = Math.hypot(start.x - raw.x, start.z - raw.z);
  for (const point of points) {
    const next = Math.hypot(point.x - raw.x, point.z - raw.z);
    if (next < distance) {
      start = point;
      distance = next;
    }
  }
  if ('wallId' in object) {
    const wall = document.walls.find((candidate) => candidate.id === object.wallId)!;
    constraint = Math.abs(wall.end.x - wall.start.x) > 0.001 ? { z: start.z } : { x: start.x };
  }
  return {
    start,
    // Raised handles project away from their footprint under perspective. Keeping that
    // offset would bias the requested endpoint/corner rather than preserve a body grab.
    pointerOffset:
      endpoint || corner !== undefined ? undefined : { x: start.x - raw.x, z: start.z - raw.z },
    constraint,
  };
}
