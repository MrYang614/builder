import type { ProjectDocument } from '@building/editor-core';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildBuilding } from './scene';

async function exportSnapshot(
  document: ProjectDocument,
  binary: boolean,
): Promise<ArrayBuffer | object> {
  // Freeze a single revision before loading textures or awaiting the exporter.
  const snapshot = structuredClone(document),
    built = buildBuilding(snapshot);
  try {
    await built.resources.ready();
    const result = await new GLTFExporter().parseAsync(built.root, {
      binary,
      animations: built.animations,
      trs: true,
      onlyVisible: false,
      maxTextureSize: 4096,
    });
    if (binary && !(result instanceof ArrayBuffer)) {
      throw new Error('export.invalidBinary');
    }
    return result;
  } finally {
    built.dispose();
  }
}
export async function exportGLB(document: ProjectDocument): Promise<ArrayBuffer> {
  return (await exportSnapshot(document, true)) as ArrayBuffer;
}
/** The JSON form embeds its binary/image resources, so moving a .gltf never breaks absolute-path references. */
export async function exportGLTF(document: ProjectDocument): Promise<object> {
  return (await exportSnapshot(document, false)) as object;
}
