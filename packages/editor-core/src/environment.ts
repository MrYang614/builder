import type { EnvironmentResource } from './model';

export const ENVIRONMENT_LIMITS = Object.freeze({
  maxBytes: 64 * 1024 * 1024,
  maxDimension: 8192,
  maxPixels: 32 * 1024 * 1024,
  maxResources: 128,
});
export interface EnvironmentMetadata {
  mime: EnvironmentResource['mime'];
  width: number;
  height: number;
}
export class EnvironmentAssetError extends Error {
  readonly code: string;
  constructor(code: string, details: string) {
    super(details);
    this.code = code;
  }
}
function invalid(details: string): never {
  throw new EnvironmentAssetError('environment.invalidAsset', details);
}
function dimensions(
  width: number,
  height: number,
  mime: EnvironmentResource['mime'],
): EnvironmentMetadata {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    return invalid('Invalid environment image dimensions');
  }
  if (
    width > ENVIRONMENT_LIMITS.maxDimension ||
    height > ENVIRONMENT_LIMITS.maxDimension ||
    width * height > ENVIRONMENT_LIMITS.maxPixels
  ) {
    throw new EnvironmentAssetError(
      'environment.assetTooLarge',
      'Environment limit: 8192 per side, 32 million pixels',
    );
  }
  return { mime, width, height };
}
/** Bounded header inspection precedes any decoder allocation; no DOM or renderer dependency. */
export function inspectEnvironmentBytes(bytes: Uint8Array): EnvironmentMetadata {
  if (!bytes.length || bytes.length > ENVIRONMENT_LIMITS.maxBytes) {
    throw new EnvironmentAssetError(
      'environment.assetTooLarge',
      'Environment file limit is 64 MiB',
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length >= 24 &&
    bytes[0] === 137 &&
    bytes[1] === 80 &&
    bytes[2] === 78 &&
    bytes[3] === 71 &&
    view.getUint32(4) === 0x0d0a1a0a &&
    view.getUint32(12) === 0x49484452
  ) {
    return dimensions(view.getUint32(16), view.getUint32(20), 'image/png');
  }
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) {
        return invalid('Invalid JPEG marker');
      }
      while (bytes[offset] === 255) {
        offset++;
      }
      const marker = bytes[offset++]!;
      if (marker === 217 || marker === 218) {
        break;
      }
      if (marker === 1 || (marker >= 208 && marker <= 215)) {
        continue;
      }
      if (offset + 2 > bytes.length) {
        break;
      }
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) {
        break;
      }
      if (
        [192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) &&
        length >= 8
      ) {
        return dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3), 'image/jpeg');
      }
      offset += length;
    }
    return invalid('Missing JPEG dimensions');
  }
  if (bytes.length >= 12 && view.getUint32(0, true) === 20000630) {
    const headerLimit = Math.min(bytes.length, 65536);
    let offset = 8;
    let size: EnvironmentMetadata | undefined;
    const text = (): string => {
      const start = offset;
      while (offset < headerLimit && bytes[offset] !== 0) {
        offset++;
      }
      if (offset >= headerLimit || offset - start > 255) {
        return invalid('Invalid EXR attribute name');
      }
      const value = String.fromCharCode(...bytes.subarray(start, offset));
      offset++;
      return value;
    };
    while (offset < headerLimit) {
      const name = text();
      if (!name) {
        if (!size || offset + 8 >= bytes.length) {
          return invalid('Incomplete EXR image');
        }
        return size;
      }
      const type = text();
      if (offset + 4 > headerLimit) {
        return invalid('Truncated EXR attribute');
      }
      const length = view.getUint32(offset, true);
      offset += 4;
      if (offset + length > headerLimit) {
        return invalid('EXR header exceeds 64 KiB');
      }
      if (name === 'dataWindow' && type === 'box2i' && length === 16) {
        size = dimensions(
          view.getInt32(offset + 8, true) - view.getInt32(offset, true) + 1,
          view.getInt32(offset + 12, true) - view.getInt32(offset + 4, true) + 1,
          'image/x-exr',
        );
      }
      offset += length;
    }
    return invalid('Missing EXR data window');
  }
  if (bytes[0] === 35 && bytes[1] === 63) {
    const header = String.fromCharCode(...bytes.subarray(0, Math.min(bytes.length, 65536)));
    if (
      !/^#\?(?:RADIANCE|RGBE)\r?\n/.test(header) ||
      !/(?:^|\n)FORMAT=32-bit_rle_rgbe\r?\n/.test(header)
    ) {
      return invalid('Unsupported Radiance HDR header');
    }
    const resolution = /(?:^|\n)[+-]Y\s+(\d+)\s+[+-]X\s+(\d+)\r?\n/.exec(header);
    if (!resolution || resolution.index + resolution[0].length >= bytes.length) {
      return invalid('Incomplete Radiance HDR image');
    }
    return dimensions(Number(resolution[2]), Number(resolution[1]), 'image/vnd.radiance');
  }
  return invalid('Use a Radiance HDR, EXR, PNG or JPEG panorama');
}
/** Strict base64 decoding usable in the DOM-free domain package. */
export function environmentResourceBytes(resource: EnvironmentResource): Uint8Array {
  const prefix = `data:${resource.mime};base64,`;
  if (typeof resource.dataUrl !== 'string' || !resource.dataUrl.startsWith(prefix)) {
    return invalid('Environment bytes must be embedded');
  }
  const encoded = resource.dataUrl.slice(prefix.length);
  if (encoded.length > Math.ceil(ENVIRONMENT_LIMITS.maxBytes / 3) * 4) {
    throw new EnvironmentAssetError(
      'environment.assetTooLarge',
      'Environment file limit is 64 MiB',
    );
  }
  if (!encoded.length || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    return invalid('Invalid environment base64');
  }
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const length = (encoded.length / 4) * 3 - padding;
  if (length > ENVIRONMENT_LIMITS.maxBytes) {
    throw new EnvironmentAssetError(
      'environment.assetTooLarge',
      'Environment file limit is 64 MiB',
    );
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (let index = 0; index < encoded.length; index += 4) {
    const value =
      (alphabet.indexOf(encoded[index]!) << 18) |
      (alphabet.indexOf(encoded[index + 1]!) << 12) |
      (Math.max(0, alphabet.indexOf(encoded[index + 2]!)) << 6) |
      Math.max(0, alphabet.indexOf(encoded[index + 3]!));
    for (const shift of [16, 8, 0]) {
      if (offset < length) {
        bytes[offset++] = (value >>> shift) & 255;
      }
    }
  }
  return bytes;
}
/** Maps validated environment MIME to the portable asset extension used by container writers. */
export function environmentExtension(
  mime: EnvironmentResource['mime'],
): 'hdr' | 'exr' | 'png' | 'jpg' {
  switch (mime) {
    case 'image/vnd.radiance':
      return 'hdr';
    case 'image/x-exr':
      return 'exr';
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
  }
}
