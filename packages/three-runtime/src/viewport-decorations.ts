import * as THREE from 'three';
import type { ViewportTheme } from './runtime-contracts';

/** Creates a subdued editor grid so construction guides stay behind the model visually. */
export function createViewportGrid(theme: ViewportTheme): THREE.GridHelper {
  const grid = new THREE.GridHelper(100, 100, theme.axis, theme.grid);
  const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
  materials.forEach((material) => {
    material.transparent = true;
    material.opacity = 0.38;
    material.depthWrite = false;
    material.needsUpdate = true;
  });
  return grid;
}

/** Updates the shared pointer ray from a canvas event without allocating per pointer move. */
export function updatePointerRay(
  event: PointerEvent,
  element: HTMLElement,
  pointer: THREE.Vector2,
  camera: THREE.Camera,
  ray: THREE.Raycaster,
): void {
  const rect = element.getBoundingClientRect();
  pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    (-(event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  camera.updateMatrixWorld(true);
  ray.setFromCamera(pointer, camera);
}
