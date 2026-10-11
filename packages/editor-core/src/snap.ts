import type { Opening, ProjectDocument, Slab, Vec2, Wall } from './model';
import {
  SEGMENT_EPSILON,
  COORDINATE_EPSILON,
  finitePoint,
  distance,
  compareNumber,
  comparePoint,
  compareIdentifiers,
  satisfiesConstraint,
  projectToSegment,
  intersection,
} from './snap-primitives';

export type SnapMode = 'off' | 'points' | 'lines' | 'grid' | 'all';
export type SnapTargetKind =
  | 'intersection'
  | 'wall-endpoint'
  | 'wall-junction'
  | 'slab-vertex'
  | 'opening-corner'
  | 'anchor'
  | 'wall-centerline'
  | 'wall-edge'
  | 'slab-edge';
export interface SnapSettings {
  enabled: boolean;
  mode: SnapMode;
  /** Maximum distance in metres at which a geometric candidate is accepted. */
  tolerance: number;
  /** Grid spacing in metres. Grid is used only when mode includes grid. */
  gridSize: number;
}
export const DEFAULT_SNAP_SETTINGS: Readonly<SnapSettings> = Object.freeze({
  enabled: true,
  mode: 'all',
  tolerance: 0.16,
  gridSize: 0.1,
});
export interface SnapSegment {
  start: Vec2;
  end: Vec2;
  index?: number;
}
export interface SnapCandidate {
  objectId: string;
  levelId: string;
  targetKind: SnapTargetKind;
  point?: Vec2;
  segment?: SnapSegment;
  index?: number;
  source?: 'formal' | 'preview' | 'ghost' | 'auxiliary';
  /** Intersection ownership includes both sources so editing either cannot snap to itself. */
  relatedObjectIds?: readonly string[];
}
export type SnapResultKind = 'point' | 'line' | 'grid' | 'raw';

export interface SnapResult {
  point: Vec2;
  kind: SnapResultKind;
  targetKind?: SnapTargetKind;
  objectId?: string;
  levelId?: string;
  /** Metres from the effective query anchor, before any axis projection. Raw results use zero. */
  distance: number;
  /** Runtime-supplied unadjusted ray/plane pointer in world XZ metres. */
  rawPoint?: Vec2;
  /** Runtime pointer-to-result distance; grab offsets can make this exceed snap tolerance. */
  pointerDistance?: number;
  labelKey?: string;
  segment?: SnapSegment;
  relatedObjectIds?: readonly string[];
}

export interface SnapQueryOptions {
  /** Candidate level. A missing level rejects all document candidates. */
  levelId: string;
  /** Exclude the object being edited to prevent self snapping. */
  excludeId?: string;
  /** Allow caller supplied anchors, such as an active object's valid handle. */
  anchors?: readonly SnapCandidate[];
  constraint?: Partial<Vec2>;
  /** Unprojected editing anchor used for tolerance and ranking when raw is axis constrained. */
  distanceOrigin?: Vec2;
}

const POINT_RANK: Readonly<Record<SnapTargetKind, number>> = Object.freeze({
  intersection: 0,
  'wall-endpoint': 1,
  'wall-junction': 0,
  anchor: 2,
  'opening-corner': 2,
  'slab-vertex': 3,
  'wall-centerline': 4,
  'wall-edge': 4,
  'slab-edge': 4,
});

function compareCandidate(a: SnapCandidate, b: SnapCandidate): number {
  return (
    a.levelId.localeCompare(b.levelId) ||
    a.objectId.localeCompare(b.objectId) ||
    compareNumber(a.index ?? 0, b.index ?? 0) ||
    a.targetKind.localeCompare(b.targetKind) ||
    comparePoint(
      a.point ?? a.segment?.start ?? { x: 0, z: 0 },
      b.point ?? b.segment?.start ?? { x: 0, z: 0 },
    ) ||
    comparePoint(
      a.segment?.end ?? a.point ?? { x: 0, z: 0 },
      b.segment?.end ?? b.point ?? { x: 0, z: 0 },
    ) ||
    compareNumber(a.segment?.index ?? -1, b.segment?.index ?? -1) ||
    compareIdentifiers(a.relatedObjectIds, b.relatedObjectIds)
  );
}

