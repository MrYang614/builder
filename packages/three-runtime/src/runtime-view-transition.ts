import type * as THREE from 'three';
import {
  clampUnit,
  fitObliqueCameraPose,
  interpolateCameraPose,
  obliqueCameraPose,
  planCameraPose,
  transitionEase,
  visiblePlanBounds,
  type CameraPose,
  type PlanViewFraming,
  type ViewTransitionOptions,
  type ViewTransitionPhase,
} from './view-transition-math';

interface TransitionHooks {
  camera: THREE.PerspectiveCamera;
  target: THREE.Vector3;
  building: THREE.Object3D;
  auxiliary: THREE.Object3D;
  roots(): Iterable<{ root: THREE.Object3D; currentLevel: boolean }>;
  viewport(): { width: number; height: number };
  isActive(): boolean;
  prepare?(): void;
  activate(active: boolean): void;
  input(active: boolean): void;
  rasterOnly(active: boolean): void;
  invalidate(): void;
}

interface Transition {
  target: '3d' | 'plan';
  framing: PlanViewFraming;
  options: ViewTransitionOptions;
  phase: Exclude<ViewTransitionPhase, 'idle'>;
  progress: number;
  growth: number;
  started: number | null;
  boundary: boolean;
  originActive: boolean;
  origin: CameraPose;
  from: CameraPose;
  to: CameraPose;
  position: THREE.Vector3;
  scale: THREE.Vector3;
  visibility: Map<THREE.Object3D, boolean>;
  shadowReceivers: Set<THREE.Object3D>;
  viewport: { width: number; height: number };
  resolve(success: boolean): void;
}

/** Owns transient camera/height poses; all frames use the existing renderer scheduler. */
export class RuntimeViewTransition {
  private transition: Transition | null = null;

  constructor(private readonly hooks: TransitionHooks) {}

  get active(): boolean {
    return this.transition !== null;
  }

  /** Starts one reference flow; busy and invalid requests resolve false without modifying the scene. */
  start(
    target: '3d' | 'plan',
    framing: PlanViewFraming,
    options: ViewTransitionOptions = {},
  ): Promise<boolean> {
    const viewport = this.hooks.viewport();
    if (
      this.active ||
      ![
        framing.center.x,
        framing.center.z,
        framing.elevation,
        framing.pixelsPerMeter,
        viewport.width,
        viewport.height,
      ].every(Number.isFinite) ||
      framing.pixelsPerMeter <= 0 ||
      viewport.width <= 0 ||
      viewport.height <= 0
    ) {
      return Promise.resolve(false);
    }
    const originActive = this.hooks.isActive();
    const origin = {
      position: this.hooks.camera.position.clone(),
      target: this.hooks.target.clone(),
    };
    this.hooks.prepare?.();
    this.hooks.activate(true);
    this.hooks.input(false);
    this.hooks.rasterOnly(true);
    const plan = planCameraPose(this.hooks.camera, framing, viewport.height);
    const roots = [...this.hooks.roots()];
    const from = target === '3d' ? plan : origin;
    const to =
      target === '3d'
        ? fitObliqueCameraPose(
            obliqueCameraPose(plan),
            this.hooks.camera,
            visiblePlanBounds(
              roots.filter(({ currentLevel }) => currentLevel).map(({ root }) => root),
              framing,
              viewport,
            ),
          )
        : plan;
    return new Promise<boolean>((resolve) => {
      const visibility = new Map<THREE.Object3D, boolean>([
        [this.hooks.auxiliary, this.hooks.auxiliary.visible],
      ]);
      this.hooks.auxiliary.visible = false;
      const shadowReceivers = new Set<THREE.Object3D>();
      for (const { root, currentLevel } of roots) {
        visibility.set(root, root.visible);
        root.visible = root.visible && currentLevel;
        root.traverse((object) => {
          if (object.receiveShadow) {
            shadowReceivers.add(object);
          }
        });
      }
      this.transition = {
        target,
        framing,
        options,
        phase: target === '3d' ? 'enter-fade' : options.reducedMotion ? 'exit-fade' : 'exit-orbit',
        progress: 0,
        growth: target === '3d' ? 0 : 1,
        started: null,
        boundary: false,
        originActive,
        origin,
        from,
        to,
        position: this.hooks.building.position.clone(),
        scale: this.hooks.building.scale.clone(),
        visibility,
        shadowReceivers,
        viewport,
        resolve,
      };
      // Reduced motion shows the settled camera immediately and retains only a short opacity fade.
      this.applyPose(options.reducedMotion ? (target === '3d' ? to : origin) : from);
      this.applyGrowth(options.reducedMotion ? 1 : target === '3d' ? 0 : 1);
      this.hooks.invalidate();
    });
  }

