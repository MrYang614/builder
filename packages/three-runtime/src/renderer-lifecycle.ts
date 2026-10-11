import * as THREE from 'three';
import type { SceneRenderer } from './renderer';

type RendererLifecycleHooks = {
  isActive(): boolean;
  isPathTracing(): boolean;
  stopPathResources(): void;
  reportPathFailure(reason: string): void;
  reportDeviceLost(): void;
};

/** Installs and restores WebGPU diagnostics without coupling renderer ownership to UI state. */
export function bindRendererCallbacks(
  renderer: SceneRenderer,
  hooks: RendererLifecycleHooks,
): () => void {
  if (renderer instanceof THREE.WebGLRenderer) {
    return () => undefined;
  }
  const previousError = renderer.onError as (info: unknown) => void;
  const previousLost = renderer.onDeviceLost;
  const onError = (info: unknown) => {
    previousError.call(renderer, info);
    if (!hooks.isActive() || !hooks.isPathTracing()) {
      return;
    }
    const reason =
      typeof info === 'object' && info !== null && 'message' in info
        ? String(info.message)
        : String(info);
    hooks.stopPathResources();
    hooks.reportPathFailure(reason);
  };
  const onDeviceLost: typeof previousLost = () => {
    if (!hooks.isActive()) {
      return;
    }
    hooks.reportDeviceLost();
  };
  renderer.onError = onError;
  renderer.onDeviceLost = onDeviceLost;
  return () => {
    if (renderer.onError === onError) {
      renderer.onError = previousError;
    }
    if (renderer.onDeviceLost === onDeviceLost) {
      renderer.onDeviceLost = previousLost;
    }
  };
}
