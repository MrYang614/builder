import brick from '../assets/brick.png?inline';
import plaster from '../assets/plaster.png?inline';
import wood from '../assets/wood.png?inline';
import tile from '../assets/tile.png?inline';
import type { Resource } from '@building/editor-core';
export const builtInResources: Resource[] = [
  ['brick', brick],
  ['plaster', plaster],
  ['wood', wood],
  ['tile', tile],
].map(([name, dataUrl]) => ({ id: `builtin_${name}`, name, mime: 'image/png', dataUrl }));

/** Resolves a project or built-in material without taking ownership of its data URL. */
export function findMaterialResource(resources: Resource[], resourceId?: string) {
  return resourceId
    ? (resources.find((resource) => resource.id === resourceId) ??
        builtInResources.find((resource) => resource.id === resourceId))
    : undefined;
}
