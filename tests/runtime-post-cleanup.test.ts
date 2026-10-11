import * as THREE from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { RasterPostProcessing } from '../packages/three-runtime/src/postprocessing';
import { WebGPURasterPostProcessing } from '../packages/three-runtime/src/webgpu-postprocessing';
import type { WebGLTemporalAAPass } from '../packages/three-runtime/src/webgl-taa';
import { disposeSceneRenderer } from '@building/three-runtime';

type Disposable = { dispose(): void };

function resources(owner: object, keys: string[]): Disposable[] {
  return keys.map((key) => Reflect.get(owner, key) as Disposable);
}
function taaResources(owner: WebGLTemporalAAPass): Disposable[] {
  return [
    ...resources(owner, ['sceneTarget']),
    ...(Reflect.get(owner, 'historyTargets') as Disposable[]),
    ...resources(owner, ['temporalMaterial', 'copyMaterial', 'quad']),
  ];
}
function injectDisposeFailure(resource: Disposable): void {
  const native = resource as THREE.WebGLRenderTarget;
  native.addEventListener('dispose', () => {
    throw new Error('injected native disposal event failure');
  });
}
function assertDisposal(owner: Disposable, owned: Disposable[]): void {
  const disposers = owned.map((resource) => vi.spyOn(resource, 'dispose'));
  expect(() => owner.dispose()).toThrow(AggregateError);
  for (const release of disposers) {
    expect(release).toHaveBeenCalledOnce();
  }
  expect(() => owner.dispose()).not.toThrow();
  for (const release of disposers) {
    expect(release).toHaveBeenCalledOnce();
  }
}

afterEach(() => vi.restoreAllMocks());

describe('native post-processing allocation owners without a GPU context', () => {
  test.each(['composer', 'gtao', 'taa', 'output'] as const)(
    '%s disposal failure still releases every WebGL target, shader and quad',
    (fault) => {
      const renderer = {
        getPixelRatio: () => 1,
        getSize: (size: THREE.Vector2) => size.set(1, 1),
      } as THREE.WebGLRenderer;
      const owner = new RasterPostProcessing(
        renderer,
        new THREE.Scene(),
        new THREE.PerspectiveCamera(),
        { gtao: true, taa: true },
      );
      const composer = Reflect.get(owner, 'composer');
      const gtao = Reflect.get(owner, 'gtaoPass');
      const taa = Reflect.get(owner, 'taaPass') as WebGLTemporalAAPass;
      const output = Reflect.get(owner, 'outputPass');
      const owned = [
        ...resources(composer, ['renderTarget1', 'renderTarget2']),
        ...resources(Reflect.get(composer, 'copyPass'), ['material', '_fsQuad']),
        ...resources(gtao, [
          'gtaoNoiseTexture',
          'pdNoiseTexture',
          'normalRenderTarget',
          'gtaoRenderTarget',
          'pdRenderTarget',
          'normalMaterial',
          'gtaoMaterial',
          'pdMaterial',
          'copyMaterial',
          'depthRenderMaterial',
          'blendMaterial',
          '_fsQuad',
        ]),
        ...taaResources(taa),
        ...resources(output, ['material', '_fsQuad']),
      ];
      const target = {
        composer: Reflect.get(composer, 'renderTarget1'),
        gtao: Reflect.get(gtao, 'normalRenderTarget'),
        taa: Reflect.get(taa, 'sceneTarget'),
        output: Reflect.get(output, 'material'),
      }[fault] as Disposable;
      injectDisposeFailure(target);
      assertDisposal(owner, owned);
    },
  );

  test.each(['node', 'ao', 'taa'] as const)(
    '%s disposal failure still releases every TSL target, shader and owned noise texture',
    (fault) => {
      const renderer = {
        toneMapping: THREE.NoToneMapping,
        outputColorSpace: THREE.SRGBColorSpace,
      } as WebGPURenderer;
      const owner = new WebGPURasterPostProcessing(
        renderer,
        new THREE.Scene(),
        new THREE.PerspectiveCamera(),
        { gtao: true, taa: true },
      );
      const pre = Reflect.get(owner, 'prePass');
      const scene = Reflect.get(owner, 'scenePass');
      const ao = Reflect.get(owner, 'aoPass');
      const taa = Reflect.get(owner, 'taaPass');
      const owned = [
        ...resources(owner, ['pipeline']),
        ...resources(pre, ['renderTarget']),
        ...resources(scene, ['renderTarget']),
        ...resources(ao, ['_aoRenderTarget', '_noiseTexture', '_material']),
        ...resources(taa, ['_historyRenderTarget', '_resolveRenderTarget', '_resolveMaterial']),
      ];
      const target = {
        node: pre,
        ao: Reflect.get(ao, '_aoRenderTarget'),
        taa: Reflect.get(taa, '_historyRenderTarget'),
      }[fault] as Disposable;
      injectDisposeFailure(target);
      assertDisposal(owner, owned);
    },
  );

  test('WebGL teardown loses the native context while retaining the first disposal failure', async () => {
    const primary = new Error('renderer disposal primary failure');
    const secondary = new Error('context loss secondary failure');
    const renderer = {
      dispose: vi.fn(() => {
        throw primary;
      }),
      forceContextLoss: vi.fn(() => {
        throw secondary;
      }),
    };
    Object.setPrototypeOf(renderer, THREE.WebGLRenderer.prototype);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(disposeSceneRenderer(renderer as unknown as THREE.WebGLRenderer)).rejects.toBe(
      primary,
    );
    expect(renderer.forceContextLoss).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledOnce();
  });
});
