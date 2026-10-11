import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  createOpening,
  createSlab,
  createWall,
  ToolStateMachine,
  wallOffset,
  type ChangeSet,
  type ProjectDocument,
  type Vec2,
  type Wall,
} from '@building/editor-core';
import {
  addCommand,
  objectsOf,
  updateCommand,
  type ObjectData,
  type RuntimeOptions,
  type Tool,
} from './runtime-contracts';
import { dragAnchor, type DragAnchor } from './drag-anchor';
import { dragGeometry } from './drag-geometry';
import type { RuntimePicking } from './runtime-picking';
import type { RuntimePreview } from './runtime-preview';
import type { RuntimeSnapping } from './snapping';

type Drag = DragAnchor & {
  id: string;
  initial: ObjectData;
  draft: ObjectData;
  endpoint?: 'start' | 'end';
  corner?: number;
  elevation: number;
  projectId: string;
  revision: number;
};
export interface InteractionHooks extends Pick<
  RuntimeOptions,
  'getDocument' | 'getSession' | 'command' | 'select' | 'activateTool' | 'status'
> {
  getCanvas(): HTMLCanvasElement;
  controls: Pick<OrbitControls, 'enabled' | 'mouseButtons'>;
  invalidate(): void;
  invalidateHistory(): void;
}

/** Owns complete pointer gestures, capture and tool transitions; drafts commit only on release. */
export class RuntimeInteraction {
  private readonly tools = new ToolStateMachine();
  private drag: Drag | null = null;
  private pointerId: number | null = null;
  private readonly cameraPointers = new Set<number>();
  private activeTool: Tool = 'select';
  private activeLevel = '';
  private projectId: string;
  private canvasUnsubscribers: (() => void)[] = [];
  private disposed = false;

  constructor(
    private readonly hooks: InteractionHooks,
    private readonly preview: RuntimePreview,
    private readonly picking: RuntimePicking,
    private readonly snapping: RuntimeSnapping,
  ) {
    this.projectId = hooks.getDocument().id;
    window.addEventListener('blur', this.blur);
  }

  /** Rebinds one canvas after renderer changes, removing every previous canvas listener. */
  bindCanvas(): void {
    this.canvasUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.canvasUnsubscribers = [];
    const canvas = this.hooks.getCanvas();
    const listen = (event: string, listener: EventListener) => {
      canvas.addEventListener(event, listener);
      this.canvasUnsubscribers.push(() => canvas.removeEventListener(event, listener));
    };
    listen('pointerdown', this.down as EventListener);
    listen('pointermove', this.move as EventListener);
    listen('pointerup', this.up as EventListener);
    listen('pointercancel', this.pointerCancelled as EventListener);
    listen('lostpointercapture', this.lost as EventListener);
    listen('pointerleave', () => {
      if (!this.drag) {
        this.snapping.clear();
        this.preview.mesh.visible = false;
        this.preview.clearTransaction();
        this.hooks.invalidate();
      }
    });
    listen('contextmenu', (event) => event.preventDefault());
  }

  /** Rejects stale gestures before rebuilding formal scene objects. */
  sync(document: ProjectDocument, changes?: ChangeSet): void {
    if (
      this.drag &&
      (document.id !== this.drag.projectId || document.revision !== this.drag.revision)
    ) {
      this.cancel(false);
      this.hooks.status('transaction.stale');
    }
    if (document.id !== this.projectId || changes?.reason === 'replace') {
      this.cancel(false);
    }
    this.projectId = document.id;
  }

