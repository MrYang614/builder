import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DataTexture,
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  EquirectangularReflectionMapping,
  DataUtils,
  FloatType,
  RGBAFormat,
  SRGBColorSpace,
  Texture,
} from 'three';
import {
  loadEnvironmentTexture,
  createSceneRenderer,
  createDefaultEnvironmentTexture,
  createPathTracingEnvironmentTexture,
} from '@building/three-runtime';
import type { EnvironmentResource } from '@building/editor-core';

const hdr = (): EnvironmentResource => {
  const header = Buffer.from('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 2\n');
  const pixels = Buffer.from([128, 32, 8, 130, 4, 64, 128, 128]);
  return {
    id: 'env-linear',
    name: 'Studio.hdr',
    mime: 'image/vnd.radiance',
    dataUrl: 'data:image/vnd.radiance;base64,' + Buffer.concat([header, pixels]).toString('base64'),
  };
};
afterEach(() => vi.unstubAllGlobals());
describe('environment runtime decoding', () => {
  it('preserves linear HDR dynamic range, orientation and panorama mapping from embedded bytes', async () => {
    const texture = await loadEnvironmentTexture(hdr());
    expect(texture).toBeInstanceOf(DataTexture);
    const image = texture.image as { width: number; height: number; data: Uint16Array };
    expect(image.width).toBe(2);
    expect(image.height).toBe(1);
    expect(texture.type).toBe(HalfFloatType);
    expect(texture.flipY).toBe(true);
    expect(texture.minFilter).toBe(LinearFilter);
    expect(texture.generateMipmaps).toBe(false);
    expect(texture.colorSpace).toBe(LinearSRGBColorSpace);
    expect(texture.mapping).toBe(EquirectangularReflectionMapping);
    expect(DataUtils.fromHalfFloat(image.data[0]!)).toBeGreaterThan(1);
    texture.dispose();
  });
  it('rejects corrupted HDR instead of returning a placeholder texture', async () => {
    await expect(
      loadEnvironmentTexture({
        ...hdr(),
        dataUrl:
          'data:image/vnd.radiance;base64,' + Buffer.from('not a panorama').toString('base64'),
      }),
    ).rejects.toThrow();
  });
  it('reports unavailable WebGPU before allocating a renderer or claiming a backend', async () => {
    vi.stubGlobal('navigator', {});
    await expect(createSceneRenderer('webgpu')).rejects.toThrow('render.webgpuUnsupported');
  });
});

interface EnvironmentUniform {
  map: DataTexture;
  totalSum: number;
  updateFrom(texture: DataTexture): void;
  dispose(): void;
}
async function importanceSampler(): Promise<EnvironmentUniform> {
  // Published JS subpath has no declarations; the interface covers the actual tested API.
  const source = 'three-gpu-pathtracer/src/uniforms/EquirectHdrInfoUniform.js';
  const { EquirectHdrInfoUniform } = await import(source);
  return new EquirectHdrInfoUniform();
}
function rgba(texture: DataTexture): number[] {
  return Array.from(texture.image.data as Uint16Array, (value) => DataUtils.fromHalfFloat(value));
}

