import type { ProjectDocument, SnapCandidate, Vec2 } from '@building/editor-core';
import { deriveSurfacePaths } from './surface-paths';
import { GEOMETRY_EPSILON } from './types';
import type { SurfaceSegment } from './types';

interface BoundarySegment {
  objectId: string;
  side: SurfaceSegment['side'];
  start: Vec2;
  end: Vec2;
}

const compareId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const comparePoint = (a: Vec2, b: Vec2) => a.x - b.x || a.z - b.z;
const pointKey = (point: Vec2) =>
  `${Math.round(point.x / GEOMETRY_EPSILON)}:${Math.round(point.z / GEOMETRY_EPSILON)}`;

function normalizedSegment(segment: SurfaceSegment): BoundarySegment {
  const forward = comparePoint(segment.start, segment.end) <= 0;
  return {
    objectId: segment.wallId,
    side: segment.side,
    start: { ...(forward ? segment.start : segment.end) },
    end: { ...(forward ? segment.end : segment.start) },
  };
}

/** Uses the visible wall-union footprint; openings have separate core anchors and do not cut these routes. */
export function buildEffectiveWallSnapCandidates(
  document: ProjectDocument,
  levelId: string,
): SnapCandidate[] {
  const walls = document.walls.filter((wall) => wall.levelId === levelId);
  if (!walls.length) {
    return [];
  }
  const scoped = { ...document, walls };
  const segments = deriveSurfacePaths(scoped)
    .flatMap((path) => path.segments)
    .map(normalizedSegment)
    .filter(
      (segment) =>
        Math.hypot(segment.end.x - segment.start.x, segment.end.z - segment.start.z) >
        GEOMETRY_EPSILON,
    )
    .sort(
      (a, b) =>
        compareId(a.objectId, b.objectId) ||
        comparePoint(a.start, b.start) ||
        comparePoint(a.end, b.end) ||
        compareId(a.side, b.side),
    );
  const pointOwners = new Map<string, Set<string>>();
  for (const segment of segments) {
    for (const point of [segment.start, segment.end]) {
      const key = pointKey(point);
      const owners = pointOwners.get(key) ?? new Set<string>();
      owners.add(segment.objectId);
      pointOwners.set(key, owners);
    }
  }
  const indices = new Map<string, number>();
  const result: SnapCandidate[] = [];
  for (const segment of segments) {
    const index = indices.get(segment.objectId) ?? 0;
    indices.set(segment.objectId, index + 1);
    result.push({
      objectId: segment.objectId,
      levelId,
      targetKind: 'wall-edge',
      segment: { start: { ...segment.start }, end: { ...segment.end }, index },
      index,
      source: 'formal',
      relatedObjectIds: [segment.objectId],
    });
    for (const [endpoint, point] of [segment.start, segment.end].entries()) {
      result.push({
        objectId: segment.objectId,
        levelId,
        targetKind: 'anchor',
        point: { ...point },
        index: index * 2 + endpoint,
        source: 'formal',
        relatedObjectIds: [...pointOwners.get(pointKey(point))!].sort(compareId),
      });
    }
  }
  return result;
}
