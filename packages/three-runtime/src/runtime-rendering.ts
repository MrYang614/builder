import * as THREE from 'three';
import type { ProjectDocument } from '@building/editor-core';
import {
  createWebGLRenderer,
  createSceneRenderer,
  disposeSceneRenderer,
  initialRenderState,
  type SceneRenderer,
  type RendererBackend,
  type RenderState,
} from './renderer';
import {
  createRasterPostProcessing,
  type PostProcessingOptions,
  type RasterPostProcessor,
} from './postprocessing';
import { bindRendererCallbacks } from './renderer-lifecycle';
import { postProcessingOptions, syncPostProcessingState } from './render-state';
import { RuntimeEnvironment } from './runtime-environment';
import { RuntimePathTracing } from './runtime-pathtrace';
import { RuntimeScheduler, type RuntimeFrameResult } from './runtime-scheduler';
import { runResourceCleanup } from './resource-cleanup';

export interface RuntimeRenderingHooks {
  background(): string;
  document(): ProjectDocument;
  snapshot(): ProjectDocument;
  interactive(): boolean;
  advanceAnimations(time: number): boolean;
  cancelEditing(): void;
  disconnectControls(): void;
  connectControls(canvas: HTMLCanvasElement): void;
  bindCanvas(): void;
  resizeViewport(): void;
  status(code: string, params?: Record<string, string | number>): void;
  renderState?(state: RenderState): void;
}

