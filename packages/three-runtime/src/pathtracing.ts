import type { Camera, Scene, WebGLRenderer } from 'three';
import type { RendererBackend, SceneRenderer } from './renderer';
import { cleanupAfterFailure } from './resource-cleanup';
import {
  webGLDriver,
  webGPUDriver,
  type TraceDriver,
  type SampleCounts,
} from './pathtrace-drivers';

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
      cleanupAfterFailure(() => driver.dispose());
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
