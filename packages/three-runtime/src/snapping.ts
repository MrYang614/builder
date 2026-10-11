import * as THREE from 'three';
import type {
  ChangeSet,
  ProjectDocument,
  SnapResult,
  ToolState,
  Vec2,
} from '@building/editor-core';
import type { RuntimeSession } from './runtime-contracts';
import { RuntimeSnapIndex } from './snap-index';
import { SnapFeedback } from './snap-feedback';
import type { SnapAxisConstraint } from './drag-anchor';
import { runResourceCleanup } from './resource-cleanup';

/** Owns snap projection, cached geometry, transient feedback and its local coordinate readout. */
export class RuntimeSnapping {
  private readonly index = new RuntimeSnapIndex();
  private readonly feedback: SnapFeedback;
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0));
  private readonly hit = new THREE.Vector3();
  private readonly output = document.createElement('output');
  private result: SnapResult | null = null;

  constructor(
    container: HTMLElement,
    auxiliary: THREE.Group,
    private readonly marker: THREE.Mesh,
    color: string,
    private readonly status: (code: string) => void,
  ) {
    this.feedback = new SnapFeedback(auxiliary, marker, color);
    this.output.className = 'viewport-snap-coordinate';
    this.output.dataset.testid = 'snap-coordinate';
    this.output.setAttribute('aria-live', 'off');
    this.output.hidden = true;
    container.appendChild(this.output);
  }

  /** Uses one resolved point for the marker, tool preview and subsequent formal command. */
  ground(
    event: PointerEvent,
    ray: THREE.Raycaster,
    document: ProjectDocument,
    session: RuntimeSession,
    elevation?: number,
    excludeId?: string,
    applySnap = true,
    raw?: Vec2,
    pointerOffset?: Vec2,
    constraint?: SnapAxisConstraint,
    toolState?: ToolState,
  ): Vec2 | null {
    applySnap &&= session.tool !== 'material';
    const y =
      elevation ?? document.levels.find((level) => level.id === session.levelId)?.elevation ?? 0;
    this.plane.constant = -y;
    const hit = raw ?? ray.ray.intersectPlane(this.plane, this.hit);
    if (!hit) {
      this.clear();
      return null;
    }
    const projected = {
      x: applySnap ? hit.x + (pointerOffset?.x ?? 0) : hit.x,
      z: applySnap ? hit.z + (pointerOffset?.z ?? 0) : hit.z,
    };
    if (
      !constraint &&
      applySnap &&
      session.snap.enabled &&
      session.snap.mode !== 'off' &&
      !event.altKey &&
      toolState?.tool === 'wall' &&
      (toolState.kind === 'start' || toolState.kind === 'preview')
    ) {
      constraint =
        Math.abs(projected.x - toolState.start.x) >= Math.abs(projected.z - toolState.start.z)
          ? { z: toolState.start.z }
          : { x: toolState.start.x };
    }
    this.result = this.index.resolvePointer(
      { x: constraint?.x ?? projected.x, z: constraint?.z ?? projected.z },
      !applySnap || event.altKey || !session.snap.enabled,
      document,
      session,
      excludeId,
      constraint,
      projected,
    );
    this.result.rawPoint = { x: hit.x, z: hit.z };
    this.result.pointerDistance = Math.hypot(
      this.result.point.x - hit.x,
      this.result.point.z - hit.z,
    );
    this.index.publishFeedback(this.result, this.status);
    this.feedback.update(this.result, y);
    this.output.textContent = `X ${this.result.point.x.toFixed(3)} · Z ${this.result.point.z.toFixed(3)} m`;
    this.output.hidden = !applySnap;
    return this.result.point;
  }

  /** Keeps formal geometry groups current without including preview objects. */
  sync(document: ProjectDocument, changes?: ChangeSet): void {
    this.index.sync(document, changes);
    this.clear();
  }

  /** Keeps target feedback visible when a tool would otherwise replace it with a length hint. */
  hasTarget(): boolean {
    return !!this.result?.labelKey;
  }

  /** Restores the current target once a previously invalid draft becomes valid. */
  restoreFeedback(): void {
    this.index.clearFeedback();
    if (this.result) {
      this.index.publishFeedback(this.result, this.status);
    }
  }

  /** Invalidates feedback after camera, viewport, language/theme, tool or render changes. */
  clear(): void {
    this.feedback.clear();
    this.index.clearFeedback(this.status);
    this.output.hidden = true;
    this.result = null;
  }

  /** Updates semantic colors and clears feedback whose screen position may have changed. */
  setTheme(color: string): void {
    this.feedback.setTheme(color);
    this.clear();
  }

  /** Returns read-only counters and the latest target for integration tests. */
  diagnostics() {
    return { ...this.index.diagnostics(), markerVisible: this.marker.visible, result: this.result };
  }

  /** Releases local DOM, cache references and GPU line resources exactly once. */
  dispose(): void {
    runResourceCleanup([
      () => this.feedback.dispose(),
      () => this.index.reset(),
      () => this.output.remove(),
    ]);
  }
}
