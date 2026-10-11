import type {
  Level,
  EnvironmentSettings,
  EnvironmentResource,
  Opening,
  ProjectDocument,
  Resource,
  Slab,
  SurfaceBinding,
  TextureContinuity,
  Wall,
} from './model';
import { EPSILON, samePoint } from './validation';
import type { DomainError } from './validation';
import { propagateWallEndpoints } from './topology';

export type Command =
  | { type: 'add-wall'; wall: Wall }
  | { type: 'update-wall'; id: string; patch: Partial<Omit<Wall, 'id'>> }
  | { type: 'delete-wall'; id: string }
  | { type: 'add-slab'; slab: Slab }
  | { type: 'update-slab'; id: string; patch: Partial<Omit<Slab, 'id'>> }
  | { type: 'delete-slab'; id: string }
  | { type: 'add-opening'; opening: Opening }
  | { type: 'update-opening'; id: string; patch: Partial<Omit<Opening, 'id'>> }
  | { type: 'delete-opening'; id: string }
  | { type: 'add-level'; level: Level }
  | { type: 'update-level'; id: string; patch: Partial<Omit<Level, 'id'>>; moveAbove?: boolean }
  | { type: 'delete-level'; id: string }
  | {
      type: 'set-material';
      objectId: string;
      side: 'A' | 'B' | 'edge' | 'top' | 'bottom';
      binding: SurfaceBinding;
      applyContinuity?: boolean;
    }
  | { type: 'add-resource'; resource: Resource }
  | { type: 'delete-resource'; id: string }
  | { type: 'set-environment'; environment: EnvironmentSettings }
  | { type: 'add-environment-resource'; resource: EnvironmentResource }
  | { type: 'delete-environment-resource'; id: string }
  | { type: 'set-continuity'; group: TextureContinuity }
  | { type: 'delete-continuity'; id: string }
  | { type: 'rename-project'; name: string }
  | { type: 'batch'; commands: Command[]; label?: string };

