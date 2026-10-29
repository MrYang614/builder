import type { Material, Object3D, Texture } from 'three';
import type { EzTreeDisposeOptions } from './types';

const DEFAULT_OPTIONS: Required<EzTreeDisposeOptions> = {
  disposeGeometry: true,
  disposeMaterials: true,
  disposeTextures: false,
};

function materialsOf(material: Material | Material[]): Material[] {
  return Array.isArray(material) ? material : [material];
}

function ownedTextures(material: Material): Texture[] {
  const textures: Texture[] = [];
  for (const value of Object.values(material)) {
    if (value && typeof value === 'object' && 'isTexture' in value && value.isTexture) {
      const texture = value as Texture;
      if (texture.userData?.ezTreeAdapterOwned === true) {
        textures.push(texture);
      }
    }
  }
  return textures;
}

/** Releases resources owned by the adapter while preserving upstream shared textures. */
export function disposeEzTreeObject(object: Object3D, options?: EzTreeDisposeOptions): void {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const geometries = new Set<{ dispose(): void }>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const nestedDisposers = new Set<Object3D & { dispose(): void }>();
  object.traverse((child) => {
    const mesh = child as Object3D & {
      geometry?: { dispose(): void };
      material?: Material | Material[];
    };
    if (resolved.disposeGeometry && mesh.geometry) {
      geometries.add(mesh.geometry);
    }
    if (mesh.material) {
      for (const material of materialsOf(mesh.material)) {
        if (resolved.disposeMaterials) {
          materials.add(material);
        }
        if (resolved.disposeTextures) {
          for (const texture of ownedTextures(material)) {
            textures.add(texture);
          }
        }
      }
    }
    if (
      child !== object &&
      child.name === 'Trellis' &&
      typeof (child as Object3D & { dispose?: unknown }).dispose === 'function'
    ) {
      nestedDisposers.add(child as Object3D & { dispose(): void });
    }
  });
  for (const geometry of geometries) {
    geometry.dispose();
  }
  for (const material of materials) {
    material.dispose();
  }
  for (const texture of textures) {
    texture.dispose();
  }
  for (const disposer of nestedDisposers) {
    disposer.dispose();
  }
  object.clear();
}