  /** Reconciles one session policy for drawing, capture and camera control modes. */
  setSession(): void {
    const session = this.hooks.getSession();
    if (session.tool !== this.activeTool || session.levelId !== this.activeLevel) {
      this.cancel(false);
      this.activeTool = session.tool;
      this.activeLevel = session.levelId;
      this.tools.handle({ type: 'activate', tool: session.tool });
    }
    if (session.wholeBuilding) {
      this.cancel(false);
    } else if (session.cameraMode !== 'edit') {
      this.suspendForCamera();
    }
    this.snapping.clear();
    this.tools.handle({
      type: 'camera',
      active: session.cameraMode !== 'edit' || this.cameraPointers.size > 0,
    });
    this.hooks.controls.mouseButtons.LEFT =
      session.cameraMode === 'rotate'
        ? THREE.MOUSE.ROTATE
        : session.cameraMode === 'pan'
          ? THREE.MOUSE.PAN
          : (null as unknown as THREE.MOUSE);
  }

  /** Retains world-space drawing anchors while camera movement invalidates screen-dependent drags. */
  onCameraChange(): void {
    this.suspendForCamera();
    this.snapping.clear();
    this.hooks.invalidateHistory();
    this.hooks.invalidate();
  }

  /** Camera navigation suspends wall/slab construction; grabbed object drafts cannot survive reprojection. */
  private suspendForCamera(): void {
    const state = this.tools.getState();
    if (this.drag || (state.kind !== 'start' && state.kind !== 'preview')) {
      this.cancel(false);
    }
  }

  private ground(event: PointerEvent, elevation?: number, applySnap = true, raw?: Vec2) {
    return this.picking.ground(event, {
      elevation: elevation ?? this.drag?.elevation,
      applySnap,
      raw,
      excludeId: this.drag?.id,
      pointerOffset: this.drag?.pointerOffset,
      constraint: this.drag?.constraint,
      toolState: this.tools.getState(),
    });
  }

  private down = (event: PointerEvent) => {
    this.hooks.controls.mouseButtons.RIGHT = event.shiftKey ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    const session = this.hooks.getSession();
    if (event.button !== 0 || session.cameraMode !== 'edit') {
      this.suspendForCamera();
      this.snapping.clear();
      this.cameraPointers.add(event.pointerId);
      this.tools.handle({ type: 'camera', active: true });
      return;
    }
    if (session.wholeBuilding) {
      return;
    }
    this.hooks.getCanvas().focus();
    const hit = this.picking.pick(event);
    const document = this.hooks.getDocument();
    const point =
      hit && (session.tool === 'door' || session.tool === 'window')
        ? this.ground(event, undefined, true, { x: hit.point.x, z: hit.point.z })
        : this.ground(event);
    if (!point) {
      return;
    }
    if (session.tool === 'select' || session.tool === 'material') {
      const handle = this.picking.pickHandle(event);
      if (handle && session.selectedId && session.tool === 'select') {
        const data = objectsOf(document).find((object) => object.id === session.selectedId);
        if (data) {
          this.beginDrag(event, data, handle.endpoint, handle.corner);
        }
        return;
      }
      this.hooks.select(hit?.id ?? null, hit?.role);
      if (session.tool === 'select' && hit) {
        const data = objectsOf(document).find((object) => object.id === hit.id);
        if (data) {
          this.beginDrag(event, data);
        }
      }
      return;
    }
    if (session.tool === 'wall' || session.tool === 'slab') {
      const intent = this.tools.handle({ type: 'click', point });
      if (!intent) {
        if (this.tools.getState().kind === 'start' && !this.snapping.hasTarget()) {
          this.hooks.status('hint.end');
        }
        this.hooks.invalidate();
        return;
      }
      if (intent.type === 'create-wall' || intent.type === 'create-slab') {
        const data =
          intent.type === 'create-wall'
            ? createWall(session.levelId, intent.start, intent.end)
            : createSlab(
                session.levelId,
                intent.start,
                intent.end,
                session.slabPurpose === 'roof'
                  ? session.roofElevation
                  : document.levels.find((level) => level.id === session.levelId)!.elevation,
                session.slabPurpose,
              );
        this.preview.clearTransaction();
        if (!this.hooks.command(addCommand(data))) {
          this.tools.reject(intent);
        } else {
          this.preview.mesh.visible = false;
          this.preview.objectId = null;
        }
      }
      this.hooks.invalidate();
      return;
    }
    if ((session.tool === 'door' || session.tool === 'window') && hit) {
      const wall = document.walls.find((candidate) => candidate.id === hit.id);
      if (!wall) {
        return;
      }
      const opening = this.openingAt(wall, session.tool, point);
      const result = this.preview.check(addCommand(opening));
      this.tools.handle({
        type: 'click',
        point,
        host: { wallId: wall.id, offset: opening.offset, valid: result.ok },
      });
      this.preview.clearTransaction();
      if (this.hooks.command(addCommand(opening))) {
        this.hooks.select(opening.id);
        this.preview.mesh.visible = false;
        this.preview.objectId = null;
      }
    }
  };

