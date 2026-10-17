import { BrickWall, DoorOpen, House, Layers, PanelTop } from 'lucide-react';
import type { Opening, Slab, Wall } from '@building/editor-core';

/** Gives scene rows and the inspector the same truthful type label and silhouette. */
export function sceneObjectPresentation(object: Wall | Slab | Opening) {
  if ('start' in object) {
    return { label: 'wall', icon: BrickWall };
  }
  if ('polygon' in object) {
    return object.purpose === 'roof'
      ? { label: 'roof', icon: House }
      : { label: 'slab', icon: Layers };
  }
  return object.kind === 'door'
    ? { label: 'door', icon: DoorOpen }
    : { label: 'window', icon: PanelTop };
}
