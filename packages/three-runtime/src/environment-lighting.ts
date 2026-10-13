import {
  DataTexture,
  DataUtils,
  EquirectangularReflectionMapping,
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  RGBAFormat,
} from 'three';
import type { Texture } from 'three';
import { createPathTracingEnvironmentTexture } from './environment';
import { cleanupAfterFailure, runResourceCleanup } from './resource-cleanup';

const MIN_PMREM_WIDTH = 64;
const MIN_PMREM_HEIGHT = 32;

/** Creates a PMREM-safe lighting copy only for undersized panoramas; original background and path pixels stay borrowed. */
export async function createRasterEnvironmentLighting(
  original: Texture,
): Promise<DataTexture | null> {
  const image = original.image as
    | { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number }
    | undefined;
  const width = image?.naturalWidth ?? image?.width;
  const height = image?.naturalHeight ?? image?.height;
  if (width === undefined || height === undefined) {
    return null;
  }
  if (width >= MIN_PMREM_WIDTH && height >= MIN_PMREM_HEIGHT) {
    return null;
  }
  // Pinned Three PMREM selects cube size from width/4 but samples mip levels no smaller
  // than a 16px face. Independent axis floors keep even narrow/tall valid images bounded.
  const linear = await createPathTracingEnvironmentTexture(original);
  let texture: DataTexture | null = null;
  try {
    const targetWidth = Math.max(width, MIN_PMREM_WIDTH);
    const targetHeight = Math.max(height, MIN_PMREM_HEIGHT);
    const input = linear.image.data as Uint16Array;
    const data = new Uint16Array(targetWidth * targetHeight * 4);
    const sample = (x: number, y: number, channel: number) =>
      DataUtils.fromHalfFloat(input[(y * width + (((x % width) + width) % width)) * 4 + channel]!);
    for (let y = 0; y < targetHeight; y++) {
      const sourceY = Math.max(0, Math.min(height - 1, ((y + 0.5) * height) / targetHeight - 0.5));
      const top = Math.floor(sourceY);
      const bottom = Math.min(height - 1, top + 1);
      const dy = sourceY - top;
      for (let x = 0; x < targetWidth; x++) {
        const sourceX = ((x + 0.5) * width) / targetWidth - 0.5;
        const left = Math.floor(sourceX);
        const dx = sourceX - left;
        for (let channel = 0; channel < 4; channel++) {
          const upper = sample(left, top, channel) * (1 - dx) + sample(left + 1, top, channel) * dx;
          const lower =
            sample(left, bottom, channel) * (1 - dx) + sample(left + 1, bottom, channel) * dx;
          data[(y * targetWidth + x) * 4 + channel] = DataUtils.toHalfFloat(
            upper * (1 - dy) + lower * dy,
          );
        }
      }
    }
    texture = new DataTexture(data, targetWidth, targetHeight, RGBAFormat, HalfFloatType);
    texture.mapping = EquirectangularReflectionMapping;
    texture.colorSpace = LinearSRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = false;
    texture.flipY = original.flipY;
    texture.name = original.name;
    texture.needsUpdate = true;
  } catch (error) {
    cleanupAfterFailure(() =>
      runResourceCleanup([() => texture?.dispose(), () => linear.dispose()]),
    );
    throw error;
  }
  try {
    linear.dispose();
  } catch (error) {
    cleanupAfterFailure(() => texture?.dispose());
    throw error;
  }
  return texture;
}