  /** Captures one formal source revision and anchor while Core owns the later preview token. */
  private beginDrag(
    event: PointerEvent,
    data: ObjectData,
    endpoint?: 'start' | 'end',
    corner?: number,
  ): void {
    const document = this.hooks.getDocument();
    const elevation =
      'polygon' in data
        ? data.elevation
        : document.levels.find((level) => level.id === data.levelId)!.elevation;
    const rawStart = this.ground(event, elevation, false);
    if (!rawStart) {
      return;
    }
    this.preview.clearTransaction();
    const snap = this.hooks.getSession().snap;
    this.drag = {
      id: data.id,
      ...dragAnchor(
        data,
        document,
        rawStart,
        snap.enabled && snap.mode !== 'off',
        endpoint,
        corner,
      ),
      initial: data,
      draft: data,
      endpoint,
      corner,
      elevation,
      projectId: document.id,
      revision: document.revision,
    };
    this.pointerId = event.pointerId;
    this.hooks.getCanvas().setPointerCapture(event.pointerId);
    this.hooks.controls.enabled = false;
  }

  private openingAt(wall: Wall, kind: 'door' | 'window', point: Vec2) {
    return createOpening(wall, kind, wallOffset(point, wall) - (kind === 'door' ? 0.45 : 0.6));
  }

  private move = (event: PointerEvent) => {
    const session = this.hooks.getSession();
    if (
      session.cameraMode !== 'edit' ||
      session.wholeBuilding ||
      this.cameraPointers.size ||
      (event.buttons & 2) !== 0
    ) {
      return;
    }
    const point = this.ground(event);
    if (!point) {
      return;
    }
    if (this.drag) {
      if (event.pointerId !== this.pointerId) {
        return;
      }
      const drag = this.drag;
      const hostId = 'wallId' in drag.initial ? drag.initial.wallId : undefined;
      drag.draft = dragGeometry(
        drag.initial,
        drag.start,
        point,
        drag.endpoint,
        drag.corner,
        this.hooks.getDocument().walls.find((wall) => wall.id === hostId),
        session.snap.enabled && session.snap.mode !== 'off' && !event.altKey,
      );
      this.preview.show(drag.draft, updateCommand(drag.draft));
      this.hooks.invalidate();
      return;
    }
    this.tools.handle({ type: 'move', point });
    const state = this.tools.getState();
    if (state.kind === 'preview') {
      const document = this.hooks.getDocument();
      const data =
        state.tool === 'wall'
          ? createWall(session.levelId, state.start, state.end)
          : createSlab(
              session.levelId,
              state.start,
              state.end,
              session.slabPurpose === 'roof'
                ? session.roofElevation
                : document.levels.find((level) => level.id === session.levelId)!.elevation,
              session.slabPurpose,
            );
      data.id = this.preview.objectId ??= data.id;
      this.preview.show(data, addCommand(data));
    } else if (session.tool === 'door' || session.tool === 'window') {
      const hit = this.picking.pick(event);
      const wall = this.hooks.getDocument().walls.find((candidate) => candidate.id === hit?.id);
      if (hit && wall) {
        const resolved = this.ground(event, undefined, true, { x: hit.point.x, z: hit.point.z })!;
        const opening = this.openingAt(wall, session.tool, resolved);
        opening.id = this.preview.objectId ??= opening.id;
        const result = this.preview.show(opening, addCommand(opening));
        this.tools.handle({
          type: 'move',
          point: resolved,
          host: { wallId: wall.id, offset: opening.offset, valid: result.ok },
        });
      } else {
        this.preview.mesh.visible = false;
        this.preview.clearTransaction();
      }
    }
    this.hooks.invalidate();
  };