function isUsableCandidate(candidate: SnapCandidate): boolean {
  return (
    candidate.source !== 'preview' &&
    candidate.source !== 'ghost' &&
    candidate.source !== 'auxiliary' &&
    (!candidate.point || finitePoint(candidate.point)) &&
    (!candidate.segment ||
      (finitePoint(candidate.segment.start) && finitePoint(candidate.segment.end)))
  );
}

function pointCandidate(
  objectId: string,
  levelId: string,
  targetKind: SnapTargetKind,
  point: Vec2,
  index: number,
): SnapCandidate {
  return { objectId, levelId, targetKind, point: { ...point }, index, source: 'formal' };
}

function segmentCandidate(
  objectId: string,
  levelId: string,
  targetKind: SnapTargetKind,
  start: Vec2,
  end: Vec2,
  index: number,
): SnapCandidate {
  return {
    objectId,
    levelId,
    targetKind,
    segment: { start: { ...start }, end: { ...end }, index },
    index,
    source: 'formal',
  };
}

function wallEdge(wall: Wall, side: 1 | -1): SnapSegment {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const length = Math.hypot(dx, dz);
  if (length < SEGMENT_EPSILON) {
    return { start: { ...wall.start }, end: { ...wall.end } };
  }
  const half = wall.thickness / 2;
  const ox = (-dz / length) * half * side;
  const oz = (dx / length) * half * side;
  return {
    start: { x: wall.start.x + ox, z: wall.start.z + oz },
    end: { x: wall.end.x + ox, z: wall.end.z + oz },
  };
}

function addWallCandidates(wall: Wall, result: SnapCandidate[]) {
  const start = pointCandidate(wall.id, wall.levelId, 'wall-endpoint', wall.start, 0);
  const end = pointCandidate(wall.id, wall.levelId, 'wall-endpoint', wall.end, 1);
  result.push(start, end);
  result.push(segmentCandidate(wall.id, wall.levelId, 'wall-centerline', wall.start, wall.end, 0));
  for (const [index, edge] of [wallEdge(wall, -1), wallEdge(wall, 1)].entries()) {
    result.push(
      segmentCandidate(wall.id, wall.levelId, 'wall-edge', edge.start, edge.end, index + 1),
    );
  }
}

function addSlabCandidates(slab: Slab, result: SnapCandidate[]) {
  for (const [index, point] of slab.polygon.entries()) {
    result.push(pointCandidate(slab.id, slab.levelId, 'slab-vertex', point, index));
    const end = slab.polygon[(index + 1) % slab.polygon.length];
    if (end) {
      result.push(segmentCandidate(slab.id, slab.levelId, 'slab-edge', point, end, index));
    }
  }
}

function addOpeningCandidates(opening: Opening, wall: Wall, result: SnapCandidate[]) {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const length = Math.hypot(dx, dz);
  if (length < SEGMENT_EPSILON) {
    return;
  }
  const half = wall.thickness / 2;
  const nx = (-dz / length) * half;
  const nz = (dx / length) * half;
  for (const [edge, offset] of [opening.offset, opening.offset + opening.width].entries()) {
    const center = {
      x: wall.start.x + (dx / length) * offset,
      z: wall.start.z + (dz / length) * offset,
    };
    for (const [index, sign] of [-1, 1].entries()) {
      result.push({
        ...pointCandidate(
          opening.id,
          opening.levelId,
          'opening-corner',
          { x: center.x + nx * sign, z: center.z + nz * sign },
          edge * 2 + index,
        ),
        relatedObjectIds: [wall.id],
      });
    }
  }
}

/** Builds raw formal candidates for one level; prepare after merging changed-object groups. */
export function buildSnapCandidates(
  document: ProjectDocument,
  options: SnapQueryOptions,
): SnapCandidate[] {
  const result: SnapCandidate[] = [];
  const walls = document.walls
    .filter((wall) => wall.levelId === options.levelId && wall.id !== options.excludeId)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const wall of walls) {
    addWallCandidates(wall, result);
  }
  const slabs = document.slabs
    .filter((slab) => slab.levelId === options.levelId && slab.id !== options.excludeId)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const slab of slabs) {
    addSlabCandidates(slab, result);
  }
  const byId = new Map(walls.map((wall) => [wall.id, wall]));
  const openings = document.openings
    .filter((opening) => opening.levelId === options.levelId && opening.id !== options.excludeId)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const opening of openings) {
    const wall = byId.get(opening.wallId);
    if (wall) {
      addOpeningCandidates(opening, wall, result);
    }
  }
  return result.sort(compareCandidate);
}

