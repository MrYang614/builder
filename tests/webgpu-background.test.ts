import { Color, NoToneMapping, PerspectiveCamera, Scene, SRGBColorSpace, Texture } from 'three';
import type { ColorRepresentation } from 'three';
import { NodeFrame, RenderPipeline, RendererUtils } from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import { context } from 'three/tsl';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { WebGPURasterPostProcessing } from '../packages/three-runtime/src/webgpu-postprocessing';

type ScenePass = ReturnType<typeof import('three/tsl').pass>;
type MRT = ReturnType<WebGPURenderer['getMRT']> | null;
type Target = ReturnType<WebGPURenderer['getRenderTarget']>;

/** Provides state access only; real pinned RendererUtils and PassNode run without a GPU context. */
function rendererState() {
  const clearColor = new Color().setRGB(0.45, 0.55, 0.65);
  let alpha = 0.75;
  let mrt: MRT = null;
  let target: Target = null;
  let objectFunction: ReturnType<WebGPURenderer['getRenderObjectFunction']> = null;
  let pixelRatio = 1;
  let scissorTest = false;
  const rendered = vi.fn<(scene: Scene) => void>();
  const renderer = {
    toneMapping: NoToneMapping,
    toneMappingExposure: 1,
    outputColorSpace: SRGBColorSpace,
    autoClear: true,
    autoClearColor: true,
    autoClearDepth: true,
    autoClearStencil: true,
    transparent: true,
    opaque: true,
    lighting: null,
    contextNode: context({}),
    getClearColor: (value: Color) => value.copy(clearColor),
    getClearAlpha: () => alpha,
    setClearColor: (value: ColorRepresentation, nextAlpha = 1) => {
      clearColor.set(value);
      alpha = nextAlpha;
    },
    getMRT: () => mrt,
    setMRT: (value: MRT) => {
      mrt = value;
    },
    getRenderTarget: () => target,
    setRenderTarget: (value: Target) => {
      target = value;
    },
    getOutputRenderTarget: () => null,
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    getRenderObjectFunction: () => objectFunction,
    setRenderObjectFunction: (value: typeof objectFunction) => {
      objectFunction = value;
    },
    getPixelRatio: () => pixelRatio,
    setPixelRatio: (value: number) => {
      pixelRatio = value;
    },
    getScissorTest: () => scissorTest,
    setScissorTest: (value: boolean) => {
      scissorTest = value;
    },
    getDrawingBufferSize: (size: { set(width: number, height: number): unknown }) =>
      size.set(32, 32),
    render: rendered,
  } as unknown as WebGPURenderer;
  return { renderer, rendered, clearColor };
}

/** Exercises the upstream lazy pass under the actual upstream temporary black-clear reset. */
function nestedBeautyPass(owner: WebGPURasterPostProcessing, renderer: WebGPURenderer) {
  const scenePass = Reflect.get(owner, 'scenePass') as ScenePass;
  vi.spyOn(RenderPipeline.prototype, 'render').mockImplementation(() => {
    const saved = RendererUtils.saveRendererState(renderer);
    RendererUtils.resetRendererState(renderer, saved);
    try {
      expect(renderer.getClearColor(new Color()).getHex()).toBe(0);
      const frame = new NodeFrame();
      frame.renderer = renderer;
      scenePass.updateBefore(frame);
    } finally {
      RendererUtils.restoreRendererState(renderer, saved);
    }
  });
  return scenePass;
}

afterEach(() => vi.restoreAllMocks());

describe('WebGPU beauty attachment background contract without a GPU', () => {
  test.each([
    { gtao: false, taa: false },
    { gtao: true, taa: false },
    { gtao: false, taa: true },
    { gtao: true, taa: true },
  ])('nested clear reset cannot replace viewport background with $gtao AO/$taa AA', (options) => {
    const { renderer, rendered, clearColor } = rendererState();
    const scene = new Scene();
    const owner = new WebGPURasterPostProcessing(renderer, scene, new PerspectiveCamera(), options);
    const scenePass = nestedBeautyPass(owner, renderer);
    const prePass = Reflect.get(owner, 'prePass') as ScenePass;
    const expected = clearColor.clone();
    rendered.mockImplementation(() => {
      const beautyClear = renderer.getMRT()!.getClearColor('output');
      expect(beautyClear).not.toBeNull();
      expect(beautyClear!.toArray()).toEqual(expected.toArray());
      expect(beautyClear!.a).toBe(0.75);
      expect(renderer.getMRT()!.getClearColor('normal')).toBeNull();
      expect(renderer.getMRT()!.getClearColor('velocity')).toBeNull();
    });
    try {
      owner.render();
      expect(rendered).toHaveBeenCalledOnce();
      expect(renderer.getClearColor(new Color())).toEqual(expected);
      expect(renderer.getClearAlpha()).toBe(0.75);
      expect(scene.background).toBeNull();
      expect(prePass.getMRT()!.getClearColor('output')).toBeNull();
      expect(prePass.getMRT()!.getClearColor('velocity')).toBeNull();
      expect(scenePass.getMRT()!.getClearColor('output')!.toArray()).toEqual(expected.toArray());

      expected.setRGB(0.12, 0.18, 0.24);
      renderer.setClearColor(expected, 0.75);
      owner.render();
      expect(rendered).toHaveBeenCalledTimes(2);
      expect(renderer.getClearColor(new Color())).toEqual(expected);
    } finally {
      owner.dispose();
    }
  });

  test('a scene color retains its opaque priority over the viewport clear', () => {
    const { renderer, rendered, clearColor } = rendererState();
    const originalClear = clearColor.clone();
    const scene = new Scene();
    const background = new Color().setRGB(0.2, 0.3, 0.4);
    scene.background = background;
    const owner = new WebGPURasterPostProcessing(renderer, scene, new PerspectiveCamera(), {
      gtao: true,
      taa: true,
    });
    nestedBeautyPass(owner, renderer);
    rendered.mockImplementation((renderedScene) => {
      expect(renderedScene.background).toBe(background);
      const beautyClear = renderer.getMRT()!.getClearColor('output')!;
      expect(beautyClear.toArray()).toEqual(background.toArray());
      expect(beautyClear.a).toBe(1);
    });
    try {
      owner.render();
      expect(rendered).toHaveBeenCalledOnce();
      expect(scene.background).toBe(background);
      expect(renderer.getClearColor(new Color())).toEqual(originalClear);
      expect(renderer.getClearAlpha()).toBe(0.75);
    } finally {
      owner.dispose();
    }
  });

  test('a panorama remains the borrowed scene background through rendering and disposal', () => {
    const { renderer, rendered, clearColor } = rendererState();
    const expected = clearColor.clone();
    const scene = new Scene();
    const panorama = new Texture();
    const disposePanorama = vi.spyOn(panorama, 'dispose');
    scene.background = panorama;
    scene.environment = panorama;
    const owner = new WebGPURasterPostProcessing(renderer, scene, new PerspectiveCamera(), {
      gtao: true,
      taa: true,
    });
    nestedBeautyPass(owner, renderer);
    rendered.mockImplementation((renderedScene) => {
      expect(renderedScene.background).toBe(panorama);
      expect(renderedScene.environment).toBe(panorama);
      expect(renderer.getMRT()!.getClearColor('output')!.toArray()).toEqual(expected.toArray());
    });
    try {
      owner.render();
      expect(rendered).toHaveBeenCalledOnce();
    } finally {
      owner.dispose();
    }
    expect(scene.background).toBe(panorama);
    expect(scene.environment).toBe(panorama);
    expect(disposePanorama).not.toHaveBeenCalled();
    panorama.dispose();
  });
});
