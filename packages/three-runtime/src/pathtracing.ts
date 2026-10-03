import type { Camera, Scene, ShaderMaterial, WebGLRenderer } from 'three';
import type { WebGLPathTracer } from 'three-gpu-pathtracer';
import type { WebGPUPathTracer } from 'three-gpu-pathtracer/webgpu';
import type { RendererBackend, SceneRenderer } from './renderer';

export interface PathTraceStats {
  backend: RendererBackend;
  samples: number;
  minSamples: number;
  maxSamples: number;
  targetSamples: number;
  paused: boolean;
  complete: boolean;
  ready: boolean;
}

export interface PathTraceOptions {
  maxSamples?: number;
  onStats?: (stats: PathTraceStats) => void;
}

interface SampleCounts {
  min: number;
  max: number;
  avg: number;
}

interface TraceDriver {
  backend: RendererBackend;
  setScene(scene: Scene, camera: Camera): void;
  setCamera(camera: Camera): void;
  updateCamera(): void;
  updateMaterials(): void;
  updateLights(): void;
  updateEnvironment(): void;
  renderSample(): void;
  readCounts(): SampleCounts | Promise<SampleCounts>;
  setPaused(paused: boolean): void;
  setMaxSamples(samples: number): void;
  reset(): void;
  dispose(): void;
}

const STATS_INTERVAL_MS = 250;

/**
 * Borrows a clean building scene, its camera and renderer. The caller retains ownership of
 * those objects and their resources; this session only owns the path tracer's derived data.
 * It does not start a render loop or update React state.
 */
export class PathTraceSession {
  readonly backend: RendererBackend;
  private ready = false;
  private disposed = false;
  private paused = false;
  private version = 0;
  private targetSamples: number;
  private counts: SampleCounts = { min: 0, max: 0, avg: 0 };
  private nextMeasurement = 0;
  private lastPublication = -Infinity;
  private publicationTimer?: ReturnType<typeof setTimeout>;
  private frame?: Promise<boolean>;

  private constructor(
    private readonly driver: TraceDriver,
    private readonly options: PathTraceOptions,
  ) {
    this.backend = driver.backend;
    this.targetSamples = options.maxSamples ?? 128;
    this.validateSampleTarget(this.targetSamples);
    driver.setMaxSamples(this.targetSamples);
  }

  static async create(
    renderer: SceneRenderer,
    options: PathTraceOptions = {},
  ): Promise<PathTraceSession> {
    let driver: TraceDriver;
    if ('isWebGPURenderer' in renderer && renderer.isWebGPURenderer) {
      await renderer.init();
      if (!('isWebGPUBackend' in renderer.backend) || !renderer.backend.isWebGPUBackend) {
        throw new Error('render.webgpuUnsupported');
      }
      const { WebGPUPathTracer } = await import('three-gpu-pathtracer/webgpu');
      driver = webGPUDriver(new WebGPUPathTracer(renderer));
    } else {
      const { WebGLPathTracer } = await import('three-gpu-pathtracer');
      driver = webGLDriver(renderer as WebGLRenderer, WebGLPathTracer);
    }
    try {
      return new PathTraceSession(driver, options);
    } catch (error) {
      driver.dispose();
      throw error;
    }
  }

  async start(scene: Scene, camera: Camera): Promise<void> {
    this.assertActive();
    const version = ++this.version;
    this.ready = false;
    this.clearCounts();
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    // Both published 0.0.26 backends build their BVHs synchronously. No unsupported worker
    // or setSceneAsync capability is implied by this Promise-based integration interface.
    this.driver.setScene(scene, camera);
    await Promise.resolve();
    if (this.disposed || version !== this.version) {
      return;
    }
    this.ready = true;
    this.driver.setPaused(this.paused);
    this.publishStats();
  }