describe('owned path-tracing environment pixels without a GPU', () => {
  it('uses a filterable half-float default accepted by the actual importance sampler', async () => {
    const texture = createDefaultEnvironmentTexture();
    const uniform = await importanceSampler();
    expect(texture.type).toBe(HalfFloatType);
    expect(texture.minFilter).toBe(LinearFilter);
    expect(texture.magFilter).toBe(LinearFilter);
    expect(texture.mapping).toBe(EquirectangularReflectionMapping);
    expect(texture.colorSpace).toBe(LinearSRGBColorSpace);
    expect(texture.generateMipmaps).toBe(false);
    expect(texture.image).toMatchObject({ width: 2, height: 1 });
    expect(rgba(texture)).toEqual([
      0.39990234375, 0.39990234375, 0.39990234375, 1, 0.39990234375, 0.39990234375, 0.39990234375,
      1,
    ]);
    uniform.updateFrom(texture);
    expect(uniform.totalSum).toBeGreaterThan(0);
    expect(uniform.map.minFilter).toBe(LinearFilter);
    expect(uniform.map.magFilter).toBe(LinearFilter);
    uniform.dispose();
    texture.dispose();
  });

  it('copies HDR pixels and orientation while leaving the borrowed source and filters unchanged', async () => {
    const original = (await loadEnvironmentTexture(hdr())) as DataTexture;
    const source = original.source,
      image = original.image;
    const bytes = Array.from(image.data!);
    const originalVersion = original.version;
    const dispose = vi.spyOn(original, 'dispose');
    const derived = await createPathTracingEnvironmentTexture(original);
    expect(derived).not.toBe(original);
    expect(derived.source).not.toBe(source);
    expect(derived.image.data).not.toBe(image.data);
    expect(derived.flipY).toBe(original.flipY);
    expect(rgba(derived)[0]).toBeGreaterThan(1);
    const uniform = await importanceSampler();
    uniform.updateFrom(derived);
    expect(uniform.totalSum).toBeGreaterThan(0);
    uniform.dispose();
    derived.dispose();
    expect(dispose).not.toHaveBeenCalled();
    expect(original.source).toBe(source);
    expect(original.image).toBe(image);
    expect(Array.from(image.data!)).toEqual(bytes);
    expect(original.version).toBe(originalVersion);
    original.dispose();
  });

  it('preserves a floating-point HDR range and lets upstream flip only its owned pixels', async () => {
    const pixels = new Float32Array([2, 0.5, 0.25, 0.75, 4, 1, 0, 1]);
    const original = new DataTexture(pixels, 1, 2, RGBAFormat, FloatType);
    original.colorSpace = LinearSRGBColorSpace;
    original.flipY = true;
    const originalFilters = [original.minFilter, original.magFilter];
    const derived = await createPathTracingEnvironmentTexture(original);
    expect(rgba(derived)).toEqual(Array.from(pixels));
    const uniform = await importanceSampler();
    uniform.updateFrom(derived);
    expect(rgba(uniform.map)).toEqual([4, 1, 0, 1, 2, 0.5, 0.25, 0.75]);
    expect(uniform.map.flipY).toBe(false);
    expect(rgba(derived)).toEqual(Array.from(pixels));
    expect(original.flipY).toBe(true);
    expect([original.minFilter, original.magFilter]).toEqual(originalFilters);
    uniform.dispose();
    derived.dispose();
    original.dispose();
  });

  it.each([
    {
      mime: 'image/png',
      pixels: [128, 64, 32, 128, 255, 0, 0, 255],
      expected: [0.21586, 0.05127, 0.01444, 128 / 255, 1, 0, 0, 1],
    },
    {
      mime: 'image/jpeg',
      pixels: [200, 100, 50, 255, 0, 255, 0, 255],
      expected: [0.57758, 0.12744, 0.0319, 1, 0, 1, 0, 1],
    },
  ])(
    'turns decoded $mime into linear RGBA for the real importance sampler',
    async ({ mime, pixels, expected }) => {
      // Node has no image decoder or Canvas2D. This unit owns only the browser readback boundary;
      // production conversion and upstream importance sampling run unchanged with known decoded pixels.
      const decode = vi.fn(async () => {});
      const image = {
        width: 2,
        height: 1,
        naturalWidth: 2,
        naturalHeight: 1,
        src: `data:${mime};base64,fixture`,
        decode,
      };
      const readback = new Uint8ClampedArray(pixels);
      const drawImage = vi.fn();
      const getImageData = vi.fn(() => ({ data: readback }));
      const getContext = vi.fn(() => ({ drawImage, getImageData }));
      vi.stubGlobal('document', {
        createElement: vi.fn(() => ({ width: 0, height: 0, getContext })),
      });
      const original = new Texture(image);
      original.colorSpace = SRGBColorSpace;
      original.name = `Panorama.${mime === 'image/png' ? 'png' : 'jpg'}`;
      const source = original.source,
        filters = [original.minFilter, original.magFilter];
      const dispose = vi.spyOn(original, 'dispose');
      const derived = await createPathTracingEnvironmentTexture(original);
      expect(decode).toHaveBeenCalledOnce();
      expect(getContext).toHaveBeenCalledWith('2d', {
        willReadFrequently: true,
        colorSpace: 'srgb',
      });
      expect(drawImage).toHaveBeenCalledWith(image, 0, 0, 2, 1);
      expect(getImageData).toHaveBeenCalledWith(0, 0, 2, 1);
      rgba(derived).forEach((channel, index) => expect(channel).toBeCloseTo(expected[index]!, 3));
      expect(derived.colorSpace).toBe(LinearSRGBColorSpace);
      expect(derived.type).toBe(HalfFloatType);
      expect(derived.flipY).toBe(original.flipY);
      expect(derived.name).toBe(original.name);
      const uniform = await importanceSampler();
      uniform.updateFrom(derived);
      expect(uniform.totalSum).toBeGreaterThan(0);
      expect(uniform.map.magFilter).toBe(LinearFilter);
      expect(original.source).toBe(source);
      expect(original.image).toBe(image);
      expect(original.colorSpace).toBe(SRGBColorSpace);
      expect([original.minFilter, original.magFilter]).toEqual(filters);
      expect(Array.from(readback)).toEqual(pixels);
      uniform.dispose();
      derived.dispose();
      expect(dispose).not.toHaveBeenCalled();
      original.dispose();
    },
  );

  it('reports unavailable browser readback instead of a placeholder or mutating the image', async () => {
    const image = { width: 2, height: 1 };
    const original = new Texture(image);
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
    await expect(createPathTracingEnvironmentTexture(original)).rejects.toThrow(
      'render.environmentFailed',
    );
    expect(original.image).toBe(image);
    original.dispose();
  });
});
