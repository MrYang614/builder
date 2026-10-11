import { Light, MathUtils, type Scene, type Texture } from 'three';
import type { ProjectDocument } from '@building/editor-core';
import { loadEnvironmentTexture } from './environment';
import type { RenderState } from './renderer';

export interface RuntimeEnvironmentHooks {
  document(): ProjectDocument;
  publish(patch: Partial<RenderState>): void;
  beforeReplace(): void;
  changed(): void;
  invalidate(): void;
  status(code: string, params?: Record<string, string | number>): void;
}

/** Owns decoded panorama textures; stale decodes never replace the accepted scene resource. */
export class RuntimeEnvironment {
  private environmentTexture: Texture | null = null;
  private environmentRequest = 0;
  private environmentKey = '';
  private environmentTextureKey = '';
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly hooks: RuntimeEnvironmentHooks,
  ) {}

  get texture(): Texture | null {
    return this.environmentTexture;
  }

  private configure(): void {
    const environment = this.hooks.document().environment;
    this.scene.environment = this.environmentTexture;
    this.scene.environmentIntensity = environment?.intensity ?? 1;
    this.scene.environmentRotation.set(0, MathUtils.degToRad(environment?.rotation ?? 0), 0);
    this.scene.background = environment?.background ? this.environmentTexture : null;
    this.scene.backgroundRotation.copy(this.scene.environmentRotation);
    for (const light of this.scene.children) {
      if (light instanceof Light) {
        light.visible = !this.environmentTexture;
      }
    }
  }

  /** Parameters always use the latest document, including edits made while decoding is pending. */
  async apply(doc: ProjectDocument): Promise<void> {
    if (this.disposed) {
      return;
    }
    const resource = doc.environmentResources?.find((r) => r.id === doc.environment?.resourceId);
    const key = resource ? `${resource.id}:${resource.dataUrl}` : '';
    if (key === this.environmentKey) {
      this.configure();
      return;
    }
    this.environmentKey = key;
    const request = ++this.environmentRequest;
    this.hooks.publish({ environmentLoading: !!resource, error: undefined });
    try {
      const texture = resource ? await loadEnvironmentTexture(resource) : null;
      if (this.disposed || request !== this.environmentRequest) {
        texture?.dispose();
        return;
      }
      this.hooks.beforeReplace();
      this.environmentTexture?.dispose();
      this.environmentTexture = texture;
      this.environmentTextureKey = key;
      this.configure();
      this.hooks.publish({ environmentLoading: false });
      this.hooks.changed();
      this.hooks.invalidate();
    } catch (error) {
      if (this.disposed || request !== this.environmentRequest) {
        return;
      }
      this.environmentKey = this.environmentTextureKey;
      this.hooks.beforeReplace();
      this.hooks.publish({
        mode: 'raster',
        pathStatus: 'error',
        environmentLoading: false,
        error: 'render.environmentFailed',
      });
      this.hooks.status('render.environmentFailed', { reason: String(error) });
      this.hooks.invalidate();
    }
  }

  diagnostics() {
    const texture = this.environmentTexture;
    return {
      resourceId: this.hooks.document().environment?.resourceId ?? null,
      textureId: texture?.uuid ?? null,
      textureName: texture?.name ?? null,
      width: (texture?.image as { width?: number } | undefined)?.width ?? 0,
      height: (texture?.image as { height?: number } | undefined)?.height ?? 0,
      intensity: this.scene.environmentIntensity,
      rotation: this.scene.environmentRotation.y,
      background: this.scene.background === texture && !!texture,
    };
  }

  /** Invalidates pending decode requests before releasing the currently accepted panorama. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.environmentRequest++;
    const texture = this.environmentTexture;
    this.environmentTexture = null;
    texture?.dispose();
  }
}
