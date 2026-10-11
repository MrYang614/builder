import * as THREE from 'three';
import { runResourceCleanup } from './resource-cleanup';

/** Frees helpers' private buffers/materials; formal meshes must dispose through BuiltObject. */
export function disposeHelpers(group: THREE.Group): void {
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  group.traverse((object) => {
    if (
      object instanceof THREE.Mesh ||
      object instanceof THREE.LineSegments ||
      object instanceof THREE.Line
    ) {
      resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        resources.add(material);
      }
    }
  });
  group.clear();
  runResourceCleanup([...resources].map((resource) => () => resource.dispose()));
}
