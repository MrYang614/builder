import {
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from 'three';
import type { ProjectDocument, SurfaceBinding } from '@building/editor-core';
import { cleanupAfterFailure, runResourceCleanup } from './resource-cleanup';

interface MaterialEntry {
  material: MeshStandardMaterial;
  refs: number;
  textureId?: string;
}
interface TextureEntry {
  texture: Texture;
  refs: number;
  loaded: Promise<void>;
}
export interface MaterialLease {
  material: MeshStandardMaterial;
  release(): void;
}

/** One explicit owner for cached project materials and their shared GPU textures. */
export class ResourcePool {
  private document: ProjectDocument;
  private materials = new Map<string, MaterialEntry>();
  private textures = new Map<string, TextureEntry>();
  private resourceVersions = new Map<string, { dataUrl: string; version: number }>();
  private nextResourceVersion = 0;
  private disposed = false;
  constructor(document: ProjectDocument) {
    this.document = document;
  }
  setDocument(document: ProjectDocument) {
    if (document.resources !== this.document.resources) {
      const sources = new Map(
        document.resources.map((resource) => [resource.id, resource.dataUrl]),
      );
      // Version keys cannot keep deleted/replaced base64 image strings alive. Active
      // material leases still own their old GPU texture until the consumer releases them.
      for (const [id, cached] of this.resourceVersions) {
        if (sources.get(id) !== cached.dataUrl) {
          this.resourceVersions.delete(id);
        }
      }
    }
    this.document = document;
  }
  acquire(binding: SurfaceBinding, options: { glass?: boolean } = {}): MaterialLease {
    if (this.disposed) {
      throw new Error('runtime.resourcesDisposed');
    }
    const resource = binding.resourceId
      ? this.document.resources.find((r) => r.id === binding.resourceId)
      : undefined;
    if (binding.resourceId && !resource) {
      throw new Error(`runtime.resourceMissing:${binding.resourceId}`);
    }
    let textureId: string | undefined;
    if (resource) {
      let version = this.resourceVersions.get(resource.id);
      if (!version || version.dataUrl !== resource.dataUrl) {
        version = { dataUrl: resource.dataUrl, version: ++this.nextResourceVersion };
        this.resourceVersions.set(resource.id, version);
      }
      textureId = `${resource.id}:${version.version}`;
    }
    const key = JSON.stringify([binding.color, textureId, !!options.glass]);
    let entry = this.materials.get(key);
    if (!entry) {
      const material = new MeshStandardMaterial({
        color: binding.color,
        roughness: options.glass ? 0.18 : 0.82,
        metalness: 0,
        transparent: !!options.glass,
        opacity: options.glass ? 0.32 : 1,
        depthWrite: !options.glass,
      });
      try {
        material.name = options.glass
          ? 'Glass'
          : resource
            ? `Image_${resource.id}`
            : `Colour_${binding.color.slice(1)}`;
        if (resource) {
          const imageKey = textureId!;
          let textureEntry = this.textures.get(imageKey);
          if (!textureEntry) {
            let resolve!: () => void, reject!: (error: Error) => void;
            const loaded = new Promise<void>((yes, no) => {
              resolve = yes;
              reject = no;
            });
            // Rejecting remains observable through ready(); avoid an unhandled rejection before export.
            void loaded.catch(() => undefined);
            const texture = new TextureLoader().load(
              resource.dataUrl,
              () => resolve(),
              undefined,
              () => reject(new Error(`runtime.textureDecodeFailed:${resource.id}`)),
            );
            texture.colorSpace = SRGBColorSpace;
            texture.wrapS = RepeatWrapping;
            texture.wrapT = RepeatWrapping;
            texture.name = resource.id;
            textureEntry = { texture, refs: 0, loaded };
            this.textures.set(imageKey, textureEntry);
          }
          textureEntry.refs++;
          material.map = textureEntry.texture;
          entry = { material, refs: 0, textureId: imageKey };
        } else {
          entry = { material, refs: 0 };
        }
        this.materials.set(key, entry);
      } catch (error) {
        cleanupAfterFailure(() => material.dispose());
        throw error;
      }
    }
    entry.refs++;
    let released = false;
    return {
      material: entry.material,
      release: () => {
        if (released || this.disposed) {
          return;
        }
        released = true;
        const current = this.materials.get(key);
        if (!current) {
          return;
        }
        if (--current.refs === 0) {
          this.materials.delete(key);
          const cleanup = [() => current.material.dispose()];
          if (current.textureId) {
            const texture = this.textures.get(current.textureId);
            if (texture && --texture.refs === 0) {
              this.textures.delete(current.textureId);
              cleanup.push(() => texture.texture.dispose());
            }
          }
          runResourceCleanup(cleanup);
        }
      },
    };
  }
  async ready(): Promise<void> {
    await Promise.all([...this.textures.values()].map((t) => t.loaded));
  }
  get stats() {
    return {
      materials: this.materials.size,
      textures: this.textures.size,
      references: [...this.materials.values()].reduce((sum, e) => sum + e.refs, 0),
    };
  }
  /** CPU source-version cache count, separate from GPU material/texture lease statistics. */
  get cachedResources() {
    return this.resourceVersions.size;
  }
  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const owned = [
      ...[...this.materials.values()].map((entry) => () => entry.material.dispose()),
      ...[...this.textures.values()].map((entry) => () => entry.texture.dispose()),
    ];
    this.materials.clear();
    this.textures.clear();
    this.resourceVersions.clear();
    runResourceCleanup(owned);
  }
}