  updateCamera(camera?: Camera): void {
    if (!this.ready || this.disposed) {
      return;
    }
    if (camera) {
      camera.updateMatrixWorld(true);
      this.driver.setCamera(camera);
    } else {
      this.driver.updateCamera();
    }
    this.invalidateCounts();
  }

  updateMaterials(): void {
    this.update(() => this.driver.updateMaterials());
  }

  updateLights(): void {
    this.update(() => this.driver.updateLights());
  }

  updateEnvironment(): void {
    this.update(() => this.driver.updateEnvironment());
  }

  reset(): void {
    if (this.disposed) {
      return;
    }
    this.driver.reset();
    this.invalidateCounts();
  }

  /** The published tracers synchronize their size from the renderer's drawing buffer. */
  resize(): void {
    this.reset();
  }

  setMaxSamples(samples: number): void {
    this.assertActive();
    this.validateSampleTarget(samples);
    this.targetSamples = samples;
    this.driver.setMaxSamples(samples);
    this.publishStats();
  }

  pause(paused = true): void {
    if (this.disposed) {
      return;
    }
    this.paused = paused;
    this.driver.setPaused(paused);
    this.publishStats();
  }

  getStats(): PathTraceStats {
    return {
      backend: this.backend,
      samples: this.counts.avg,
      minSamples: this.counts.min,
      maxSamples: this.counts.max,
      targetSamples: this.targetSamples,
      paused: this.paused,
      complete: this.ready && this.counts.min >= this.targetSamples,
      ready: this.ready && !this.disposed,
    };
  }

  /** One caller-owned frame at a time; stale GPU readbacks cannot overwrite a newer reset. */
  renderSample(): Promise<boolean> {
    if (this.frame) {
      return this.frame;
    }
    const frame = this.renderFrame();
    this.frame = frame;
    const clearFrame = () => {
      if (this.frame === frame) {
        this.frame = undefined;
      }
    };
    void frame.then(clearFrame, clearFrame);
    return frame;
  }

  /** Present the retained accumulation for PNG capture, without taking another sample. */
  present(): void {
    if (!this.ready || this.disposed) {
      return;
    }
    this.driver.setPaused(true);
    try {
      this.driver.renderSample();
    } finally {
      this.driver.setPaused(this.paused);
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.ready = false;
    this.version++;
    clearTimeout(this.publicationTimer);
    this.publicationTimer = undefined;
    this.driver.dispose();
  }

  private async renderFrame(): Promise<boolean> {
    if (!this.shouldContinue()) {
      return false;
    }
    const version = this.version;
    this.driver.renderSample();
    const now = performance.now();
    if (this.backend === 'webgl' || now >= this.nextMeasurement) {
      this.nextMeasurement = now + STATS_INTERVAL_MS;
      try {
        const counts = await this.driver.readCounts();
        if (!this.disposed && version === this.version) {
          this.counts = counts;
          this.publishStats();
        }
      } catch (error) {
        if (!this.disposed && version === this.version) {
          throw error;
        }
      }
    }
    return this.shouldContinue();
  }

  private shouldContinue(): boolean {
    return this.ready && !this.disposed && !this.paused && this.counts.min < this.targetSamples;
  }

  private update(operation: () => void): void {
    if (!this.ready || this.disposed) {
      return;
    }
    operation();
    this.invalidateCounts();
  }

  private clearCounts(): void {
    this.counts = { min: 0, max: 0, avg: 0 };
  }

  private invalidateCounts(): void {
    this.version++;
    this.clearCounts();
    this.publishStats();
  }

  private publishStats(): void {
    if (!this.options.onStats || this.disposed) {
      return;
    }
    const remaining = STATS_INTERVAL_MS - (performance.now() - this.lastPublication);
    if (remaining > 0) {
      this.publicationTimer ??= setTimeout(() => {
        this.publicationTimer = undefined;
        this.publishStats();
      }, remaining);
      return;
    }
    clearTimeout(this.publicationTimer);
    this.publicationTimer = undefined;
    this.lastPublication = performance.now();
    this.options.onStats(this.getStats());
  }

  private validateSampleTarget(samples: number): void {
    if (!Number.isSafeInteger(samples) || samples < 1) {
      throw new Error('render.invalidSamples');
    }
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error('render.pathtraceDisposed');
    }
  }
}