  /** Advances transient poses before raster rendering; phase changes wait for the resulting pixels. */
  advance(time: number): boolean {
    const current = this.transition;
    if (!current || current.started === null) {
      return !!current;
    }
    const duration = current.options.reducedMotion
      ? 80
      : current.phase === 'enter-fade'
        ? 420
        : current.phase === 'enter-orbit'
          ? 1700
          : current.phase === 'exit-orbit'
            ? 1300
            : 450;
    const progress = clampUnit((time - current.started) / duration);
    current.progress = progress;
    if (current.phase === 'enter-orbit') {
      this.applyPose(
        interpolateCameraPose(current.from, current.to, transitionEase(progress / 0.85)),
      );
      this.applyGrowth(transitionEase((progress - 0.1) / 0.55));
    } else if (current.phase === 'exit-orbit') {
      this.applyPose(
        interpolateCameraPose(current.from, current.to, transitionEase((progress - 0.1) / 0.9)),
      );
      this.applyGrowth(1 - transitionEase((progress - 0.2) / 0.6));
    }
    current.boundary = progress === 1;
    return true;
  }

  /** Publishes only phase boundaries after a raster frame, preventing a fade into stale tracer pixels. */
  presented(time: number): void {
    const current = this.transition;
    if (!current) {
      return;
    }
    if (current.started === null) {
      current.started = time;
      this.notify(current.phase);
    } else if (current.boundary) {
      if (current.phase === 'enter-fade' && !current.options.reducedMotion) {
        this.phase('enter-orbit', time);
      } else if (current.phase === 'exit-orbit') {
        this.phase('exit-fade', time);
      } else {
        this.finish(true);
      }
    }
  }

  /** A changed viewport invalidates the captured planar framing; same-size observations are harmless. */
  resize(width: number, height: number): void {
    const size = this.transition?.viewport;
    if (size && (size.width !== width || size.height !== height)) {
      this.cancel();
    }
  }

  /** Restores the originating view before formal sync, backend replacement or disposal. */
  cancel(): void {
    this.finish(false);
  }

  diagnostics() {
    return {
      phase: this.transition?.phase ?? 'idle',
      progress: this.transition?.progress ?? 1,
      growth: this.transition?.growth ?? 1,
      scaleY: this.hooks.building.scale.y,
    };
  }

  private phase(phase: Transition['phase'], time: number): void {
    const current = this.transition;
    if (current) {
      current.phase = phase;
      current.started = time;
      current.progress = 0;
      current.boundary = false;
      this.notify(phase);
    }
  }

  private applyPose(pose: CameraPose): void {
    this.hooks.camera.position.copy(pose.position);
    this.hooks.target.copy(pose.target);
    this.hooks.camera.lookAt(pose.target);
    this.hooks.camera.updateMatrixWorld(true);
  }

  private applyGrowth(growth: number): void {
    const current = this.transition;
    if (!current) {
      return;
    }
    current.growth = growth;
    // Nonzero thickness keeps normal matrices invertible while remaining visually flat.
    const scale = Math.max(0.0001, growth);
    this.hooks.building.scale.y = current.scale.y * scale;
    this.hooks.building.position.y =
      current.framing.elevation + (current.position.y - current.framing.elevation) * scale;
    this.hooks.building.updateMatrixWorld(true);
    // Compressed surfaces become nearly coplanar; suppress shadow reception until full height returns.
    for (const object of current.shadowReceivers) {
      object.receiveShadow = growth === 1;
    }
  }

  private notify(phase: ViewTransitionPhase): void {
    try {
      this.transition?.options.onPhase?.(phase);
    } catch (error) {
      this.cancel();
      console.warn('View transition callback failed.', error);
    }
  }

  private finish(success: boolean): void {
    const current = this.transition;
    if (!current) {
      return;
    }
    this.transition = null;
    const active = success ? current.target === '3d' : current.originActive;
    // Suspend before restoring full height: the outgoing canvas must retain its planar pixels.
    this.hooks.activate(active);
    if (!success) {
      this.applyPose(current.origin);
    }
    this.hooks.building.position.copy(current.position);
    this.hooks.building.scale.copy(current.scale);
    this.hooks.building.updateMatrixWorld(true);
    for (const [object, visible] of current.visibility) {
      object.visible = visible;
    }
    for (const object of current.shadowReceivers) {
      object.receiveShadow = true;
    }
    this.hooks.rasterOnly(false);
    this.hooks.input(active);
    this.hooks.invalidate();
    try {
      current.options.onPhase?.('idle');
    } catch (error) {
      console.warn('View transition callback failed.', error);
    } finally {
      current.resolve(success);
    }
  }
}
