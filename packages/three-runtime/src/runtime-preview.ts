import * as THREE from 'three';
import { wallLength, type Command, type PreviewResult } from '@building/editor-core';
import type { ObjectData, RuntimeOptions, ViewportTheme } from './runtime-contracts';
import type { RuntimeSnapping } from './snapping';
import { runResourceCleanup } from './resource-cleanup';

type PreviewOptions = Pick<
  RuntimeOptions,
  'getDocument' | 'beginPreview' | 'preview' | 'cancelPreview' | 'status'
>;

/** Owns one transient draft mesh and Core preview token; it never commits formal commands. */
export class RuntimePreview {
  readonly mesh: THREE.Mesh;
  objectId: string | null = null;
  private token: string | null = null;
  private revision = -1;
  private valid = true;
  private error = '';
  private disposed = false;

  constructor(
    private readonly options: PreviewOptions,
    auxiliary: THREE.Group,
    private theme: ViewportTheme,
    private readonly snapping: RuntimeSnapping,
  ) {
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        color: theme.preview,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      }),
    );
    this.mesh.visible = false;
    auxiliary.add(this.mesh);
  }

  /** Validates against one retained revision; a changed revision starts a fresh preview token. */
  check(command: Command): PreviewResult {
    const revision = this.options.getDocument().revision;
    if (this.revision !== revision) {
      this.clearTransaction();
    }
    if (!this.token) {
      this.token = this.options.beginPreview();
      this.revision = revision;
    }
    return this.options.preview(this.token, command);
  }

  /** Displays exactly the candidate validated by Core and reports only changed draft errors. */
  show(data: ObjectData, command: Command): PreviewResult {
    const document = this.options.getDocument();
    const level = document.levels.find((candidate) => candidate.id === data.levelId)!;
    const result = this.check(command);
    this.valid = result.ok;
    const error = result.ok ? '' : result.error.code;
    if (error && error !== this.error) {
      const params = Object.fromEntries(
        Object.entries(result.ok ? {} : (result.error.params ?? {})).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.join(', ') : value,
        ]),
      );
      this.options.status(error, params);
    }
    if (result.ok && this.error) {
      this.snapping.restoreFeedback();
      this.options.status(
        command.type.startsWith('update-')
          ? 'hintSelect'
          : 'start' in data
            ? 'hint.end'
            : 'polygon' in data
              ? 'hint.slabEnd'
              : 'hintPlace',
      );
    }
    this.error = error;
    (this.mesh.material as THREE.MeshBasicMaterial).color.set(
      result.ok ? this.theme.preview : this.theme.invalid,
    );
    if ('start' in data) {
      const length = wallLength(data);
      this.mesh.scale.set(length, data.height, data.thickness);
      this.mesh.position.set(
        (data.start.x + data.end.x) / 2,
        level.elevation + data.height / 2,
        (data.start.z + data.end.z) / 2,
      );
      this.mesh.rotation.y = -Math.atan2(data.end.z - data.start.z, data.end.x - data.start.x);
      this.snapping.setDimensions(`${length.toFixed(2)} m`);
    } else if ('polygon' in data) {
      const xs = data.polygon.map((point) => point.x);
      const zs = data.polygon.map((point) => point.z);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const z0 = Math.min(...zs);
      const z1 = Math.max(...zs);
      this.mesh.scale.set(x1 - x0, data.thickness, z1 - z0);
      this.mesh.position.set((x0 + x1) / 2, data.elevation - data.thickness / 2, (z0 + z1) / 2);
      this.mesh.rotation.y = 0;
      this.snapping.setDimensions(`${(x1 - x0).toFixed(2)} × ${(z1 - z0).toFixed(2)} m`);
    } else {
      const wall = document.walls.find((candidate) => candidate.id === data.wallId);
      if (!wall) {
        this.mesh.visible = false;
        return result;
      }
      const length = wallLength(wall);
      const t = (data.offset + data.width / 2) / length;
      this.mesh.scale.set(data.width, data.height, wall.thickness + 0.04);
      this.mesh.position.set(
        wall.start.x + (wall.end.x - wall.start.x) * t,
        level.elevation + data.sill + data.height / 2,
        wall.start.z + (wall.end.z - wall.start.z) * t,
      );
      this.mesh.rotation.y = -Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x);
      this.snapping.setDimensions(`${data.width.toFixed(2)} × ${data.height.toFixed(2)} m`);
    }
    this.mesh.visible = true;
    return result;
  }

  /** Cancels the retained Core transaction before a command, gesture reset or disposal. */
  clearTransaction(): void {
    if (this.token) {
      this.options.cancelPreview(this.token);
    }
    this.token = null;
    this.revision = -1;
    this.snapping.setDimensions('');
    this.error = '';
  }

  /** Removes all transient drafting state without changing the formal document. */
  clear(): void {
    this.clearTransaction();
    this.objectId = null;
    this.mesh.visible = false;
  }

  /** Applies semantic preview colors while retaining the current validation state. */
  setTheme(theme: ViewportTheme): void {
    this.theme = theme;
    (this.mesh.material as THREE.MeshBasicMaterial).color.set(
      this.valid ? theme.preview : theme.invalid,
    );
  }

  diagnostics() {
    return { visible: this.mesh.visible, valid: this.valid, error: this.error };
  }

  /** Releases the preview transaction and its sole mesh allocation exactly once. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    runResourceCleanup([
      () => this.clear(),
      () => this.mesh.removeFromParent(),
      () => this.mesh.geometry.dispose(),
      () => (this.mesh.material as THREE.Material).dispose(),
    ]);
  }
}