function webGPUDriver(tracer: WebGPUPathTracer): TraceDriver {
  tracer.renderDelay = 0;
  tracer.fadeDuration = 0;
  tracer.dynamicLowRes = false;
  // Disables the library's per-frame sample-count readbacks; our own reads are limited to 4 Hz.
  tracer.minSamples = 0;
  tracer.synchronizeRenderSize = true;
  const internal = tracer as unknown as WebGPUTracerResources;
  let released = false;
  const dispose = () => {
    if (released) {
      return;
    }
    released = true;
    // The pinned public disposer releases its targets, caches, BVH and environment CDFs.
    // It omits the per-instance Turquin LUT and FullScreenQuad materials (quad.dispose
    // only releases geometry). None of these are borrowed building/environment textures.
    const owned = new Set<Disposable>();
    if (internal.material?.turquinTexture) {
      owned.add(internal.material.turquinTexture);
    }
    // Empty scene/IES atlases are sampled without ever binding their render target.
    // Three then owns them as ordinary textures; disposing only the unused target
    // does not notify that texture allocation, so release the owned texture as well.
    for (const atlas of [
      internal._bvhData?.textureAtlas,
      internal._pathTracer?.lightsInfo?.iesAtlas,
    ]) {
      if (atlas?.texture) {
        owned.add(atlas.texture);
      }
    }
    for (const quad of [
      internal._blitQuad,
      internal._atlasDebugQuad,
      internal._sampleDensityQuad,
      internal._debugBoundsQuad,
    ]) {
      if (quad?.material) {
        owned.add(quad.material);
      }
    }
    try {
      tracer.dispose();
    } finally {
      for (const resource of owned) {
        resource.dispose();
      }
    }
  };
  return {
    backend: 'webgpu',
    setScene: (scene, camera) => tracer.setScene(scene, camera),
    setCamera: (camera) => tracer.setCamera(camera),
    updateCamera: () => tracer.updateCamera(),
    updateMaterials: () => tracer.updateMaterials(),
    updateLights: () => tracer.updateLights(),
    updateEnvironment: () => tracer.updateEnvironment(),
    renderSample: () => tracer.renderSample(),
    readCounts: () => tracer.getSampleCountsAsync(),
    setPaused: (paused) => {
      tracer.pause = paused;
    },
    setMaxSamples: (samples) => {
      tracer.maxSamples = samples;
    },
    reset: () => tracer.reset(),
    dispose,
  };
}

interface Disposable {
  dispose(): void;
}

interface WebGPUTracerResources {
  material?: { turquinTexture?: Disposable };
  _blitQuad?: { material: Disposable };
  _atlasDebugQuad?: { material: Disposable };
  _sampleDensityQuad?: { material: Disposable };
  _debugBoundsQuad?: { material: Disposable };
  _bvhData?: { textureAtlas?: { texture: Disposable } };
  _pathTracer?: { lightsInfo?: { iesAtlas?: { texture: Disposable } } };
}

interface WebGLTracerResources {
  _pathTracer: {
    material: ShaderMaterial;
    _blendQuad: { material: Disposable };
  };
  _lowResPathTracer: {
    material: ShaderMaterial;
    _blendQuad: { material: Disposable };
    dispose(): void;
  };
  _generator: { geometry: Disposable };
  _internalBackground: Disposable | null;
  _colorBackground?: Disposable;
}

type CapturedRenderTarget = NonNullable<Parameters<WebGLRenderer['setRenderTarget']>[0]> & {
  fsQuad?: { material: Disposable };
};

