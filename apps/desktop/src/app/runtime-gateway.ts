import type { RendererBackend, ThreeRuntime } from '@building/three-runtime';

/** Keeps coarse runtime and renderer actions behind one owner without exposing Three objects to UI. */
export class RuntimeGateway {
  private runtimeEpoch = 0;
  private runtime: ThreeRuntime | null = null;

  attach(runtime: ThreeRuntime): () => void {
    this.runtime = runtime;
    this.runtimeEpoch += 1;
    return () => {
      if (this.runtime === runtime) {
        try {
          runtime.dispose();
        } finally {
          this.runtime = null;
          this.runtimeEpoch += 1;
        }
      }
    };
  }

  getEpoch(): number {
    return this.runtimeEpoch;
  }

  getRuntime(): ThreeRuntime | null {
    return this.runtime;
  }

  focus(target: 'selected' | 'level' | 'all' | 'top'): void {
    this.runtime?.focus(target);
  }

  setBackend(backend: RendererBackend): Promise<void> {
    return this.runtime
      ? this.runtime.setRendererBackend(backend).then(() => undefined)
      : Promise.reject(new Error('runtime.notReady'));
  }

  setMode(mode: 'raster' | 'pathtrace'): Promise<void> {
    return (
      this.runtime?.setPathTracing(mode === 'pathtrace') ??
      Promise.reject(new Error('runtime.notReady'))
    );
  }
}
