import type { Camera, Material, Scene, ShaderMaterial, WebGLRenderer } from 'three';
import type { WebGLPathTracer } from 'three-gpu-pathtracer';
import type { WebGPUPathTracer } from 'three-gpu-pathtracer/webgpu';
import type { RendererBackend } from './renderer';
import { cleanupAfterFailure, runResourceCleanup } from './resource-cleanup';
export interface SampleCounts {
  min: number;
  max: number;
  avg: number;
}

export interface TraceDriver {
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

/** Adapts the pinned native WebGPU tracer and releases only its omitted derived resources. */
export function webGPUDriver(tracer: WebGPUPathTracer): TraceDriver {
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
    } catch (error) {
      cleanupAfterFailure(() =>
        runResourceCleanup([...owned].map((resource) => () => resource.dispose())),
      );
      throw error;
    }
    runResourceCleanup([...owned].map((resource) => () => resource.dispose()));
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
  _quad?: { material: Material };
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
export function webGLDriver(renderer: WebGLRenderer, Tracer: typeof WebGLPathTracer): TraceDriver {
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
    cleanupAfterFailure(() =>
      runResourceCleanup(
        [...targets].flatMap((target) => [
          () => target.fsQuad?.material.dispose(),
          () => target.dispose(),
        ]),
      ),
    );
    throw error;
  }
  tracer.renderDelay = 0;
  tracer.fadeDuration = 0;
  tracer.dynamicLowRes = false;
  tracer.minSamples = 1;
  tracer.synchronizeRenderSize = true;
  tracer.rasterizeScene = false;
  let released = false;
  const dispose = () => {
    if (released) {
      return;
    }
    released = true;
    const internal = tracer as unknown as WebGLTracerResources;
    const materials = new Set([internal._pathTracer.material, internal._lowResPathTracer.material]);
    const owned = new Set<Disposable>();
    const release = (resource?: Disposable | null) => {
      if (resource) {
        owned.add(resource);
      }
    };
    let primary: unknown;
    let failed = false;
    const presentationMaterial = internal._quad?.material;
    let presentationReleased = false;
    const onPresentationReleased = () => {
      presentationReleased = true;
    };
    presentationMaterial?.addEventListener('dispose', onPresentationReleased);
    try {
      tracer.dispose();
    } catch (error) {
      failed = true;
      primary = error;
    } finally {
      presentationMaterial?.removeEventListener('dispose', onPresentationReleased);
    }
    // The public disposer releases its quad geometry first; a callback can skip its material.
    if (failed && !presentationReleased) {
      release(presentationMaterial);
    }
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
    const supplemental = () =>
      runResourceCleanup([
        () => internal._lowResPathTracer.dispose(),
        ...[...owned].map((resource) => () => resource.dispose()),
      ]);
    if (failed) {
      cleanupAfterFailure(supplemental);
      throw primary;
    }
    supplemental();
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
