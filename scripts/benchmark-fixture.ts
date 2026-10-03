import { deflateSync } from 'node:zlib';
import {
  createEmptyProject,
  createWall,
  createOpening,
  createSlab,
  validateDocument,
} from '@building/editor-core';
import type { ProjectDocument, Resource } from '@building/editor-core';

// Generated originals: no external copyrighted image or network resource is required.
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const name = Buffer.from(type, 'ascii'),
    checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}
export function imageResource(index: number): Resource {
  const width = 2048,
    height = 2048,
    stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    for (let x = 0; x < width; x += 1) {
      const mortar = y % 96 < 6 || (x + (Math.floor(y / 96) % 2) * 96) % 192 < 6;
      const value = mortar ? 170 : 80 + ((x * 3 + y * 5 + index * 13) % 90);
      raw[row + 1 + x * 3] = Math.min(255, value + index * 3);
      raw[row + 2 + x * 3] = Math.min(255, value + index * 2);
      raw[row + 3 + x * 3] = Math.min(255, value + index);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return {
    id: `benchmark_image_${index}`,
    name: `original-brick-${index}.png`,
    mime: 'image/png',
    dataUrl: `data:image/png;base64,${png.toString('base64')}`,
  };
}
export function fixedProject(): ProjectDocument {
  const document = createEmptyProject('PRD 3 floors / 100 walls / 60 openings / 20 images');
  document.id = 'benchmark_project';
  document.levels.push(
    { id: 'level_2', name: '2', elevation: 3, height: 3 },
    { id: 'level_3', name: '3', elevation: 6, height: 3 },
  );
  document.resources = Array.from({ length: 20 }, (_, index) => imageResource(index));
  let wallNumber = 0,
    openingNumber = 0,
    slabNumber = 0;
  for (let levelIndex = 0; levelIndex < 3; levelIndex += 1) {
    const level = document.levels[levelIndex]!;
    for (let room = 0; room < 8; room += 1) {
      const x = (room % 4) * 7,
        z = Math.floor(room / 4) * 6;
      const points = [
        { x, z },
        { x: x + 4.8, z },
        { x: x + 4.8, z: z + 3.6 },
        { x, z: z + 3.6 },
      ];
      for (let edge = 0; edge < 4; edge += 1) {
        const wall = createWall(level.id, points[edge]!, points[(edge + 1) % 4]!);
        wall.id = `benchmark_wall_${wallNumber++}`;
        const resource = document.resources[(room + levelIndex * 8) % document.resources.length]!;
        wall.materials.A = { ...wall.materials.A, resourceId: resource.id, color: '#ffffff' };
        wall.materials.B = { ...wall.materials.B, resourceId: resource.id, color: '#ffffff' };
        document.walls.push(wall);
        if (room < 5) {
          const opening = createOpening(wall, edge % 2 ? 'window' : 'door', 1.0);
          opening.id = `benchmark_opening_${openingNumber++}`;
          if (edge === 2) {
            opening.hinge = 'right';
            opening.direction = -1;
          }
          document.openings.push(opening);
        }
      }
      const slab = createSlab(level.id, points[0]!, points[2]!, level.elevation);
      slab.id = `benchmark_slab_${slabNumber++}`;
      document.slabs.push(slab);
    }
    const extra = levelIndex === 0 ? 2 : 1;
    for (let i = 0; i < extra; i += 1) {
      const wall = createWall(level.id, { x: 35, z: i * 4 }, { x: 39.2, z: i * 4 });
      wall.id = `benchmark_wall_${wallNumber++}`;
      document.walls.push(wall);
    }
  }
  const validation = validateDocument(document);
  if (!validation.ok) {
    throw new Error(JSON.stringify(validation.error));
  }
  return document;
}
