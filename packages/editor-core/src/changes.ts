import type { ProjectDocument, SurfaceBinding } from './model';
import { wallsConnected } from './validation';

export interface ChangeSet {
  projectId: string;
  revision: number;
  previousRevision: number;
  wallIds: string[];
  slabIds: string[];
  openingIds: string[];
  levelIds: string[];
  resourceIds: string[];
  continuityIds: string[];
  environmentChanged: boolean;
  environmentResourceIds: string[];
  /** All IDs that consumers may need to recreate, including removed objects. */
  affectedIds: string[];
  removedIds: string[];
  full: boolean;
  reason: string;
}
function changedIds<T extends { id: string }>(before: T[], after: T[]): Set<string> {
  const old = new Map(before.map((o) => [o.id, o]));
  const result = new Set<string>();
  for (const object of after) {
    if (old.get(object.id) !== object) {
      result.add(object.id);
    }
    old.delete(object.id);
  }
  for (const objectId of old.keys()) {
    result.add(objectId);
  }
  return result;
}
/** Expands changed identities through hosted objects, connected walls and continuity dependencies. */
export function calculateChangeSet(
  before: ProjectDocument,
  after: ProjectDocument,
  reason: string,
  full = false,
): ChangeSet {
  const walls = changedIds(before.walls, after.walls),
    slabs = changedIds(before.slabs, after.slabs);
  const openings = changedIds(before.openings, after.openings),
    levels = changedIds(before.levels, after.levels);
  const resources = changedIds(before.resources, after.resources),
    continuity = changedIds(before.continuity, after.continuity);
  const environmentResources = changedIds(
    before.environmentResources ?? [],
    after.environmentResources ?? [],
  );
  const environmentChanged =
    full ||
    before.environment !== after.environment ||
    (!!after.environment?.resourceId && environmentResources.has(after.environment.resourceId));
  const allWalls = [...before.walls, ...after.walls];
  for (const o of [...before.openings, ...after.openings]) {
    if (openings.has(o.id)) {
      walls.add(o.wallId);
    }
  }
  for (const w of allWalls) {
    if (levels.has(w.levelId)) {
      walls.add(w.id);
    }
  }
  for (const s of [...before.slabs, ...after.slabs]) {
    if (levels.has(s.levelId)) {
      slabs.add(s.id);
    }
  }
  for (const g of [...before.continuity, ...after.continuity]) {
    if (continuity.has(g.id)) {
      for (const m of g.members) {
        walls.add(m.wallId);
      }
    }
  }
  if (resources.size) {
    const uses = (materials: Record<string, SurfaceBinding> | undefined): boolean =>
      !!materials &&
      Object.values(materials).some((m) => !!m.resourceId && resources.has(m.resourceId));
    for (const w of allWalls) {
      if (uses(w.materials)) {
        walls.add(w.id);
      }
    }
    for (const s of [...before.slabs, ...after.slabs]) {
      if (uses(s.materials)) {
        slabs.add(s.id);
      }
    }
    for (const o of [...before.openings, ...after.openings]) {
      if (uses(o.materials)) {
        openings.add(o.id);
      }
    }
  }
  // Propagate connection and UV dependencies through the touched connected components, never unrelated buildings.
  let grew = walls.size > 0;
  while (grew) {
    grew = false;
    for (const wall of allWalls) {
      if (
        !walls.has(wall.id) &&
        allWalls.some((other) => walls.has(other.id) && wallsConnected(wall, other))
      ) {
        walls.add(wall.id);
        grew = true;
      }
    }
    for (const group of [...before.continuity, ...after.continuity]) {
      if (group.members.some((m) => walls.has(m.wallId))) {
        for (const member of group.members) {
          if (!walls.has(member.wallId)) {
            walls.add(member.wallId);
            grew = true;
          }
        }
      }
    }
  }
  for (const opening of [...before.openings, ...after.openings]) {
    if (walls.has(opening.wallId) || levels.has(opening.levelId)) {
      openings.add(opening.id);
    }
  }
  const affectedIds = [
    ...new Set([
      ...walls,
      ...slabs,
      ...openings,
      ...levels,
      ...resources,
      ...continuity,
      ...environmentResources,
    ]),
  ];
  const afterIds = new Set(
    [
      ...after.walls,
      ...after.slabs,
      ...after.openings,
      ...after.levels,
      ...after.resources,
      ...after.continuity,
      ...(after.environmentResources ?? []),
    ].map((o) => o.id),
  );
  return {
    projectId: after.id,
    revision: after.revision,
    previousRevision: before.revision,
    wallIds: [...walls],
    slabIds: [...slabs],
    openingIds: [...openings],
    levelIds: [...levels],
    resourceIds: [...resources],
    continuityIds: [...continuity],
    environmentChanged,
    environmentResourceIds: [...environmentResources],
    affectedIds,
    removedIds: affectedIds.filter((objectId) => !afterIds.has(objectId)),
    full,
    reason,
  };
}
