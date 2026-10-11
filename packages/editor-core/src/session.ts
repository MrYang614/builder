import type { ProjectDocument, Vec2, Wall } from './model';
import { freezeDocument } from './immutable';
import { DEFAULT_SNAP_SETTINGS, snapDocumentPoint, type SnapSettings } from './snap';

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
  /** Session-only snapping preference; never serialized into ProjectDocument or history. */
  snap: SnapSettings;
}
/** Owns transient selection, tools and snapping preferences outside project history and persistence. */
export class SessionStore {
  private snapshot: EditorSession;
  private readonly listeners = new Set<() => void>();
  /** Initializes a cached immutable editing session for the caller's active floor. */
  constructor(currentLevelId: string) {
    this.snapshot = freezeDocument({
      currentLevelId,
      tool: 'select',
      wholeBuildingPreview: false,
      hiddenIds: [],
      slabPurpose: 'floor',
      snap: { ...DEFAULT_SNAP_SETTINGS },
    });
  }
  getSnapshot = (): EditorSession => this.snapshot;
  /** Registers session delivery and supplies deterministic listener cleanup. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  /** Publishes changed transient fields without touching formal data or notifying for a no-op. */
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
  /** Repairs the active floor and selection after deletion, undo or project replacement. */
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

/** Legacy result shape retained for existing tool callers during the snapping migration. */
export interface LegacySnapResult {
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
): LegacySnapResult {
  const result = snapDocumentPoint(
    point,
    document,
    {
      ...DEFAULT_SNAP_SETTINGS,
      tolerance: options.tolerance ?? DEFAULT_SNAP_SETTINGS.tolerance,
      gridSize: options.grid ?? DEFAULT_SNAP_SETTINGS.gridSize,
    },
    { levelId, excludeId: options.excludeId },
  );
  let legacy: LegacySnapResult = {
    point: { ...result.point },
    kind: result.kind === 'point' ? 'endpoint' : result.kind === 'line' ? 'edge' : 'grid',
    ...(result.objectId ? { objectId: result.objectId } : {}),
  };
  if (options.orthogonalFrom) {
    const start = options.orthogonalFrom;
    const dx = legacy.point.x - start.x,
      dz = legacy.point.z - start.z;
    legacy = {
      ...legacy,
      point:
        Math.abs(dx) >= Math.abs(dz)
          ? { x: legacy.point.x, z: start.z }
          : { x: start.x, z: legacy.point.z },
    };
  }
  return legacy;
}
/** Projects onto the host axis; placement bounds remain a separate domain validation step. */
export function projectPointToWall(point: Vec2, wall: Pick<Wall, 'start' | 'end'>): Vec2 {
  const dx = wall.end.x - wall.start.x,
    dz = wall.end.z - wall.start.z;
  const squared = dx * dx + dz * dz;
  const t = squared ? ((point.x - wall.start.x) * dx + (point.z - wall.start.z) * dz) / squared : 0;
  return { x: wall.start.x + dx * t, z: wall.start.z + dz * t };
}
/** Measures signed physical distance from the host's stable reference endpoint. */
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
/** Gives modal, text and composing input ownership before any scene gesture can consume it. */
export function routeInput(scope: InputScope): 'ui' | 'drag' | 'tool' {
  if (scope.modal || scope.text || scope.composing) {
    return 'ui';
  }
  return scope.activeDrag ? 'drag' : 'tool';
}
/** Resolves cross-platform editor shortcuts only when the UI does not own keyboard input. */
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
