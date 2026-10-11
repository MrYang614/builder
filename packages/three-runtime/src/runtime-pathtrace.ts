import * as THREE from 'three';
import type { ProjectDocument } from '@building/editor-core';
import { buildBuilding, type BuiltBuilding } from './scene';
import {
  createDefaultEnvironmentTexture,
  createPathTracingEnvironmentTexture,
} from './environment';
import type { PathTraceSession } from './pathtracing';
import type { RenderState, SceneRenderer } from './renderer';
import { cleanupAfterFailure, runResourceCleanup } from './resource-cleanup';

export interface RuntimePathTraceHooks {
  renderer(): SceneRenderer;
  state(): RenderState;
  snapshot(): ProjectDocument;
  document(): ProjectDocument;
  environment(): THREE.Texture | null;
  publish(patch: Partial<RenderState>): void;
  invalidate(): void;
  status(code: string, params?: Record<string, string | number>): void;
}

/** Owns the clean building snapshot and tracer data; visible scene resources remain borrowed. */
export class RuntimePathTracing {
  private path: PathTraceSession | null = null;
  private pathBuilding: BuiltBuilding | null = null;
  private pathScene: THREE.Scene | null = null;
  private pathDefaultEnvironment: THREE.Texture | null = null;
  private pathDirty = false;
  private pathRequest = 0;
  private pathTimer: ReturnType<typeof setTimeout> | null = null;
  private pathPaused = false;
  private pathCameraKey = '';
  private lastSamplePublish = 0;
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly hooks: RuntimePathTraceHooks,
  ) {}

  get active(): boolean {
    return !!this.path;
  }
  get dirty(): boolean {
    return this.pathDirty;
  }
  get samples(): number {
    return this.path?.getStats().samples ?? 0;
  }

  private cameraSignature(): string {
    return [
      ...this.camera.position.toArray(),
      ...this.camera.quaternion.toArray(),
      ...this.camera.projectionMatrix.elements,
    ].join(',');
  }

  /** Resets accumulation before presenting or sampling a changed camera, including paused sessions. */
  updateCamera(): boolean {
    if (!this.path || this.pathDirty) {
      return false;
    }
    const signature = this.cameraSignature();
    if (signature === this.pathCameraKey) {
      return false;
    }
    this.path.updateCamera(this.camera);
    this.pathCameraKey = signature;
    return true;
  }

  /** Discards accumulation after viewport buffers change without replacing clean scene resources. */
  reset(): void {
    this.path?.reset();
  }

  /** Presents retained samples without advancing their count. */
  present(): void {
    this.path?.present();
  }

  /** Samples one serialized frame and ignores completion after its owner has been replaced. */
  async renderFrame(time: number): Promise<{ retained: boolean; continueRendering: boolean }> {
    const active = this.path;
    if (!active || this.pathDirty) {
      return { retained: false, continueRendering: false };
    }
    const retained = active.getStats();
    let continueRendering = false;
    if (retained.paused || retained.complete) {
      active.present();
    } else {
      continueRendering = await active.renderSample();
    }
    if (this.disposed || active !== this.path) {
      return { retained: false, continueRendering: false };
    }
    const stats = active.getStats();
    if (time - this.lastSamplePublish > 500 || stats.complete || stats.paused) {
      this.lastSamplePublish = time;
      this.hooks.publish({
        samples: stats.samples,
        pathStatus: stats.paused ? 'paused' : stats.complete ? 'complete' : 'rendering',
      });
    }
    return { retained: true, continueRendering };
  }

  /** Detaches owners before disposal so failures and nested GPU callbacks cannot release twice. */
  stop(): void {
    this.pathRequest++;
    if (this.pathTimer !== null) {
      clearTimeout(this.pathTimer);
      this.pathTimer = null;
    }
    const owned = [this.path, this.pathBuilding, this.pathDefaultEnvironment];
    this.path = null;
    this.pathBuilding = null;
    this.pathScene = null;
    this.pathDefaultEnvironment = null;
    this.pathDirty = false;
    this.pathCameraKey = '';
    const failures: unknown[] = [];
    for (const resource of owned) {
      try {
        resource?.dispose();
      } catch (error) {
        failures.push(error);
        console.warn('Path tracing resource cleanup failed.', error);
      }
    }
    if (failures.length && !this.disposed) {
      this.hooks.publish({ error: 'render.cleanupFailed' });
      this.hooks.status('render.cleanupFailed', { reason: failures.map(String).join('\n') });
    }
  }

  /** Starts immediately for an explicit user action; document edits use the debounced rebuild. */
  async start(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.pathPaused = false;
    this.hooks.publish({ mode: 'pathtrace', pathStatus: 'building', error: undefined });
    this.pathDirty = true;
    await this.rebuild(++this.pathRequest);
  }

  /** Applies a validated sample target to an existing session without rebuilding geometry. */
  setSamples(samples: number): void {
    this.path?.setMaxSamples(samples);
  }

  /** Retains the requested pause state across a subsequent clean-scene rebuild. */
  pause(paused: boolean): void {
    this.pathPaused = paused;
    this.path?.pause(paused);
  }

  /** Coalesces formal edits without rebuilding the clean geometry on pointer previews. */
  markDirty(): void {
    if (this.hooks.state().mode !== 'pathtrace' || this.disposed) {
      return;
    }
    this.pathDirty = true;
    this.hooks.publish({ pathStatus: 'building', samples: 0 });
    const request = ++this.pathRequest;
    if (this.pathTimer !== null) {
      clearTimeout(this.pathTimer);
    }
    this.pathTimer = setTimeout(() => {
      this.pathTimer = null;
      void this.rebuild(request).catch((error: unknown) => {
        console.warn('Path tracing rebuild failed.', error);
      });
    }, 200);
  }

  private async rebuild(request: number): Promise<void> {
    if (
      this.disposed ||
      this.hooks.state().mode !== 'pathtrace' ||
      this.hooks.state().environmentLoading
    ) {
      return;
    }
    let built: BuiltBuilding | null = null;
    let path: PathTraceSession | null = null;
    let fallbackEnvironment: THREE.Texture | null = null;
    // Detach local allocations before releasing: callbacks and a later catch cannot release twice.
    const releasePending = () => {
      const owned = [path, built, fallbackEnvironment];
      path = null;
      built = null;
      fallbackEnvironment = null;
      runResourceCleanup(owned.map((resource) => () => resource?.dispose()));
    };
    try {
      const snapshot = this.hooks.snapshot();
      const renderer = this.hooks.renderer();
      built = buildBuilding(snapshot);
      await built.resources.ready();
      const scene = new THREE.Scene();
      scene.add(built.root);
      for (const light of this.scene.children) {
        if (light instanceof THREE.DirectionalLight && light.visible) {
          scene.add(light.clone());
        }
      }
      const environment = this.hooks.environment();
      if (environment) {
        fallbackEnvironment = await createPathTracingEnvironmentTexture(environment);
        scene.environment = fallbackEnvironment;
        scene.environmentIntensity = snapshot.environment?.intensity ?? 1;
        scene.environmentRotation.copy(this.scene.environmentRotation);
        if (snapshot.environment?.background) {
          scene.background = fallbackEnvironment;
          scene.backgroundRotation.copy(this.scene.backgroundRotation);
        }
      } else {
        fallbackEnvironment = createDefaultEnvironmentTexture();
        scene.environment = fallbackEnvironment;
      }
      scene.background ??= new THREE.Color().setScalar(0.12);
      const { PathTraceSession } = await import('./pathtracing');
      path = await PathTraceSession.create(renderer, {
        maxSamples: this.hooks.state().targetSamples,
      });
      await path.start(scene, this.camera);
      const current = this.hooks.document();
      if (
        this.disposed ||
        request !== this.pathRequest ||
        renderer !== this.hooks.renderer() ||
        snapshot.id !== current.id ||
        snapshot.revision !== current.revision
      ) {
        cleanupAfterFailure(releasePending);
        return;
      }
      const previous = [this.path, this.pathBuilding, this.pathDefaultEnvironment];
      this.path = null;
      this.pathBuilding = null;
      this.pathScene = null;
      this.pathDefaultEnvironment = null;
      try {
        runResourceCleanup(previous.map((resource) => () => resource?.dispose()));
      } catch (error) {
        if (!this.disposed && request === this.pathRequest) {
          this.hooks.publish({ error: 'render.cleanupFailed' });
          this.hooks.status('render.cleanupFailed', { reason: String(error) });
        }
      }
      if (this.disposed || request !== this.pathRequest) {
        cleanupAfterFailure(releasePending);
        return;
      }
      // User sample settings can change while the backend module or scene data is loading.
      path.setMaxSamples(this.hooks.state().targetSamples);
      path.pause(this.pathPaused);
      this.path = path;
      this.pathBuilding = built;
      this.pathScene = scene;
      this.pathDefaultEnvironment = fallbackEnvironment;
      path = null;
      built = null;
      fallbackEnvironment = null;
      this.pathDirty = false;
      this.pathCameraKey = '';
      this.hooks.publish({ pathStatus: this.pathPaused ? 'paused' : 'rendering', samples: 0 });
      this.hooks.invalidate();
    } catch (error) {
      cleanupAfterFailure(releasePending);
      if (!this.disposed && request === this.pathRequest) {
        this.stop();
        this.hooks.publish({ mode: 'raster', pathStatus: 'error', error: 'render.pathFailed' });
        this.hooks.status('render.pathFailed', { reason: String(error) });
        this.hooks.invalidate();
      }
    }
  }

  diagnostics() {
    let auxiliaryObjects = 0,
      meshes = 0,
      displayMaterialOverrides = 0;
    this.pathScene?.traverse((object) => {
      if (object instanceof THREE.GridHelper || object instanceof THREE.Box3Helper) {
        auxiliaryObjects++;
      }
      if (object instanceof THREE.Mesh) {
        meshes++;
        if (object.userData.displayMaterials) {
          displayMaterialOverrides++;
        }
      }
    });
    const doc = this.hooks.document();
    return {
      stats: this.path?.getStats() ?? null,
      cleanBuildingChildren: this.pathBuilding?.root.children.length ?? 0,
      cleanBuilding: !!this.pathBuilding,
      resources: this.pathBuilding?.resources.stats ?? null,
      cleanGeometryObjects: this.pathBuilding
        ? doc.walls.length + doc.slabs.length + doc.openings.length
        : 0,
      auxiliaryObjects,
      meshes,
      displayMaterialOverrides,
      sceneId: this.pathScene?.uuid ?? null,
      activeSession: this.path ? 1 : 0,
    };
  }

  /** Cancels rebuilds and releases the session before its clean building and owned panorama. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.stop();
  }
}
