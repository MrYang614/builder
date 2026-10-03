import {
  DataTexture,
  HalfFloatType,
  EquirectangularReflectionMapping,
  SRGBColorSpace,
  LinearSRGBColorSpace,
  LinearFilter,
  RGBAFormat,
  FloatType,
  UnsignedByteType,
  DataUtils,
  Color,
  TextureLoader,
  type Texture,
} from 'three';
import type { EnvironmentResource } from '@building/editor-core';

function linearPanorama(data: Uint16Array, width: number, height: number): DataTexture {
  const texture = new DataTexture(data, width, height, RGBAFormat, HalfFloatType);
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = LinearSRGBColorSpace;
  // Published WebGPU environment shaders use textureSampleLevel explicitly. Nearest-only
  // textures omit their sampler binding in Three's WGSL builder, even for half-float data.
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** An owned linear default environment, independent of the formal document or visible scene. */
export function createDefaultEnvironmentTexture(): DataTexture {
  const data = new Uint16Array(8);
  for (let index = 0; index < data.length; index++) {
    data[index] = DataUtils.toHalfFloat(index % 4 === 3 ? 1 : 0.4);
  }
  return linearPanorama(data, 2, 1);
}

interface PanoramaImage {
  width: number;
  height: number;
  naturalWidth?: number;
  naturalHeight?: number;
  decode?: () => Promise<void>;
}

/**
 * Creates owned linear RGBA pixels for both published path-tracing backends. Their importance
 * sampler reads image.data on the CPU; an ordinary TextureLoader image does not provide it.
 * Original embedded bytes, texture/source objects, filters, orientation and color space are kept.
 */
export async function createPathTracingEnvironmentTexture(original: Texture): Promise<DataTexture> {
  let width: number;
  let height: number;
  let pixels: Uint8Array | Uint8ClampedArray | Uint16Array | Float32Array;
  let type = original.type;
  let colorSpace = original.colorSpace;
  if (original instanceof DataTexture) {
    const image = original.image;
    width = image.width;
    height = image.height;
    if (
      original.format !== RGBAFormat ||
      !(
        image.data instanceof Uint8Array ||
        image.data instanceof Uint8ClampedArray ||
        image.data instanceof Uint16Array ||
        image.data instanceof Float32Array
      )
    ) {
      throw new Error('render.environmentFailed');
    }
    pixels = image.data;
  } else {
    const image = original.image as PanoramaImage;
    await image.decode?.();
    width = image.naturalWidth ?? image.width;
    height = image.naturalHeight ?? image.height;
    if (
      typeof document === 'undefined' ||
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < 1 ||
      height < 1
    ) {
      throw new Error('render.environmentFailed');
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
    if (!context) {
      throw new Error('render.environmentFailed');
    }
    // Read decoded PNG/JPEG in sRGB, without changing or replacing the original image/source.
    try {
      context.drawImage(original.image as CanvasImageSource, 0, 0, width, height);
      pixels = context.getImageData(0, 0, width, height).data;
    } finally {
      // Release the temporary readback surface immediately; the returned pixel array is owned.
      canvas.width = 0;
      canvas.height = 0;
    }
    type = UnsignedByteType;
    colorSpace = SRGBColorSpace;
  }
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    pixels.length !== width * height * 4 ||
    !(
      (type === HalfFloatType && pixels instanceof Uint16Array) ||
      (type === FloatType && pixels instanceof Float32Array) ||
      (type === UnsignedByteType &&
        (pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray))
    )
  ) {
    throw new Error('render.environmentFailed');
  }
  const data = new Uint16Array(pixels.length);
  const color = new Color();
  const read = (index: number): number => {
    const value = pixels[index]!;
    return type === HalfFloatType
      ? DataUtils.fromHalfFloat(value)
      : type === UnsignedByteType
        ? value / 255
        : value;
  };
  for (let index = 0; index < pixels.length; index += 4) {
    color.r = read(index);
    color.g = read(index + 1);
    color.b = read(index + 2);
    if (colorSpace === SRGBColorSpace) {
      color.convertSRGBToLinear();
    }
    data[index] = DataUtils.toHalfFloat(color.r);
    data[index + 1] = DataUtils.toHalfFloat(color.g);
    data[index + 2] = DataUtils.toHalfFloat(color.b);
    data[index + 3] = DataUtils.toHalfFloat(read(index + 3));
  }
  const texture = linearPanorama(data, width, height);
  texture.name = original.name;
  texture.flipY = original.flipY;
  return texture;
}

/** The imported bytes are project resources. This loader never references an original disk path. */
export async function loadEnvironmentTexture(resource: EnvironmentResource): Promise<Texture> {
  let texture: Texture;
  if (resource.mime === 'image/vnd.radiance' || resource.mime === 'image/x-exr') {
    const data = await fetch(resource.dataUrl).then((response) => response.arrayBuffer());
    const parsed = await (async () => {
      if (resource.mime === 'image/vnd.radiance') {
        const { HDRLoader } = await import('three/examples/jsm/loaders/HDRLoader.js');
        return new HDRLoader().setDataType(HalfFloatType).parse(data);
      }
      const { EXRLoader } = await import('three/examples/jsm/loaders/EXRLoader.js');
      return new EXRLoader().setDataType(HalfFloatType).parse(data);
    })();
    texture = new DataTexture(parsed.data, parsed.width, parsed.height, parsed.format, parsed.type);
    texture.colorSpace = parsed.colorSpace ?? LinearSRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = false;
    texture.flipY = parsed.flipY ?? false;
    texture.needsUpdate = true;
  } else {
    texture = await new TextureLoader().loadAsync(resource.dataUrl);
    texture.colorSpace = SRGBColorSpace;
  }
  texture.mapping = EquirectangularReflectionMapping;
  texture.name = resource.name;
  return texture;
}
