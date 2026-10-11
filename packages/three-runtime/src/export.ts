import type { ProjectDocument } from '@building/editor-core';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildBuilding } from './scene';
import { cleanupAfterFailure } from './resource-cleanup';

async function exportSnapshot(
  document: ProjectDocument,
  binary: boolean,
): Promise<ArrayBuffer | object> {
  // Freeze a single revision before loading textures or awaiting the exporter.
  const snapshot = structuredClone(document),
    built = buildBuilding(snapshot);
  let result: ArrayBuffer | object;
  try {
    await built.resources.ready();
    result = await new GLTFExporter().parseAsync(built.root, {
      binary,
      animations: built.animations,
      trs: true,
      onlyVisible: false,
      maxTextureSize: 4096,
    });
    if (binary && !(result instanceof ArrayBuffer)) {
      throw new Error('export.invalidBinary');
    }
  } catch (error) {
    cleanupAfterFailure(() => built.dispose());
    throw error;
  }
  built.dispose();
  return result;
}
export async function exportGLB(document: ProjectDocument): Promise<ArrayBuffer> {
  return (await exportSnapshot(document, true)) as ArrayBuffer;
}
/** The JSON form embeds its binary/image resources, so moving a .gltf never breaks absolute-path references. */
export async function exportGLTF(document: ProjectDocument): Promise<object> {
  return (await exportSnapshot(document, false)) as object;
}
