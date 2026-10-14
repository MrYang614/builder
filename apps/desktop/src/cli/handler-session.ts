import type { Services } from '../app/services';
import type { ControlRequest } from './protocol';

export type SessionPatchResult =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; message: string };

function isTool(value: unknown): value is string {
  return ['select', 'wall', 'slab', 'door', 'window', 'material'].includes(String(value));
}

function isSurface(value: unknown): value is string {
  return ['A', 'B', 'edge', 'top', 'bottom', 'opening'].includes(String(value));
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validSnapSettings(value: unknown): value is {
  enabled: boolean;
  mode: 'off' | 'points' | 'lines' | 'grid' | 'all';
  tolerance: number;
  gridSize: number;
} {
  if (!isRecordValue(value)) {
    return false;
  }
  return (
    typeof value.enabled === 'boolean' &&
    ['off', 'points', 'lines', 'grid', 'all'].includes(String(value.mode)) &&
    typeof value.tolerance === 'number' &&
    Number.isFinite(value.tolerance) &&
    value.tolerance >= 0 &&
    typeof value.gridSize === 'number' &&
    Number.isFinite(value.gridSize) &&
    value.gridSize > 0
  );
}

function objectOnCurrentLevel(services: Services, id: string): boolean {
  const session = services.session.getSnapshot();
  const document = services.core.getSnapshot();
  return [...document.walls, ...document.slabs, ...document.openings].some(
    (object) => object.id === id && object.levelId === session.currentLevelId,
  );
}

function objectExists(services: Services, id: string): boolean {
  const document = services.core.getSnapshot();
  return [...document.walls, ...document.slabs, ...document.openings].some(
    (object) => object.id === id,
  );
}

/** Validates session-only changes so malformed IDs never enter SessionStore. */
export function sessionPatch(
  request: ControlRequest,
  services: Services,
  args: Record<string, unknown>,
): SessionPatchResult {
  const document = services.core.getSnapshot();
  if (request.operation === 'session.setLevel') {
    if (
      typeof args.levelId !== 'string' ||
      !document.levels.some((level) => level.id === args.levelId)
    ) {
      return { ok: false, message: 'session.setLevel requires an existing levelId' };
    }
    return {
      ok: true,
      patch: { currentLevelId: args.levelId, selectedId: undefined, selectedSurface: undefined },
    };
  }
  if (request.operation === 'session.setTool') {
    return isTool(args.tool)
      ? { ok: true, patch: { tool: args.tool } }
      : { ok: false, message: 'session.setTool requires a supported tool' };
  }
  if (request.operation === 'session.select') {
    if (args.id === null || args.id === undefined) {
      return { ok: true, patch: { selectedId: undefined, selectedSurface: undefined } };
    }
    if (typeof args.id !== 'string' || !objectOnCurrentLevel(services, args.id)) {
      return { ok: false, message: 'session.select requires an object on the current level' };
    }
    if (args.surface !== undefined && !isSurface(args.surface)) {
      return { ok: false, message: 'session.select surface is invalid' };
    }
    return {
      ok: true,
      patch: { selectedId: args.id, ...(args.surface ? { selectedSurface: args.surface } : {}) },
    };
  }
  if (request.operation === 'session.setHidden') {
    if (
      !Array.isArray(args.ids) ||
      args.ids.some((id) => typeof id !== 'string' || !objectExists(services, id))
    ) {
      return { ok: false, message: 'session.setHidden requires existing object IDs' };
    }
    return { ok: true, patch: { hiddenIds: args.ids } };
  }
  if (request.operation === 'session.setWholeBuildingPreview') {
    return typeof args.enabled === 'boolean'
      ? { ok: true, patch: { wholeBuildingPreview: args.enabled } }
      : { ok: false, message: 'session.setWholeBuildingPreview requires boolean enabled' };
  }
  if (request.operation === 'session.setSnapSettings') {
    return validSnapSettings(args.settings)
      ? { ok: true, patch: { snap: args.settings } }
      : { ok: false, message: 'session.setSnapSettings requires valid snap settings' };
  }
  return { ok: true, patch: {} };
}
