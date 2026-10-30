import {
  createId,
  type Command,
  type Opening,
  type ProjectDocument,
  type Slab,
  type Wall,
} from '@building/editor-core';

export type PlanObject = Wall | Slab | Opening;

/** Maps local SVG drafts to the public command contract used by the inspector and runtime. */
export function planObjectCommand(object: PlanObject, create: boolean): Command {
  if ('start' in object) {
    return create
      ? { type: 'add-wall', wall: object }
      : { type: 'update-wall', id: object.id, patch: object };
  }
  if ('polygon' in object) {
    return create
      ? { type: 'add-slab', slab: object }
      : { type: 'update-slab', id: object.id, patch: object };
  }
  return create
    ? { type: 'add-opening', opening: object }
    : { type: 'update-opening', id: object.id, patch: object };
}

/** A wall copy includes its hosted openings atomically; continuity membership is not duplicated. */
export function duplicatePlanObject(
  document: ProjectDocument,
  object: PlanObject,
): { command: Command; id: string } {
  const id = createId('copy');
  if ('start' in object) {
    const wall = {
      ...object,
      id,
      start: { x: object.start.x + 1, z: object.start.z + 1 },
      end: { x: object.end.x + 1, z: object.end.z + 1 },
    };
    return {
      id,
      command: {
        type: 'batch',
        commands: [
          { type: 'add-wall', wall },
          ...document.openings
            .filter((opening) => opening.wallId === object.id)
            .map((opening): Command => ({
              type: 'add-opening',
              opening: { ...opening, id: createId(opening.kind), wallId: id },
            })),
        ],
      },
    };
  }
  if ('polygon' in object) {
    const xs = object.polygon.map((point) => point.x);
    const offset = Math.max(...xs) - Math.min(...xs) + 1;
    return {
      id,
      command: {
        type: 'add-slab',
        slab: { ...object, id, polygon: object.polygon.map((p) => ({ x: p.x + offset, z: p.z })) },
      },
    };
  }
  return {
    id,
    command: {
      type: 'add-opening',
      opening: { ...object, id, offset: object.offset + object.width + 0.2 },
    },
  };
}
