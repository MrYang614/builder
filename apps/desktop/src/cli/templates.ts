import { createCourtyardProject, createEmptyProject } from '@building/editor-core';
import { builtInResources } from '../app/materials';

/** Creates the CLI courtyard template with embedded built-in materials and stable face roles. */
export function createProjectTemplate(name: string, template: unknown) {
  if (template !== 'courtyard') {
    return createEmptyProject(name);
  }
  const document = createCourtyardProject(name);
  document.resources = builtInResources.map((resource) => ({ ...resource }));
  for (const wall of document.walls) {
    wall.materials.A.resourceId = 'builtin_plaster';
    wall.materials.B.resourceId = 'builtin_brick';
  }
  for (const slab of document.slabs) {
    slab.materials.top.resourceId = slab.id.includes('roof')
      ? 'builtin_tile'
      : slab.id.includes('courtyard')
        ? 'builtin_tile'
        : 'builtin_wood';
  }
  for (const opening of document.openings) {
    if (opening.kind === 'door' && opening.materials) {
      opening.materials.A.resourceId = 'builtin_wood';
      opening.materials.B.resourceId = 'builtin_wood';
    }
  }
  return document;
}