/** Supplements known omissions in the pinned 0.0.26 WebGL disposal implementation. */
function webGLDriver(renderer: WebGLRenderer, Tracer: typeof WebGLPathTracer): TraceDriver {
  const targets = new Set<CapturedRenderTarget>();
  const capture = <T>(operation: () => T): T => {
    const previousTarget = renderer.getRenderTarget();
    const original = renderer.setRenderTarget;
    renderer.setRenderTarget = function (target, activeCubeFace, activeMipmapLevel) {
      if (target && target !== previousTarget && !targets.has(target)) {
        const owned = target as CapturedRenderTarget;
        targets.add(owned);
        owned.addEventListener('dispose', () => targets.delete(owned));
      }
      original.call(this, target, activeCubeFace, activeMipmapLevel);
    };
    try {
      return operation();
    } finally {
      renderer.setRenderTarget = original;
    }
  };
  let tracer: WebGLPathTracer;
  try {
    tracer = capture(() => new Tracer(renderer));
  } catch (error) {
    for (const target of targets) {
      target.fsQuad?.material.dispose();
      target.dispose();
    }
    throw error;
  }
  tracer.renderDelay = 0;
  tracer.fadeDuration = 0;
  tracer.dynamicLowRes = false;
  tracer.minSamples = 1;
  tracer.synchronizeRenderSize = true;
  tracer.rasterizeScene = false;
  const dispose = () => {
    const internal = tracer as unknown as WebGLTracerResources;
    const materials = new Set([internal._pathTracer.material, internal._lowResPathTracer.material]);
    const disposed = new Set<Disposable>();
    const release = (resource?: Disposable | null) => {
      if (resource && !disposed.has(resource)) {
        disposed.add(resource);
        resource.dispose();
      }
    };
    tracer.dispose();
    internal._lowResPathTracer.dispose();
    // Texture-array render targets are captured at their public renderer binding, since the
    // library exposes only their Texture and otherwise loses the frame-buffer owner's handle.
    for (const target of targets) {
      release(target.fsQuad?.material);
      release(target);
    }
    targets.clear();
    for (const material of materials) {
      for (const key of [
        'bvh',
        'attributesArray',
        'materialIndexAttribute',
        'materials',
        'envMapInfo',
        'stratifiedTexture',
        'stratifiedOffsetTexture',
      ]) {
        release(material.uniforms[key]?.value as Disposable | undefined);
      }
      const lights = material.uniforms.lights?.value as { tex?: Disposable } | undefined;
      release(lights?.tex);
      release(material);
    }
    release(internal._pathTracer._blendQuad.material);
    release(internal._lowResPathTracer._blendQuad.material);
    release(internal._generator.geometry);
    release(internal._internalBackground);
    // A Scene Color creates this owned gradient map in updateEnvironment. It is separate
    // from _internalBackground (cube conversion), and legacy public disposal omits it.
    release(internal._colorBackground);
  };
  return {
    backend: 'webgl',
    setScene: (scene, camera) =>
      capture(() => {
        tracer.setScene(scene, camera);
      }),
    setCamera: (camera) => tracer.setCamera(camera),
    updateCamera: () => tracer.updateCamera(),
    updateMaterials: () => capture(() => tracer.updateMaterials()),
    updateLights: () => capture(() => tracer.updateLights()),
    updateEnvironment: () => capture(() => tracer.updateEnvironment()),
    renderSample: () => capture(() => tracer.renderSample()),
    readCounts: () => ({
      min: Math.floor(tracer.samples),
      max: Math.ceil(tracer.samples),
      avg: tracer.samples,
    }),
    setPaused: (paused) => {
      tracer.pausePathTracing = paused;
    },
    setMaxSamples: () => {
      // The legacy WebGL API has no native cap. PathTraceSession stops at its measured target.
    },
    reset: () => tracer.reset(),
    dispose,
  };
}
