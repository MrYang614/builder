import type { ProjectDocument } from './model';
import type { DomainError } from './validation';
import { EPSILON } from './validation';

export type DomainWarning = DomainError;
/** Parametric editor contact diagnostics; this is not an engineering or structural assessment. */
export function documentWarnings(document: ProjectDocument): DomainWarning[] {
  const warnings: DomainWarning[] = [];
  for (const wall of document.walls) {
    const elevation = document.levels.find((level) => level.id === wall.levelId)!.elevation;
    const vertical = Math.abs(wall.end.x - wall.start.x) < EPSILON;
    const minX = Math.min(wall.start.x, wall.end.x) - (vertical ? wall.thickness / 2 : 0);
    const maxX = Math.max(wall.start.x, wall.end.x) + (vertical ? wall.thickness / 2 : 0);
    const minZ = Math.min(wall.start.z, wall.end.z) - (vertical ? 0 : wall.thickness / 2);
    const maxZ = Math.max(wall.start.z, wall.end.z) + (vertical ? 0 : wall.thickness / 2);
    for (const slab of document.slabs) {
      const penetration =
        Math.min(elevation + wall.height, slab.elevation) -
        Math.max(elevation, slab.elevation - slab.thickness);
      if (penetration <= EPSILON) {
        continue;
      }
      const xs = slab.polygon.map((vertex) => vertex.x),
        zs = slab.polygon.map((vertex) => vertex.z);
      if (
        Math.min(maxX, Math.max(...xs)) - Math.max(minX, Math.min(...xs)) <= EPSILON ||
        Math.min(maxZ, Math.max(...zs)) - Math.max(minZ, Math.min(...zs)) <= EPSILON
      ) {
        continue;
      }
      warnings.push({
        code: 'geometry.wallSlabIntersection',
        params: { wallId: wall.id, slabId: slab.id, penetration: Number(penetration.toFixed(4)) },
      });
    }
  }
  return warnings;
}
export function deletionImpact(
  document: ProjectDocument,
  objectId: string,
): { walls: string[]; slabs: string[]; openings: string[] } {
  const level = document.levels.find((candidate) => candidate.id === objectId);
  const walls = document.walls
    .filter((wall) => wall.id === objectId || wall.levelId === level?.id)
    .map((wall) => wall.id);
  return {
    walls,
    slabs: document.slabs
      .filter((slab) => slab.id === objectId || slab.levelId === level?.id)
      .map((slab) => slab.id),
    openings: document.openings
      .filter(
        (opening) =>
          opening.id === objectId ||
          opening.levelId === level?.id ||
          walls.includes(opening.wallId),
      )
      .map((opening) => opening.id),
  };
}
