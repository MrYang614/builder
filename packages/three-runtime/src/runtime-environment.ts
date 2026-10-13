import { Light, MathUtils, type Scene, type Texture } from 'three';
import type { ProjectDocument } from '@building/editor-core';
import { loadEnvironmentTexture } from './environment';
import { createRasterEnvironmentLighting } from './environment-lighting';
import type { RenderState } from './renderer';
import { cleanupAfterFailure, runResourceCleanup } from './resource-cleanup';

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
  private environmentLighting: Texture | null = null;
  private environmentRequest = 0;
  private environmentKey = '';
  private environmentTextureKey = '';
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly hooks: RuntimeEnvironmentHooks,
  ) {}

  /** Returns original pixels for panorama display and path tracing, never the raster lighting copy. */
  get texture(): Texture | null {
    return this.environmentTexture;
  }

  private configure(): void {
    const environment = this.hooks.document().environment;
    this.scene.environment = this.environmentLighting ?? this.environmentTexture;
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
    let texture: Texture | null = null;
    let lighting: Texture | null = null;
    const releasePending = () => {
      const pending = [lighting, texture];
      lighting = null;
      texture = null;
      runResourceCleanup(pending.map((owned) => () => owned?.dispose()));
    };
    try {
      texture = resource ? await loadEnvironmentTexture(resource) : null;
      if (this.disposed || request !== this.environmentRequest) {
        cleanupAfterFailure(releasePending);
        return;
      }
      lighting = texture ? await createRasterEnvironmentLighting(texture) : null;
      if (this.disposed || request !== this.environmentRequest) {
        cleanupAfterFailure(releasePending);
        return;
      }
      this.hooks.beforeReplace();
      const previous = [this.environmentLighting, this.environmentTexture];
      this.environmentTexture = texture;
      this.environmentLighting = lighting;
      texture = null;
      lighting = null;
      this.environmentTextureKey = key;
      let transitionFailed = false;
      try {
        this.configure();
        this.hooks.publish({ environmentLoading: false });
        this.hooks.changed();
        this.hooks.invalidate();
      } catch (error) {
        transitionFailed = true;
        throw error;
      } finally {
        const releasePrevious = () =>
          runResourceCleanup(previous.map((owned) => () => owned?.dispose()));
        if (transitionFailed) {
          cleanupAfterFailure(releasePrevious);
        } else {
          try {
            releasePrevious();
          } catch (error) {
            if (!this.disposed && request === this.environmentRequest) {
              cleanupAfterFailure(() =>
                runResourceCleanup([
                  () => this.hooks.publish({ error: 'render.cleanupFailed' }),
                  () => this.hooks.status('render.cleanupFailed', { reason: String(error) }),
                ]),
              );
            }
          }
        }
      }
    } catch (error) {
      cleanupAfterFailure(releasePending);
      if (this.disposed || request !== this.environmentRequest) {
        return;
      }
      this.environmentKey = this.environmentTextureKey;
      cleanupAfterFailure(() =>
        runResourceCleanup([
          () => this.hooks.beforeReplace(),
          () =>
            this.hooks.publish({
              mode: 'raster',
              pathStatus: 'error',
              environmentLoading: false,
              error: 'render.environmentFailed',
            }),
          () => this.hooks.status('render.environmentFailed', { reason: String(error) }),
          () => this.hooks.invalidate(),
        ]),
      );
    }
  }

  diagnostics() {
    const texture = this.environmentTexture;
    const lighting = this.environmentLighting ?? texture;
    return {
      resourceId: this.hooks.document().environment?.resourceId ?? null,
      textureId: texture?.uuid ?? null,
      textureName: texture?.name ?? null,
      width: (texture?.image as { width?: number } | undefined)?.width ?? 0,
      height: (texture?.image as { height?: number } | undefined)?.height ?? 0,
      lightingTextureId: lighting?.uuid ?? null,
      lightingWidth: (lighting?.image as { width?: number } | undefined)?.width ?? 0,
      lightingHeight: (lighting?.image as { height?: number } | undefined)?.height ?? 0,
      lightingDerived: !!this.environmentLighting,
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
    const lighting = this.environmentLighting;
    this.environmentTexture = null;
    this.environmentLighting = null;
    if (this.scene.environment === (lighting ?? texture)) {
      this.scene.environment = null;
    }
    if (this.scene.background === texture) {
      this.scene.background = null;
    }
    runResourceCleanup([() => lighting?.dispose(), () => texture?.dispose()]);
  }
}