  /** Releases transient state before submitting once, so synchronous Core listeners cannot see an active drag. */
  private up = (event: PointerEvent) => {
    this.cameraPointers.delete(event.pointerId);
    this.tools.handle({
      type: 'camera',
      active: this.hooks.getSession().cameraMode !== 'edit' || this.cameraPointers.size > 0,
    });
    if (!this.drag || event.pointerId !== this.pointerId) {
      return;
    }
    const drag = this.drag;
    const document = this.hooks.getDocument();
    this.drag = null;
    this.releasePointer();
    this.preview.mesh.visible = false;
    this.snapping.clear();
    this.hooks.controls.enabled = true;
    this.preview.clearTransaction();
    if (JSON.stringify(drag.initial) !== JSON.stringify(drag.draft)) {
      if (document.id !== drag.projectId || document.revision !== drag.revision) {
        this.hooks.status('transaction.stale');
      } else {
        this.hooks.command(updateCommand(drag.draft));
      }
    }
    this.hooks.invalidate();
  };

  private pointerCancelled = (event: PointerEvent) => {
    this.cameraPointers.delete(event.pointerId);
    this.cancel(false);
  };
  private lost = (event: PointerEvent) => {
    this.snapping.clear();
    this.cameraPointers.delete(event.pointerId);
    if (this.drag) {
      this.cancel(false);
    } else {
      this.tools.handle({
        type: 'camera',
        active: this.hooks.getSession().cameraMode !== 'edit' || this.cameraPointers.size > 0,
      });
    }
  };
  private blur = () => this.cancel(false);

  /** Clears the capture ID before release because lostpointercapture may re-enter cancellation. */
  private releasePointer(): void {
    const id = this.pointerId;
    this.pointerId = null;
    const canvas = this.hooks.getCanvas();
    if (id !== null && canvas.hasPointerCapture(id)) {
      canvas.releasePointerCapture(id);
    }
  }

  /** Cancels the whole gesture and token; an idle Escape may return the session to selection. */
  cancel = (exitTool: boolean | Event = true): void => {
    const idle = this.tools.getState().kind === 'idle';
    this.drag = null;
    this.releasePointer();
    this.preview.clear();
    this.tools.handle({ type: 'cancel' });
    this.cameraPointers.clear();
    this.tools.handle({ type: 'camera', active: this.hooks.getSession().cameraMode !== 'edit' });
    this.hooks.controls.enabled = true;
    this.snapping.clear();
    if (idle && exitTool === true && this.hooks.activateTool) {
      this.hooks.activateTool('select');
    } else if (this.tools.getState().tool !== this.hooks.getSession().tool) {
      this.tools.handle({ type: 'activate', tool: this.hooks.getSession().tool });
    }
    this.hooks.invalidate();
  };

  get active(): boolean {
    return !!this.drag || this.preview.mesh.visible || this.cameraPointers.size > 0;
  }

  get listenerCount(): number {
    return this.canvasUnsubscribers.length + (this.disposed ? 0 : 1);
  }

  diagnostics() {
    return { dragging: !!this.drag, state: this.tools.getState() };
  }

  /** Releases capture, preview and all native listeners exactly once before canvas disposal. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.cancel(false);
    window.removeEventListener('blur', this.blur);
    this.canvasUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.canvasUnsubscribers = [];
  }
}
