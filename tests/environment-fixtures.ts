/** Original tiny panoramas; each is decoded by both Three.js and Rust image in tests. */
import type { EnvironmentResource } from '@building/editor-core';

export function hdrPanorama(): Uint8Array {
  return new Uint8Array(
    Buffer.concat([
      Buffer.from('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2 +X 4\n'),
      Buffer.from([
        128, 64, 32, 129, 64, 128, 32, 129, 32, 64, 128, 129, 128, 128, 128, 129, 128, 64, 32, 129,
        64, 128, 32, 129, 32, 64, 128, 129, 128, 128, 128, 129,
      ]),
    ]),
  );
}
export function exrPanorama(): Uint8Array {
  const integer = (...values: number[]) => {
    const bytes = Buffer.alloc(values.length * 4);
    values.forEach((value, index) => bytes.writeInt32LE(value, index * 4));
    return bytes;
  };
  const floats = (...values: number[]) => {
    const bytes = Buffer.alloc(values.length * 4);
    values.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
    return bytes;
  };
  const attribute = (name: string, type: string, data: Buffer) =>
    Buffer.concat([Buffer.from(`${name}\0${type}\0`), integer(data.length), data]);
  const channels = Buffer.concat(
    ['B', 'G', 'R'].map((name) =>
      Buffer.concat([Buffer.from(`${name}\0`), integer(2), Buffer.alloc(4), integer(1, 1)]),
    ),
  );
  const header = Buffer.concat([
    integer(20000630, 2),
    attribute('channels', 'chlist', Buffer.concat([channels, Buffer.alloc(1)])),
    attribute('compression', 'compression', Buffer.alloc(1)),
    attribute('dataWindow', 'box2i', integer(0, 0, 3, 1)),
    attribute('displayWindow', 'box2i', integer(0, 0, 3, 1)),
    attribute('lineOrder', 'lineOrder', Buffer.alloc(1)),
    attribute('pixelAspectRatio', 'float', floats(1)),
    attribute('screenWindowCenter', 'v2f', floats(0, 0)),
    attribute('screenWindowWidth', 'float', floats(1)),
    Buffer.alloc(1),
  ]);
  const chunks = [0, 1].map((y) =>
    Buffer.concat([
      integer(y, 48),
      floats(0.2, 0.2, 0.2, 0.2, 0.4, 0.4, 0.4, 0.4, 0.8, 0.8, 0.8, 0.8),
    ]),
  );
  const offsets = Buffer.alloc(16);
  offsets.writeBigUInt64LE(BigInt(header.length + 16));
  offsets.writeBigUInt64LE(BigInt(header.length + 16 + chunks[0]!.length), 8);
  return new Uint8Array(Buffer.concat([header, offsets, ...chunks]));
}
export function environmentFixture(
  mime: EnvironmentResource['mime'] = 'image/vnd.radiance',
): EnvironmentResource {
  const bytes = mime === 'image/x-exr' ? exrPanorama() : hdrPanorama();
  return {
    id: mime === 'image/x-exr' ? 'environment_exr' : 'environment_hdr',
    name: mime === 'image/x-exr' ? '全景.exr' : '全景.hdr',
    mime,
    dataUrl: `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`,
  };
}
