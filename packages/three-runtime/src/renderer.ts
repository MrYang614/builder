import { WebGLRenderer, PCFShadowMap, SRGBColorSpace } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { cleanupAfterFailure } from './resource-cleanup';

export type RendererBackend = 'webgl' | 'webgpu';
export type SceneRenderer = WebGLRenderer | WebGPURenderer;
const renderErrors = new Set([
  'render.webgpuUnsupported',
  'render.pathFailed',
  'render.environmentFailed',
  'render.cleanupFailed',
  'render.postProcessingFailed',
]);
export const isRenderErrorStatus = (key: string): boolean => renderErrors.has(key);
export interface RenderState {
  backend: RendererBackend;
  switching: boolean;
  mode: 'raster' | 'pathtrace';
  pathStatus: 'idle' | 'building' | 'rendering' | 'paused' | 'complete' | 'error';
  samples: number;
  targetSamples: number;
  environmentLoading: boolean;
  postProcessing: {
    gtao: boolean;
    taa: boolean;
    available: boolean;
    history: 'invalid' | 'accumulating' | 'stable';
  };
  error?: string;
}
export const initialRenderState = (): RenderState => ({
  backend: 'webgl',
  switching: false,
  mode: 'raster',
  pathStatus: 'idle',
  samples: 0,
  targetSamples: 128,
  environmentLoading: false,
  postProcessing: {
    gtao: true,
    taa: true,
    available: true,
    history: 'invalid',
  },
});

export function createWebGLRenderer(): WebGLRenderer {
  // TRAA owns temporal edge filtering; disabling MSAA avoids double filtering and keeps the
  // WebGL and WebGPU real-time paths on the same anti-aliasing contract.
  const renderer = new WebGLRenderer({
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  return renderer;
}

/** An explicit WebGPU request must never be mislabeled after Three's automatic WebGL fallback. */
export async function createSceneRenderer(backend: RendererBackend): Promise<SceneRenderer> {
  if (backend === 'webgl') {
    return createWebGLRenderer();
  }
  if (!('gpu' in navigator) || !navigator.gpu) {
    throw new Error('render.webgpuUnsupported');
  }
  const { WebGPURenderer } = await import('three/webgpu');
  const renderer = new WebGPURenderer({ antialias: false, alpha: false });
  try {
    await renderer.init();
    if (!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend) {
      throw new Error('render.webgpuUnsupported');
    }
    renderer.outputColorSpace = SRGBColorSpace;
    return renderer;
  } catch (error) {
    try {
      await disposeSceneRenderer(renderer);
    } catch (cleanupError) {
      console.warn('Renderer cleanup failed after initialization failure.', cleanupError);
    }
    throw error;
  }
}

/** Releases native allocations and the WebGL context; disposal failure retains its original cause. */
export async function disposeSceneRenderer(renderer: SceneRenderer): Promise<void> {
  try {
    await renderer.dispose();
  } catch (error) {
    if (renderer instanceof WebGLRenderer) {
      cleanupAfterFailure(() => renderer.forceContextLoss());
    }
    throw error;
  }
  if (renderer instanceof WebGLRenderer) {
    renderer.forceContextLoss();
  }
}