/** Owns the renderer, post effects and render-mode resources while borrowing scene and camera. */
export class RuntimeRendering {
  private currentRenderer: SceneRenderer;
  private renderState = initialRenderState();
  private backendRequest = 0;
  private rendererCallbacksCleanup: (() => void) | null = null;
  private postProcessing: RasterPostProcessor | null = null;
  private postProcessingKey = '';
  private lastInteraction = 0;
  private disposed = false;
  private readonly path: RuntimePathTracing;
  private readonly environment: RuntimeEnvironment;
  private readonly scheduler: RuntimeScheduler;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly hooks: RuntimeRenderingHooks,
  ) {
    this.currentRenderer = createWebGLRenderer();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(hooks.background());
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute('aria-label', '3D viewport');
    this.renderer.domElement.dataset.testid = 'viewport-canvas';
    try {
      this.postProcessing = createRasterPostProcessing(
        this.renderer as THREE.WebGLRenderer,
        scene,
        camera,
        postProcessingOptions(this.renderState),
      );
    } catch (error) {
      this.publish({
        postProcessing: { ...this.renderState.postProcessing, available: false },
        error: 'render.postProcessingFailed',
      });
      hooks.status('render.postProcessingFailed', { reason: String(error) });
    }
    this.scheduler = new RuntimeScheduler(this.renderFrame);
    this.path = new RuntimePathTracing(scene, camera, {
      renderer: () => this.renderer,
      state: () => this.renderState,
      document: hooks.document,
      snapshot: hooks.snapshot,
      environment: () => this.environment.texture,
      publish: this.publish,
      invalidate: this.invalidate,
      status: hooks.status,
    });
    this.environment = new RuntimeEnvironment(scene, {
      document: hooks.document,
      publish: this.publish,
      beforeReplace: () => this.path.stop(),
      changed: () => {
        // Decoding can finish after the old view's finite refinement has settled.
        this.invalidateHistory();
        this.path.markDirty();
      },
      invalidate: this.invalidate,
      status: hooks.status,
    });
  }

  get renderer(): SceneRenderer {
    return this.currentRenderer;
  }
  getRenderState(): RenderState {
    return this.renderState;
  }
  private publish = (patch: Partial<RenderState>): void => {
    if (!this.disposed) {
      this.renderState = { ...this.renderState, ...patch };
      this.hooks.renderState?.(this.renderState);
    }
  };
  private syncPostProcessing(): void {
    this.postProcessingKey = syncPostProcessingState(
      this.postProcessing,
      this.renderState.postProcessing,
      this.postProcessingKey,
      (postProcessing) => this.publish({ postProcessing }),
    );
  }
  private bindRendererCallbacks(renderer: SceneRenderer): void {
    this.rendererCallbacksCleanup?.();
    this.rendererCallbacksCleanup = bindRendererCallbacks(renderer, {
      isActive: () => !this.disposed && this.renderer === renderer,
      isPathTracing: () => this.renderState.mode === 'pathtrace',
      stopPathResources: () => this.path.stop(),
      reportPathFailure: (reason) => {
        this.publish({ mode: 'raster', pathStatus: 'error', error: 'render.pathFailed' });
        this.hooks.status('render.pathFailed', { reason });
        this.invalidate();
      },
      reportDeviceLost: () => {
        this.hooks.status('render.deviceLost');
        void this.setRendererBackend('webgl');
      },
    });
  }

  /** Commits a fully initialized backend before releasing its predecessor; stale requests own only their allocations. */
  async setRendererBackend(backend: RendererBackend): Promise<boolean> {
    const request = ++this.backendRequest;
    if (backend === this.renderState.backend && !this.renderState.switching) {
      this.publish({ error: undefined });
      return true;
    }
    this.publish({ switching: true, error: undefined });
    let next: SceneRenderer | null = null;
    let nextPost: RasterPostProcessor | null = null;
    try {
      next = await createSceneRenderer(backend);
      if (this.disposed || request !== this.backendRequest) {
        await disposeSceneRenderer(next);
        return false;
      }
      next.setPixelRatio(Math.min(devicePixelRatio, 2));
      next.outputColorSpace = this.renderer.outputColorSpace;
      next.toneMapping = this.renderer.toneMapping;
      next.toneMappingExposure = this.renderer.toneMappingExposure;
      next.setClearColor(this.hooks.background());
      if ((next as { isWebGPURenderer?: boolean }).isWebGPURenderer === true) {
        const module = await import('./webgpu-postprocessing');
        nextPost = module.createWebGPURasterPostProcessing(
          next as Parameters<typeof module.createWebGPURasterPostProcessing>[0],
          this.scene,
          this.camera,
          postProcessingOptions(this.renderState),
        );
      } else if (
        next instanceof THREE.WebGLRenderer &&
        typeof createRasterPostProcessing === 'function'
      ) {
        nextPost = createRasterPostProcessing(
          next,
          this.scene,
          this.camera,
          postProcessingOptions(this.renderState),
        );
      }
      if (this.disposed || request !== this.backendRequest) {
        nextPost?.dispose();
        await disposeSceneRenderer(next);
        return false;
      }
      const old = this.renderer;
      const canvas = next.domElement;
      canvas.tabIndex = old.domElement.tabIndex;
      canvas.setAttribute('aria-label', old.domElement.getAttribute('aria-label') ?? '3D viewport');
      canvas.dataset.testid = 'viewport-canvas';
      canvas.dataset.runtimeId = crypto.randomUUID();
      this.hooks.cancelEditing();
      this.path.stop();
      this.hooks.disconnectControls();
      old.domElement.replaceWith(canvas);
      this.currentRenderer = next;
      const oldPost = this.postProcessing;
      this.postProcessing = nextPost;
      try {
        oldPost?.dispose();
      } catch (error) {
        this.publish({ error: 'render.cleanupFailed' });
        this.hooks.status('render.cleanupFailed', { reason: String(error) });
      }
      this.syncPostProcessing();
      this.camera.coordinateSystem = next.coordinateSystem;
      this.camera.updateProjectionMatrix();
      this.hooks.connectControls(canvas);
      this.hooks.bindCanvas();
      this.bindRendererCallbacks(next);
      this.publish({ backend, switching: false, samples: 0 });
      this.hooks.resizeViewport();
      try {
        await disposeSceneRenderer(old);
      } catch (error) {
        if (!this.disposed && request === this.backendRequest) {
          this.publish({ error: 'render.cleanupFailed' });
          this.hooks.status('render.cleanupFailed', { reason: String(error) });
        }
      }
      if (this.renderer !== next || request !== this.backendRequest || this.disposed) {
        return false;
      }
      if (this.renderState.mode === 'pathtrace') {
        this.path.markDirty();
      }
      return true;
    } catch (error) {
      nextPost?.dispose();
      if (next && next !== this.renderer) {
        await disposeSceneRenderer(next);
      }
      if (request === this.backendRequest) {
        this.publish({ switching: false, error: 'render.webgpuUnsupported' });
        this.hooks.status('render.webgpuUnsupported', { reason: String(error) });
      }
      return false;
    }
  }

  invalidate = (): void => this.scheduler.invalidate();
  /** Prevents frame reentry before the facade releases interaction and formal scene owners. */
  stopScheduling(): void {
    this.scheduler.dispose();
  }
  /** Invalidates only post-processing accumulation; formal and clean path geometry stay owned. */
  invalidateHistory(): void {
    this.postProcessing?.invalidateHistory();
  }
  /** Changes the viewport clear color without replacing a committed panorama background. */
  setBackground(background: string): void {
    this.renderer.setClearColor(background);
  }
  /** Resizes owned buffers after the shared camera projection has been updated. */
  resize(width: number, height: number, pixelRatio: number): void {
    this.renderer.setSize(width, height, false);
    if (this.renderer.getPixelRatio() !== pixelRatio) {
      this.renderer.setPixelRatio(pixelRatio);
    }
    this.postProcessing?.setSize(width, height);
    this.path.reset();
    this.invalidate();
  }
  /** Formal changes invalidate temporal history and the clean path snapshot, never pointer previews. */
  sync(doc: ProjectDocument): void {
    this.invalidateHistory();
    void this.environment.apply(doc);
    this.path.markDirty();
  }
  /** Cancels editing before entering a clean snapshot or returning to the live raster scene. */
  async setPathTracing(enabled: boolean): Promise<void> {
    if (
      this.disposed ||
      this.renderState.switching ||
      (enabled && this.renderState.mode === 'pathtrace')
    ) {
      return;
    }
    this.hooks.cancelEditing();
    if (!enabled) {
      this.path.stop();
      this.invalidateHistory();
      this.publish({ mode: 'raster', pathStatus: 'idle', samples: 0, error: undefined });
      this.invalidate();
    } else {
      await this.path.start();
    }
  }
  /** Keeps invalid targets out of session state and applies valid targets to live accumulation. */
  setPathSamples(samples: number): void {
    if (!Number.isInteger(samples) || samples < 1 || samples > 4096) {
      return;
    }
    this.path.setSamples(samples);
    this.publish({ targetSamples: samples });
    this.invalidate();
  }
  /** Changes sampling policy only after clean-scene construction has completed. */
  pausePathTracing(paused: boolean): void {
    if (this.renderState.mode !== 'pathtrace' || this.renderState.pathStatus === 'building') {
      return;
    }
    this.path.pause(paused);
    this.publish({ pathStatus: paused ? 'paused' : 'rendering' });
    this.invalidate();
  }
  /** Changes actual post effects and discards temporal history before the next frame. */
  setPostProcessing(options: Partial<PostProcessingOptions>): void {
    if (this.postProcessing) {
      this.postProcessing.update({ ...postProcessingOptions(this.renderState), ...options });
      this.syncPostProcessing();
      this.invalidate();
    }
  }

  private rasterFrame(): boolean {
    let needsAnotherFrame = false;
    try {
      needsAnotherFrame = this.postProcessing?.render() ?? false;
    } catch (error) {
      const failed = this.postProcessing;
      this.postProcessing = null;
      try {
        failed?.dispose();
      } catch (disposeError) {
        this.hooks.status('render.cleanupFailed', { reason: String(disposeError) });
      }
      this.publish({
        postProcessing: { ...this.renderState.postProcessing, available: false },
        error: 'render.postProcessingFailed',
      });
      this.hooks.status('render.postProcessingFailed', { reason: String(error) });
    }
    if (!this.postProcessing) {
      this.renderer.render(this.scene, this.camera);
    }
    this.syncPostProcessing();
    return needsAnotherFrame;
  }

  private renderFrame = async (time: number): Promise<RuntimeFrameResult> => {
    let animating = false;
    try {
      animating = this.hooks.advanceAnimations(time);
      const interactive = this.hooks.interactive();
      if (interactive) {
        this.lastInteraction = time;
        this.invalidateHistory();
      }
      this.path.updateCamera();
      if (
        this.path.active &&
        !this.path.dirty &&
        !interactive &&
        time - this.lastInteraction > 150
      ) {
        const result = await this.path.renderFrame(time);
        return {
          rendered: result.retained,
          continueRendering: result.continueRendering || animating,
        };
      }
      const needsAnotherFrame = this.rasterFrame();
      return {
        rendered: true,
        continueRendering:
          animating ||
          (needsAnotherFrame && !interactive) ||
          (this.renderState.mode === 'pathtrace' && this.path.active && !this.path.dirty),
      };
    } catch (error) {
      if (this.disposed) {
        return { rendered: false, continueRendering: false };
      }
      if (this.renderState.error !== 'render.pathFailed') {
        this.path.stop();
        this.publish({ mode: 'raster', pathStatus: 'error', error: 'render.pathFailed' });
        this.hooks.status('render.pathFailed', { reason: String(error) });
      }
      return { rendered: false, continueRendering: animating };
    }
  };

  /** Captures the current converged view; transient editing and stale camera samples reject visibly. */
  async capturePNG(): Promise<ArrayBuffer> {
    if (this.path.updateCamera()) {
      this.invalidate();
      throw new Error('render.notReady');
    }
    if (
      this.renderState.environmentLoading ||
      this.path.dirty ||
      this.renderState.switching ||
      this.hooks.interactive() ||
      (this.renderState.mode === 'pathtrace' && (!this.path.active || this.path.samples < 1))
    ) {
      throw new Error('render.notReady');
    }
    if (this.path.active) {
      this.path.present();
    } else if (this.postProcessing) {
      this.postProcessing.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    const blob = await new Promise<Blob>((resolve, reject) =>
      this.renderer.domElement.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('render.captureFailed'))),
        'image/png',
      ),
    );
    return blob.arrayBuffer();
  }

  diagnostics() {
    return {
      ...this.scheduler.diagnostics(),
      render: this.renderState,
      actualBackend:
        this.renderer instanceof THREE.WebGLRenderer
          ? 'webgl'
          : (this.renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
            ? 'webgpu'
            : 'webgl-fallback',
      pathTracing: this.path.diagnostics(),
      environment: this.environment.diagnostics(),
    };
  }

  /** Stops scheduled work and path borrowers before releasing post effects, environment and renderer. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.backendRequest++;
    const postProcessing = this.postProcessing;
    const rendererCallbacksCleanup = this.rendererCallbacksCleanup;
    this.postProcessing = null;
    this.rendererCallbacksCleanup = null;
    runResourceCleanup([
      () => this.stopScheduling(),
      () => this.path.dispose(),
      () => postProcessing?.dispose(),
      () => rendererCallbacksCleanup?.(),
      () => this.environment.dispose(),
      () => {
        void disposeSceneRenderer(this.renderer).catch((error: unknown) => {
          console.warn('Renderer resource cleanup failed.', error);
        });
      },
      () => this.renderer.domElement.remove(),
    ]);
  }
}
