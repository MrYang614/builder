import { WebGLRenderer, SRGBColorSpace } from 'three';
import type { WebGPURenderer } from 'three/webgpu';

export type RendererBackend = 'webgl' | 'webgpu';
export type SceneRenderer = WebGLRenderer | WebGPURenderer;
const renderErrors = new Set([
  'render.webgpuUnsupported',
  'render.pathFailed',
  'render.environmentFailed',
  'render.cleanupFailed',
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
});

export function createWebGLRenderer(): WebGLRenderer {
  return new WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
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
  const renderer = new WebGPURenderer({ antialias: true, alpha: false });
  try {
    await renderer.init();
    if (!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend) {
      throw new Error('render.webgpuUnsupported');
    }
    renderer.outputColorSpace = SRGBColorSpace;
    return renderer;
  } catch (error) {
    await renderer.dispose();
    throw error;
  }
}

export async function disposeSceneRenderer(renderer: SceneRenderer): Promise<void> {
  await renderer.dispose();
  if (renderer instanceof WebGLRenderer) {
    renderer.forceContextLoss();
  }
}
