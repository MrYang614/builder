import {
  DataTexture,
  DataUtils,
  FloatType,
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  RGBAFormat,
} from 'three';
import { afterEach, describe, expect, test, vi } from 'vitest';
import * as environment from '../packages/three-runtime/src/environment';
import { createRasterEnvironmentLighting } from '../packages/three-runtime/src/environment-lighting';

afterEach(() => vi.restoreAllMocks());

function panorama(width: number, height: number) {
  const pixels = new Float32Array(width * height * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels.set([8, 2, 0.5, 1], index);
  }
  const texture = new DataTexture(pixels, width, height, RGBAFormat, FloatType);
  texture.colorSpace = LinearSRGBColorSpace;
  texture.flipY = true;
  texture.name = 'Original HDR';
  return texture;
}

describe('PMREM-safe raster lighting pixels', () => {
  test.each([
    [4, 2, 64, 32],
    [64, 2, 64, 32],
    [1, 8192, 64, 8192],
  ])(
    'independently floors %ix%i input to %ix%i without changing source or HDR range',
    async (width, height, targetWidth, targetHeight) => {
      const original = panorama(width, height);
      const source = original.source;
      const image = original.image;
      const bytes = Array.from(image.data!);
      const originalDispose = vi.spyOn(original, 'dispose');
      const lighting = await createRasterEnvironmentLighting(original);
      expect(lighting).not.toBeNull();
      expect(lighting!.image).toMatchObject({ width: targetWidth, height: targetHeight });
      expect(lighting!.source).not.toBe(source);
      expect(lighting!.type).toBe(HalfFloatType);
      expect(lighting!.minFilter).toBe(LinearFilter);
      expect(lighting!.magFilter).toBe(LinearFilter);
      expect(lighting!.colorSpace).toBe(LinearSRGBColorSpace);
      expect(lighting!.flipY).toBe(original.flipY);
      expect(lighting!.name).toBe(original.name);
      const pixels = Array.from(lighting!.image.data as Uint16Array, (value) =>
        DataUtils.fromHalfFloat(value),
      );
      expect(pixels.every(Number.isFinite)).toBe(true);
      expect(pixels.slice(0, 4)).toEqual([8, 2, 0.5, 1]);
      expect(pixels.slice(-4)).toEqual([8, 2, 0.5, 1]);
      lighting!.dispose();
      expect(original.source).toBe(source);
      expect(original.image).toBe(image);
      expect(Array.from(image.data!)).toEqual(bytes);
      expect(originalDispose).not.toHaveBeenCalled();
      original.dispose();
    },
  );

  test('normal-resolution panoramas reuse their original texture without a conversion allocation', async () => {
    const original = panorama(64, 32);
    const convert = vi.spyOn(environment, 'createPathTracingEnvironmentTexture');
    expect(await createRasterEnvironmentLighting(original)).toBeNull();
    expect(convert).not.toHaveBeenCalled();
    original.dispose();
  });

  test('scratch disposal failure releases the untransferred lighting texture and retains the first failure', async () => {
    const original = panorama(4, 2);
    const linear = new DataTexture(
      new Uint16Array(32).fill(DataUtils.toHalfFloat(1)),
      4,
      2,
      RGBAFormat,
      HalfFloatType,
    );
    vi.spyOn(environment, 'createPathTracingEnvironmentTexture').mockResolvedValue(linear);
    const primary = new Error('scratch disposal failed');
    vi.spyOn(linear, 'dispose').mockImplementation(() => {
      throw primary;
    });
    const nativeDispose = DataTexture.prototype.dispose;
    const releases: DataTexture[] = [];
    vi.spyOn(DataTexture.prototype, 'dispose').mockImplementation(function (this: DataTexture) {
      releases.push(this);
      nativeDispose.call(this);
    });
    await expect(createRasterEnvironmentLighting(original)).rejects.toBe(primary);
    expect(releases).toHaveLength(1);
    expect(releases[0]).not.toBe(original);
    expect(releases[0]).not.toBe(linear);
    expect(releases[0]!.image).toMatchObject({ width: 64, height: 32 });
    original.dispose();
  });

  test('an earlier sampling failure survives a secondary scratch cleanup failure', async () => {
    const original = panorama(4, 2);
    const linear = new DataTexture(new Uint16Array(32), 4, 2, RGBAFormat, HalfFloatType);
    vi.spyOn(environment, 'createPathTracingEnvironmentTexture').mockResolvedValue(linear);
    const primary = new Error('sampling failed');
    const secondary = new Error('cleanup failed');
    vi.spyOn(DataUtils, 'fromHalfFloat').mockImplementation(() => {
      throw primary;
    });
    vi.spyOn(linear, 'dispose').mockImplementation(() => {
      throw secondary;
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(createRasterEnvironmentLighting(original)).rejects.toBe(primary);
    expect(warning).toHaveBeenCalledOnce();
    original.dispose();
  });
});
