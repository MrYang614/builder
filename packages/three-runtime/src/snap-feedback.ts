import * as THREE from 'three';
import type { SnapResult } from '@building/editor-core';
import { runResourceCleanup } from './resource-cleanup';

/** Owns the finite target line; the supplied point marker remains owned by the runtime. */
export class SnapFeedback {
  private readonly geometry = new THREE.BufferGeometry();
  private readonly positions = new THREE.Float32BufferAttribute(new Float32Array(12), 3);
  private readonly material: THREE.MeshBasicMaterial;
  private readonly line: THREE.Mesh;
  private disposed = false;

  constructor(
    private readonly auxiliary: THREE.Group,
    private readonly marker: THREE.Mesh,
    color: string,
  ) {
    this.geometry.setAttribute('position', this.positions);
    this.geometry.setIndex([0, 1, 2, 0, 2, 3]);
    this.material = new THREE.MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.line = new THREE.Mesh(this.geometry, this.material);
    this.line.name = 'snap-target-segment';
    this.line.frustumCulled = false;
    this.line.renderOrder = 23;
    this.line.visible = false;
    this.marker.renderOrder = 24;
    this.auxiliary.add(this.line);
  }

  /** Updates the same marker and line for preview and commit coordinates without GPU allocation. */
  update(result: SnapResult, elevation: number): void {
    if (this.disposed) {
      return;
    }
    this.marker.visible = result.kind !== 'raw';
    this.line.visible = false;
    if (!this.marker.visible) {
      return;
    }
    const y = elevation + 0.045;
    this.marker.position.set(result.point.x, y, result.point.z);
    const segment = result.segment;
    if (!segment || result.kind !== 'line') {
      return;
    }
    const { start, end } = segment;
    if (start.x === end.x && start.z === end.z) {
      return;
    }
    // A narrow native mesh remains visible through raster post effects on both renderer backends.
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const width = 0.03 / Math.hypot(dx, dz);
    const nx = -dz * width;
    const nz = dx * width;
    this.positions.setXYZ(0, start.x + nx, y, start.z + nz);
    this.positions.setXYZ(1, start.x - nx, y, start.z - nz);
    this.positions.setXYZ(2, end.x - nx, y, end.z - nz);
    this.positions.setXYZ(3, end.x + nx, y, end.z + nz);
    this.positions.needsUpdate = true;
    this.line.visible = true;
  }

  /** Clears transient feedback when interaction, focus, scene, or render mode changes. */
  clear(): void {
    this.marker.visible = false;
    this.line.visible = false;
  }

  /** Applies the semantic snap color to both feedback shapes. */
  setTheme(color: string): void {
    if (this.disposed) {
      return;
    }
    this.material.color.set(color);
    const materials = Array.isArray(this.marker.material)
      ? this.marker.material
      : [this.marker.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshBasicMaterial) {
        material.color.set(color);
      }
    }
  }

  /** Releases the line once; runtime disposal continues to own the borrowed point marker. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.clear();
    this.disposed = true;
    runResourceCleanup([
      () => this.auxiliary.remove(this.line),
      () => this.geometry.dispose(),
      () => this.material.dispose(),
    ]);
  }
}
