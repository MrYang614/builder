import * as THREE from 'three';
import type { ToolState, Vec2 } from '@building/editor-core';
import type { RuntimeOptions } from './runtime-contracts';
import { objectsOf } from './runtime-contracts';
import type { SnapAxisConstraint } from './drag-anchor';
import type { RuntimeSnapping } from './snapping';
import { updatePointerRay } from './viewport-decorations';

export interface GroundOptions {
  elevation?: number;
  applySnap?: boolean;
  raw?: Vec2;
  excludeId?: string;
  pointerOffset?: Vec2;
  constraint?: SnapAxisConstraint;
  toolState?: ToolState;
}
export interface RuntimePick {
  id: string;
  point: THREE.Vector3;
  role: string;
}
export interface RuntimeHandlePick {
  endpoint?: 'start' | 'end';
  corner?: number;
}
export interface PickingHooks extends Pick<RuntimeOptions, 'getDocument' | 'getSession'> {
  getCanvas(): HTMLCanvasElement;
  roots(): readonly THREE.Object3D[];
  handles(): readonly THREE.Object3D[];
  invalidateHistory(): void;
}

/** Retains one ray and pointer; only formal roots and explicitly supplied handles are pickable. */
export class RuntimePicking {
  private readonly ray = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();

  constructor(
    private readonly camera: THREE.Camera,
    private readonly hooks: PickingHooks,
    private readonly snapping: RuntimeSnapping,
  ) {
    this.ray.firstHitOnly = true;
  }

  private update(event: PointerEvent): void {
    updatePointerRay(event, this.hooks.getCanvas(), this.pointer, this.camera, this.ray);
  }

  /** Projects once and returns the same resolved snap point consumed by preview and commit. */
  ground(event: PointerEvent, options: GroundOptions = {}): Vec2 | null {
    this.hooks.invalidateHistory();
    this.update(event);
    return this.snapping.ground(
      event,
      this.ray,
      this.hooks.getDocument(),
      this.hooks.getSession(),
      options.elevation,
      options.excludeId,
      options.applySnap ?? true,
      options.raw,
      options.pointerOffset,
      options.constraint,
      options.toolState,
    );
  }

  /** Resolves a stable formal ID and surface role from supplied current-level roots. */
  pick(event: PointerEvent): RuntimePick | null {
    this.update(event);
    const candidates = this.hooks.roots();
    for (const candidate of candidates) {
      candidate.updateWorldMatrix(true, true);
    }
    const hit = this.ray.intersectObjects([...candidates], true)[0];
    if (!hit) {
      return null;
    }
    let object: THREE.Object3D | null = hit.object;
    while (object && !object.userData.objectId) {
      object = object.parent;
    }
    const id = object?.userData.objectId as string | undefined;
    if (!id) {
      return null;
    }
    let role = 'A';
    if (hit.object instanceof THREE.Mesh && hit.face) {
      const roles = hit.object.userData.surfaceRoles as string[] | undefined;
      role = roles?.[hit.face.materialIndex] ?? ['A', 'B', 'edge'][hit.face.materialIndex] ?? 'A';
    }
    const data = objectsOf(this.hooks.getDocument()).find((candidate) => candidate.id === id);
    if (data && 'start' in data && ['top', 'bottom', 'reveal'].includes(role)) {
      role = 'edge';
    }
    return { id, point: hit.point, role };
  }

  /** Picks selection handles separately, preventing them from entering formal object raycasts. */
  pickHandle(event: PointerEvent): RuntimeHandlePick | null {
    this.update(event);
    const handles = this.hooks.handles();
    for (const handle of handles) {
      handle.updateWorldMatrix(true, true);
    }
    const hit = this.ray.intersectObjects([...handles])[0];
    return hit
      ? { endpoint: hit.object.userData.endpoint, corner: hit.object.userData.corner }
      : null;
  }
}