/** Alias kept for callers that describe this operation as collection rather than indexing. */
export const collectSnapCandidates = buildSnapCandidates;

function includesMode(settings: SnapSettings, mode: Exclude<SnapMode, 'off' | 'all'>): boolean {
  return (
    settings.enabled &&
    settings.mode !== 'off' &&
    (settings.mode === 'all' || settings.mode === mode)
  );
}
type ScoredCandidate = { candidate: SnapCandidate; point: Vec2; distance: number; rank: number };

function compareScored(a: ScoredCandidate, b: ScoredCandidate): number {
  return (
    compareNumber(a.rank, b.rank) ||
    compareNumber(a.distance, b.distance) ||
    compareCandidate(a.candidate, b.candidate) ||
    comparePoint(a.point, b.point)
  );
}

function excluded(candidate: SnapCandidate, excludeId?: string): boolean {
  return (
    !!excludeId &&
    (candidate.objectId === excludeId || !!candidate.relatedObjectIds?.includes(excludeId))
  );
}

/** Precomputes intersections once per candidate revision; pointer queries never compare segment pairs. */
export function prepareSnapCandidates(
  candidates: readonly SnapCandidate[],
  options: { levelId?: string; excludeId?: string } = {},
): SnapCandidate[] {
  const result = candidates
    .filter(
      (candidate) =>
        (!options.levelId || candidate.levelId === options.levelId) &&
        !(candidate.targetKind === 'wall-junction' && candidate.relatedObjectIds) &&
        !(candidate.targetKind === 'intersection' && candidate.relatedObjectIds) &&
        !excluded(candidate, options.excludeId) &&
        isUsableCandidate(candidate),
    )
    .sort(compareCandidate);
  const endpoints = new Map<string, SnapCandidate[]>();
  for (const candidate of result) {
    if (candidate.targetKind !== 'wall-endpoint' || !candidate.point) {
      continue;
    }
    const key = `${candidate.levelId}:${Math.round(candidate.point.x / COORDINATE_EPSILON)}:${Math.round(candidate.point.z / COORDINATE_EPSILON)}`;
    const group = endpoints.get(key) ?? [];
    group.push(candidate);
    endpoints.set(key, group);
  }
  for (const group of endpoints.values()) {
    const relatedObjectIds = [...new Set(group.map((candidate) => candidate.objectId))].sort();
    if (relatedObjectIds.length > 1) {
      result.push(
        ...group.map((candidate) => ({
          ...candidate,
          targetKind: 'wall-junction' as const,
          relatedObjectIds,
        })),
      );
    }
  }
  const segments = result
    .filter((candidate) => candidate.segment)
    .map((candidate) => ({
      candidate,
      minX: Math.min(candidate.segment!.start.x, candidate.segment!.end.x),
      maxX: Math.max(candidate.segment!.start.x, candidate.segment!.end.x),
      minZ: Math.min(candidate.segment!.start.z, candidate.segment!.end.z),
      maxZ: Math.max(candidate.segment!.start.z, candidate.segment!.end.z),
    }))
    .sort((a, b) => compareNumber(a.minX, b.minX) || compareCandidate(a.candidate, b.candidate));
  const seen = new Set<string>();
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const a = segments[i]!;
      const b = segments[j]!;
      if (b.minX > a.maxX + COORDINATE_EPSILON) {
        break;
      }
      if (
        a.candidate.objectId === b.candidate.objectId ||
        a.candidate.levelId !== b.candidate.levelId ||
        b.minZ > a.maxZ + COORDINATE_EPSILON ||
        a.minZ > b.maxZ + COORDINATE_EPSILON
      ) {
        continue;
      }
      const point = intersection(a.candidate.segment!, b.candidate.segment!);
      if (!point) {
        continue;
      }
      const owners = [a.candidate.objectId, b.candidate.objectId].sort();
      const key = `${owners.join('|')}|${point.x.toPrecision(15)}:${point.z.toPrecision(15)}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push({
        objectId: owners[0]!,
        levelId: a.candidate.levelId,
        targetKind: 'intersection',
        point,
        index: Math.min(a.candidate.index ?? 0, b.candidate.index ?? 0),
        source: 'formal',
        relatedObjectIds: owners,
      });
    }
  }
  return result.sort(compareCandidate);
}

/** Uses fixed rank/distance/id ties; prepared caches query in O(n) without rebuilding intersections. */
export function resolveSnapPoint(
  raw: Vec2,
  candidates: readonly SnapCandidate[],
  settings: SnapSettings = DEFAULT_SNAP_SETTINGS,
  options: {
    levelId?: string;
    excludeId?: string;
    prepared?: boolean;
    constraint?: Partial<Vec2>;
    distanceOrigin?: Vec2;
  } = {},
): SnapResult {
  const levelId = options.levelId;
  const levelContext = levelId ? { levelId } : {};
  if (!settings.enabled || settings.mode === 'off') {
    return { point: { ...raw }, kind: 'raw', distance: 0, ...levelContext };
  }
  const distanceOrigin = options.distanceOrigin ?? raw;
  const points = includesMode(settings, 'points');
  const lines = includesMode(settings, 'lines');
  const prepared =
    options.prepared || (!points && !lines)
      ? candidates
      : prepareSnapCandidates(candidates, options);
  let best: ScoredCandidate | undefined;
  for (const candidate of prepared) {
    if (
      (levelId && candidate.levelId !== levelId) ||
      excluded(candidate, options.excludeId) ||
      !isUsableCandidate(candidate)
    ) {
      continue;
    }
    const point =
      points && candidate.point
        ? candidate.point
        : lines && candidate.segment
          ? projectToSegment(raw, candidate.segment)
          : undefined;
    if (!point || !satisfiesConstraint(point, options.constraint)) {
      continue;
    }
    const candidateDistance = distance(distanceOrigin, point);
    if (candidateDistance > settings.tolerance) {
      continue;
    }
    const score = {
      candidate,
      point,
      distance: candidateDistance,
      rank: POINT_RANK[candidate.targetKind],
    };
    if (score.distance <= settings.tolerance && (!best || compareScored(score, best) < 0)) {
      best = score;
    }
  }
  if (best) {
    return {
      point: { ...best.point },
      kind: best.candidate.targetKind === 'intersection' || best.candidate.point ? 'point' : 'line',
      targetKind: best.candidate.targetKind,
      objectId: best.candidate.objectId,
      levelId: best.candidate.levelId,
      distance: best.distance,
      labelKey: `snap.${best.candidate.targetKind}`,
      ...(best.candidate.segment ? { segment: best.candidate.segment } : {}),
      ...(best.candidate.relatedObjectIds
        ? { relatedObjectIds: best.candidate.relatedObjectIds }
        : {}),
    };
  }
  if (includesMode(settings, 'grid') && settings.gridSize > SEGMENT_EPSILON) {
    const gridPoint = {
      x: options.constraint?.x ?? Math.round(raw.x / settings.gridSize) * settings.gridSize,
      z: options.constraint?.z ?? Math.round(raw.z / settings.gridSize) * settings.gridSize,
    };
    const gridDistance = distance(distanceOrigin, gridPoint);
    if (gridDistance <= settings.tolerance) {
      return {
        point: gridPoint,
        kind: 'grid',
        distance: gridDistance,
        labelKey: 'snap.grid',
        ...levelContext,
      };
    }
  }
  return { point: { ...raw }, kind: 'raw', distance: 0, ...levelContext };
}

/** Project-level convenience API used by pointer tools and tests. */
export function snapDocumentPoint(
  raw: Vec2,
  document: ProjectDocument,
  settings: SnapSettings = DEFAULT_SNAP_SETTINGS,
  options: SnapQueryOptions,
): SnapResult {
  const candidates = buildSnapCandidates(document, options);
  const anchors = (options.anchors ?? []).filter((anchor) => anchor.objectId !== options.excludeId);
  return resolveSnapPoint(raw, [...candidates, ...anchors], settings, {
    levelId: options.levelId,
    excludeId: options.excludeId,
    constraint: options.constraint,
    distanceOrigin: options.distanceOrigin,
  });
}
