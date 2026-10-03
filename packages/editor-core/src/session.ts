import type { ProjectDocument, Vec2, Wall } from './model';
import { DEFAULTS } from './model';
import { freezeDocument } from './core';
import { pointOnSegment } from './validation';

export type Tool = 'select' | 'wall' | 'slab' | 'door' | 'window' | 'material';
export type SurfaceRole = 'A' | 'B' | 'edge' | 'top' | 'bottom' | 'opening';
export interface EditorSession {
  currentLevelId: string;
  tool: Tool;
  selectedId?: string;
  selectedSurface?: SurfaceRole;
  wholeBuildingPreview: boolean;
  hiddenIds: string[];
  slabPurpose: 'floor' | 'roof';
  roofElevation?: number;
}
export class SessionStore {
  private snapshot: EditorSession;
  private readonly listeners = new Set<() => void>();
  constructor(currentLevelId: string) {
    this.snapshot = freezeDocument({
      currentLevelId,
      tool: 'select',
      wholeBuildingPreview: false,
      hiddenIds: [],
      slabPurpose: 'floor',
    });
  }
  getSnapshot = (): EditorSession => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  set(patch: Partial<EditorSession>): void {
    if (
      Object.entries(patch).every(
        ([key, value]) => this.snapshot[key as keyof EditorSession] === value,
      )
    ) {
      return;
    }
    this.snapshot = freezeDocument({ ...this.snapshot, ...patch });
    // oxlint-disable-next-line unicorn/no-useless-spread -- Preserve the subscribers present when this session change began.
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
  reconcile(document: ProjectDocument): void {
    const patch: Partial<EditorSession> = {};
    if (!document.levels.some((l) => l.id === this.snapshot.currentLevelId)) {
      patch.currentLevelId = document.levels[0]!.id;
    }
    const selected = [...document.walls, ...document.slabs, ...document.openings].find(
      (o) => o.id === this.snapshot.selectedId,
    );
    if (
      this.snapshot.selectedId &&
      (!selected || selected.levelId !== (patch.currentLevelId ?? this.snapshot.currentLevelId))
    ) {
      patch.selectedId = undefined;
      patch.selectedSurface = undefined;
    }
    this.set(patch);
  }
}

export interface SnapResult {
  point: Vec2;
  kind: 'endpoint' | 'edge' | 'grid';
  objectId?: string;
}
/** Candidate construction excludes all noncurrent levels before distance comparisons. */
export function snapPoint(
  point: Vec2,
  document: ProjectDocument,
  levelId: string,
  options: {
    grid?: number;
    tolerance?: number;
    excludeId?: string;
    orthogonalFrom?: Vec2;
  } = {},
): SnapResult {
  const grid = options.grid ?? DEFAULTS.grid;
  const tolerance = options.tolerance ?? 0.16;
  const candidates: { point: Vec2; kind: 'endpoint' | 'edge'; objectId: string }[] = [];
  const walls = document.walls.filter((w) => w.levelId === levelId && w.id !== options.excludeId);
  for (const wall of walls) {
    candidates.push(
      { point: wall.start, kind: 'endpoint', objectId: wall.id },
      { point: wall.end, kind: 'endpoint', objectId: wall.id },
    );
    const p = projectPointToWall(point, wall);
    if (pointOnSegment(p, wall)) {
      candidates.push({ point: p, kind: 'edge', objectId: wall.id });
    }
  }
  for (const slab of document.slabs.filter(
    (s) => s.levelId === levelId && s.id !== options.excludeId,
  )) {
    for (const p of slab.polygon) {
      candidates.push({ point: p, kind: 'endpoint', objectId: slab.id });
    }
    for (let i = 0; i < slab.polygon.length; i += 1) {
      const edge = { start: slab.polygon[i]!, end: slab.polygon[(i + 1) % slab.polygon.length]! };
      const p = projectPointToWall(point, edge);
      if (pointOnSegment(p, edge)) {
        candidates.push({ point: p, kind: 'edge', objectId: slab.id });
      }
    }
  }
  const endpoint = candidates
    .filter((c) => c.kind === 'endpoint')
    .sort((a, b) => distance(point, a.point) - distance(point, b.point))[0];
  const edge = candidates
    .filter((c) => c.kind === 'edge')
    .sort((a, b) => distance(point, a.point) - distance(point, b.point))[0];
  const candidate =
    endpoint && distance(point, endpoint.point) <= tolerance
      ? endpoint
      : edge && distance(point, edge.point) <= tolerance
        ? edge
        : undefined;
  let result: SnapResult = candidate
    ? { ...candidate, point: { ...candidate.point } }
    : {
        point: { x: Math.round(point.x / grid) * grid, z: Math.round(point.z / grid) * grid },
        kind: 'grid',
      };
  if (options.orthogonalFrom) {
    const start = options.orthogonalFrom;
    const dx = result.point.x - start.x,
      dz = result.point.z - start.z;
    result = {
      ...result,
      point:
        Math.abs(dx) >= Math.abs(dz)
          ? { x: result.point.x, z: start.z }
          : { x: start.x, z: result.point.z },
    };
  }
  return result;
}
function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
export function projectPointToWall(point: Vec2, wall: Pick<Wall, 'start' | 'end'>): Vec2 {
  const dx = wall.end.x - wall.start.x,
    dz = wall.end.z - wall.start.z;
  const squared = dx * dx + dz * dz;
  const t = squared ? ((point.x - wall.start.x) * dx + (point.z - wall.start.z) * dz) / squared : 0;
  return { x: wall.start.x + dx * t, z: wall.start.z + dz * t };
}
export function wallOffset(point: Vec2, wall: Pick<Wall, 'start' | 'end'>): number {
  const dx = wall.end.x - wall.start.x,
    dz = wall.end.z - wall.start.z;
  return ((point.x - wall.start.x) * dx + (point.z - wall.start.z) * dz) / Math.hypot(dx, dz);
}

export interface InputScope {
  modal: boolean;
  text: boolean;
  composing: boolean;
  activeDrag: boolean;
}
export function routeInput(scope: InputScope): 'ui' | 'drag' | 'tool' {
  if (scope.modal || scope.text || scope.composing) {
    return 'ui';
  }
  return scope.activeDrag ? 'drag' : 'tool';
}
export function keyboardIntent(
  key: string,
  modifiers: { control?: boolean; meta?: boolean; shift?: boolean },
  scope: InputScope,
): 'undo' | 'redo' | 'save' | 'delete' | 'cancel' | undefined {
  if (routeInput(scope) === 'ui') {
    return undefined;
  }
  const normal = key.toLowerCase(),
    shortcut = modifiers.control || modifiers.meta;
  if (shortcut && normal === 'z') {
    return modifiers.shift ? 'redo' : 'undo';
  }
  if (shortcut && normal === 'y') {
    return 'redo';
  }
  if (shortcut && normal === 's') {
    return 'save';
  }
  if (normal === 'escape') {
    return 'cancel';
  }
  if (normal === 'delete' || normal === 'backspace') {
    return 'delete';
  }
  return undefined;
}
