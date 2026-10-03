import type { ProjectDocument } from '@building/editor-core';

/** Query the exact cascade before displaying the destructive confirmation. */
export function deletionContents(doc: ProjectDocument, id: string) {
  const level = doc.levels.some((item) => item.id === id);
  const walls = doc.walls.filter((item) => (level ? item.levelId === id : item.id === id));
  const wallIds = new Set(walls.map((item) => item.id));
  return {
    walls: walls.length,
    slabs: doc.slabs.filter((item) => (level ? item.levelId === id : item.id === id)).length,
    openings: doc.openings.filter((item) =>
      level ? item.levelId === id : item.id === id || wallIds.has(item.wallId),
    ).length,
  };
}
