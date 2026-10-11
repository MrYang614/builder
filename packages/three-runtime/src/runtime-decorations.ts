import * as THREE from 'three';
import { createViewportGrid } from './viewport-decorations';
import type { ViewportTheme } from './runtime-contracts';
import { disposeHelpers } from './runtime-helpers';
import { runResourceCleanup } from './resource-cleanup';

/** Owns static lighting, grid and the snap marker borrowed by feedback, separate from formal geometry. */
export class RuntimeDecorations {
  readonly auxiliary = new THREE.Group();
  readonly snapMark: THREE.Mesh;
  private grid: THREE.GridHelper;
  private readonly lights: THREE.Light[];
  private disposed = false;

  constructor(scene: THREE.Scene, theme: ViewportTheme) {
    scene.add(this.auxiliary);
    const ambient = new THREE.HemisphereLight(0xe9f2ff, 0x35404d, 1.45);
    const light = new THREE.DirectionalLight(0xffffff, 2.4);
    light.position.set(8, 12, 6);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 80;
    light.shadow.camera.left = -24;
    light.shadow.camera.right = 24;
    light.shadow.camera.top = 24;
    light.shadow.camera.bottom = -24;
    const fill = new THREE.DirectionalLight(0xa9c8e8, 0.7);
    fill.position.set(-10, 6, -8);
    this.lights = [ambient, light, fill];
    scene.add(...this.lights);
    this.grid = createViewportGrid(theme);
    this.snapMark = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 12, 8),
      new THREE.MeshBasicMaterial({ color: theme.snap, depthTest: false }),
    );
    this.snapMark.visible = false;
    this.auxiliary.add(this.grid, this.snapMark);
  }

  setElevation(elevation: number): void {
    this.grid.position.y = elevation - 0.005;
  }

  /** Replaces grid allocations once per theme change while preserving the active editing elevation. */
  setTheme(theme: ViewportTheme): void {
    const old = this.grid;
    this.grid = createViewportGrid(theme);
    this.grid.position.copy(old.position);
    this.auxiliary.remove(old);
    old.geometry.dispose();
    (Array.isArray(old.material) ? old.material : [old.material]).forEach((material) =>
      material.dispose(),
    );
    this.auxiliary.add(this.grid);
  }

  /** Runs after dynamic helper owners have detached, freeing only the remaining static helpers. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    runResourceCleanup([
      () => disposeHelpers(this.auxiliary),
      () => this.auxiliary.removeFromParent(),
      ...this.lights.flatMap((light) => [
        () => {
          if (light instanceof THREE.DirectionalLight) {
            light.shadow.dispose();
          }
        },
        () => light.removeFromParent(),
      ]),
    ]);
  }
}