function removeContinuity(document: ProjectDocument, ids: Set<string>): TextureContinuity[] {
  return document.continuity.flatMap((group) => {
    const members = group.members.filter((member) => !ids.has(member.wallId));
    if (!members.length) {
      return [];
    }
    if (members.length === group.members.length) {
      return [group];
    }
    const anchor = ids.has(group.anchor.wallId)
      ? { wallId: members[0]!.wallId, side: members[0]!.side, endpoint: 'start' as const }
      : group.anchor;
    const seam = group.seam && !ids.has(group.seam.wallId) ? group.seam : undefined;
    return [{ ...group, members, anchor, seam }];
  });
}
/** Builds an uninstalled candidate; batch validation and history remain the EditorCore owner's job. */
export function applyCommand(
  document: ProjectDocument,
  command: Command,
): ProjectDocument | DomainError {
  const find = <T extends { id: string }>(items: T[], objectId: string): T | DomainError =>
    items.find((item) => item.id === objectId) ?? {
      code: 'object.missing',
      params: { id: objectId },
    };
  const missing = (value: object): value is DomainError => 'code' in value;
  switch (command.type) {
    case 'batch': {
      let current = document;
      for (const nested of command.commands) {
        const result = applyCommand(current, nested);
        if ('code' in result) {
          return result;
        }
        current = result;
      }
      return current;
    }
    case 'add-wall':
      return { ...document, walls: [...document.walls, command.wall] };
    case 'update-wall': {
      const old = find(document.walls, command.id);
      if (missing(old)) {
        return old;
      }
      const patch = { ...command.patch };
      // Exchanging endpoint array order is not a physical edit and must not exchange A/B or door offsets.
      if (
        patch.start &&
        patch.end &&
        samePoint(patch.start, old.end) &&
        samePoint(patch.end, old.start)
      ) {
        patch.start = old.start;
        patch.end = old.end;
      }
      const connected = propagateWallEndpoints(document.walls, old, patch);
      if (!Array.isArray(connected)) {
        return connected;
      }
      const propagated = connected.find((wall) => wall.id === old.id)!;
      const next = {
        ...propagated,
        ...patch,
        start: propagated.start,
        end: propagated.end,
        id: old.id,
      };
      if (patch.levelId && patch.levelId !== old.levelId) {
        next.start = patch.start ?? old.start;
        next.end = patch.end ?? old.end;
      }
      const openings =
        patch.levelId && patch.levelId !== old.levelId
          ? document.openings.map((o) =>
              o.wallId === old.id ? { ...o, levelId: patch.levelId! } : o,
            )
          : document.openings;
      return { ...document, walls: connected.map((w) => (w.id === old.id ? next : w)), openings };
    }
    case 'delete-wall': {
      const old = find(document.walls, command.id);
      if (missing(old)) {
        return old;
      }
      return {
        ...document,
        walls: document.walls.filter((w) => w.id !== command.id),
        openings: document.openings.filter((o) => o.wallId !== command.id),
        continuity: removeContinuity(document, new Set([command.id])),
      };
    }
    case 'add-slab':
      return { ...document, slabs: [...document.slabs, command.slab] };
    case 'update-slab': {
      const old = find(document.slabs, command.id);
      if (missing(old)) {
        return old;
      }
      return {
        ...document,
        slabs: document.slabs.map((s) =>
          s.id === command.id ? { ...old, ...command.patch, id: old.id } : s,
        ),
      };
    }
    case 'delete-slab': {
      const old = find(document.slabs, command.id);
      if (missing(old)) {
        return old;
      }
      return { ...document, slabs: document.slabs.filter((s) => s.id !== command.id) };
    }
    case 'add-opening':
      return { ...document, openings: [...document.openings, command.opening] };
    case 'update-opening': {
      const old = find(document.openings, command.id);
      if (missing(old)) {
        return old;
      }
      return {
        ...document,
        openings: document.openings.map((o) =>
          o.id === command.id ? { ...old, ...command.patch, id: old.id } : o,
        ),
      };
    }
    case 'delete-opening': {
      const old = find(document.openings, command.id);
      if (missing(old)) {
        return old;
      }
      return { ...document, openings: document.openings.filter((o) => o.id !== command.id) };
    }
    case 'add-level':
      return { ...document, levels: [...document.levels, command.level] };
    case 'update-level': {
      const old = find(document.levels, command.id);
      if (missing(old)) {
        return old;
      }
      const updated = { ...old, ...command.patch, id: old.id };
      const delta = command.moveAbove ? updated.height - old.height : 0;
      const movedIds = new Set(
        document.levels.filter((l) => l.elevation > old.elevation + EPSILON).map((l) => l.id),
      );
      const elevationDelta = updated.elevation - old.elevation;
      const levels = document.levels.map((l) =>
        l.id === old.id
          ? updated
          : movedIds.has(l.id) && delta
            ? { ...l, elevation: l.elevation + delta }
            : l,
      );
      const slabs = document.slabs.map((s) => {
        const move = s.levelId === old.id ? elevationDelta : movedIds.has(s.levelId) ? delta : 0;
        return move ? { ...s, elevation: s.elevation + move } : s;
      });
      return { ...document, levels, slabs };
    }
    case 'delete-level': {
      const old = find(document.levels, command.id);
      if (missing(old)) {
        return old;
      }
      if (document.levels.length === 1) {
        return { code: 'level.lastRequired' };
      }
      const deletedWalls = new Set(
        document.walls.filter((w) => w.levelId === command.id).map((w) => w.id),
      );
      return {
        ...document,
        levels: document.levels.filter((l) => l.id !== command.id),
        walls: document.walls.filter((w) => w.levelId !== command.id),
        slabs: document.slabs.filter((s) => s.levelId !== command.id),
        openings: document.openings.filter((o) => o.levelId !== command.id),
        continuity: removeContinuity(document, deletedWalls),
      };
    }
    case 'set-material': {
      const wall = document.walls.find((w) => w.id === command.objectId);
      if (wall && ['A', 'B', 'edge'].includes(command.side)) {
        const updates = new Map<string, Set<string>>([[wall.id, new Set([command.side])]]);
        if (command.applyContinuity) {
          for (const group of document.continuity) {
            if (group.members.some((m) => m.wallId === wall.id && m.side === command.side)) {
              for (const m of group.members) {
                const set = updates.get(m.wallId) ?? new Set<string>();
                set.add(m.side);
                updates.set(m.wallId, set);
              }
            }
          }
        }
        return {
          ...document,
          walls: document.walls.map((w) => {
            const sides = updates.get(w.id);
            if (!sides) {
              return w;
            }
            const materials = { ...w.materials };
            for (const side of sides) {
              materials[side as keyof Wall['materials']] = command.binding;
            }
            return { ...w, materials };
          }),
        };
      }
      const slab = document.slabs.find((s) => s.id === command.objectId);
      if (slab && ['top', 'bottom', 'edge'].includes(command.side)) {
        return {
          ...document,
          slabs: document.slabs.map((s) =>
            s.id === slab.id
              ? { ...s, materials: { ...s.materials, [command.side]: command.binding } }
              : s,
          ),
        };
      }
      const opening = document.openings.find((o) => o.id === command.objectId);
      if (opening?.materials && ['A', 'B', 'edge'].includes(command.side)) {
        return {
          ...document,
          openings: document.openings.map((o) =>
            o.id === opening.id
              ? { ...o, materials: { ...opening.materials!, [command.side]: command.binding } }
              : o,
          ),
        };
      }
      return {
        code: 'material.invalidSurface',
        params: { id: command.objectId, side: command.side },
      };
    }
    case 'add-resource':
      return { ...document, resources: [...document.resources, command.resource] };
    case 'set-environment':
      return { ...document, environment: command.environment };
    case 'add-environment-resource':
      return {
        ...document,
        environmentResources: [...(document.environmentResources ?? []), command.resource],
      };
    case 'delete-environment-resource': {
      const old = find(document.environmentResources ?? [], command.id);
      if (missing(old)) {
        return old;
      }
      if (document.environment?.resourceId === command.id) {
        return { code: 'environment.resourceInUse', params: { id: command.id } };
      }
      return {
        ...document,
        environmentResources: document.environmentResources!.filter(
          (resource) => resource.id !== command.id,
        ),
      };
    }
    case 'delete-resource': {
      const old = find(document.resources, command.id);
      if (missing(old)) {
        return old;
      }
      return { ...document, resources: document.resources.filter((r) => r.id !== command.id) };
    }
    case 'set-continuity':
      return {
        ...document,
        continuity: [
          ...document.continuity.filter((g) => g.id !== command.group.id),
          command.group,
        ],
      };
    case 'delete-continuity': {
      const old = find(document.continuity, command.id);
      if (missing(old)) {
        return old;
      }
      return { ...document, continuity: document.continuity.filter((g) => g.id !== command.id) };
    }
    case 'rename-project':
      return { ...document, name: command.name };
    default:
      return { code: 'command.unsupported' };
  }
}
