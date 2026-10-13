import type { Texture } from 'three';
import { DataTexture, HalfFloatType, Scene } from 'three';
import type { ProjectDocument } from '@building/editor-core';
import { createEmptyProject } from '@building/editor-core';
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import { RuntimeEnvironment } from '../packages/three-runtime/src/runtime-environment';

const load = vi.fn<(resource: unknown) => Promise<Texture>>();
const derive = vi.fn<(texture: Texture) => Promise<Texture | null>>();
vi.mock('../packages/three-runtime/src/environment', () => ({
  loadEnvironmentTexture: (resource: unknown) => load(resource),
}));
vi.mock('../packages/three-runtime/src/environment-lighting', () => ({
  createRasterEnvironmentLighting: (texture: Texture) => derive(texture),
}));

beforeEach(() => {
  load.mockReset();
  derive.mockReset();
});
afterEach(() => vi.restoreAllMocks());

function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function texture(width: number, height: number) {
  return new DataTexture(
    new Uint16Array(width * height * 4),
    width,
    height,
    undefined,
    HalfFloatType,
  );
}
function harness() {
  let document = createEmptyProject();
  const scene = new Scene();
  const hooks = {
    document: () => document,
    publish: vi.fn(),
    beforeReplace: vi.fn(),
    changed: vi.fn(),
    invalidate: vi.fn(),
    status: vi.fn(),
  };
  const owner = new RuntimeEnvironment(scene, hooks);
  const set = (id?: string): ProjectDocument => {
    document = {
      ...document,
      environmentResources: id
        ? [
            {
              id,
              name: `${id}.hdr`,
              mime: 'image/vnd.radiance',
              dataUrl: `data:image/vnd.radiance;base64,${id}`,
            },
          ]
        : [],
      environment: { intensity: 1, rotation: 0, background: true, resourceId: id },
    };
    return document;
  };
  return { owner, hooks, scene, set, getDocument: () => document };
}
async function accept(value: ReturnType<typeof harness>, id = 'accepted') {
  const original = texture(4, 2),
    lighting = texture(64, 32);
  load.mockResolvedValueOnce(original);
  derive.mockResolvedValueOnce(lighting);
  const document = value.set(id);
  await value.owner.apply(document);
  return { original, lighting, document };
}

describe('original panorama and derived raster lighting ownership', () => {
  test('commits separate roles without changing document and reuses both owners for parameter updates', async () => {
    const value = harness();
    const { original, lighting, document } = await accept(value);
    expect(value.owner.texture).toBe(original);
    expect(value.scene.background).toBe(original);
    expect(value.scene.environment).toBe(lighting);
    expect(value.getDocument()).toBe(document);
    expect(value.owner.diagnostics()).toMatchObject({
      width: 4,
      height: 2,
      textureId: original.uuid,
      lightingWidth: 64,
      lightingHeight: 32,
      lightingTextureId: lighting.uuid,
      lightingDerived: true,
    });
    await value.owner.apply(value.getDocument());
    expect(load).toHaveBeenCalledOnce();
    expect(derive).toHaveBeenCalledOnce();
    const originalDispose = vi.spyOn(original, 'dispose'),
      lightingDispose = vi.spyOn(lighting, 'dispose');
    value.owner.dispose();
    expect(originalDispose).toHaveBeenCalledOnce();
    expect(lightingDispose).toHaveBeenCalledOnce();
    expect(value.scene.background).toBeNull();
    expect(value.scene.environment).toBeNull();
    value.owner.dispose();
    expect(originalDispose).toHaveBeenCalledOnce();
  });

  test.each(['clear', 'replace', 'dispose'] as const)(
    'a pending derivative after %s cannot replace the accepted owners and releases both candidates',
    async (action) => {
      const value = harness();
      const first = await accept(value);
      const firstOriginalDispose = vi.spyOn(first.original, 'dispose'),
        firstLightingDispose = vi.spyOn(first.lighting, 'dispose');
      const candidate = texture(4, 2),
        candidateLighting = texture(64, 32);
      const candidateDispose = vi.spyOn(candidate, 'dispose'),
        candidateLightingDispose = vi.spyOn(candidateLighting, 'dispose');
      const delayed = pending<Texture | null>();
      load.mockResolvedValueOnce(candidate);
      derive.mockReturnValueOnce(delayed.promise);
      const applying = value.owner.apply(value.set('pending'));
      await vi.waitFor(() => expect(derive).toHaveBeenCalledTimes(2));
      let newest: Awaited<ReturnType<typeof accept>> | undefined;
      if (action === 'dispose') {
        value.owner.dispose();
      } else if (action === 'clear') {
        await value.owner.apply(value.set());
      } else {
        newest = await accept(value, 'newest');
      }
      delayed.resolve(candidateLighting);
      await applying;
      expect(candidateDispose).toHaveBeenCalledOnce();
      expect(candidateLightingDispose).toHaveBeenCalledOnce();
      expect(firstOriginalDispose).toHaveBeenCalledOnce();
      expect(firstLightingDispose).toHaveBeenCalledOnce();
      expect(value.owner.texture).toBe(newest?.original ?? null);
      expect(value.scene.environment).toBe(newest?.lighting ?? null);
      if (action !== 'dispose') {
        value.owner.dispose();
      }
    },
  );

  test('derivation failure preserves the accepted pair and releases the loaded candidate', async () => {
    const value = harness();
    const first = await accept(value);
    const originalDispose = vi.spyOn(first.original, 'dispose'),
      lightingDispose = vi.spyOn(first.lighting, 'dispose');
    const candidate = texture(4, 2);
    const candidateDispose = vi.spyOn(candidate, 'dispose');
    const primary = new Error('decoded image cannot be read');
    load.mockResolvedValueOnce(candidate);
    derive.mockRejectedValueOnce(primary);
    await value.owner.apply(value.set('invalid'));
    expect(candidateDispose).toHaveBeenCalledOnce();
    expect(originalDispose).not.toHaveBeenCalled();
    expect(lightingDispose).not.toHaveBeenCalled();
    expect(value.owner.texture).toBe(first.original);
    expect(value.scene.environment).toBe(first.lighting);
    expect(value.hooks.status).toHaveBeenCalledWith('render.environmentFailed', {
      reason: String(primary),
    });
    value.owner.dispose();
  });

  test('a failed derivative after disposal releases its pending original without publishing a stale error', async () => {
    const value = harness();
    await accept(value);
    const candidate = texture(4, 2);
    const candidateDispose = vi.spyOn(candidate, 'dispose');
    const delayed = pending<Texture | null>();
    load.mockResolvedValueOnce(candidate);
    derive.mockReturnValueOnce(delayed.promise);
    const applying = value.owner.apply(value.set('pending'));
    await vi.waitFor(() => expect(derive).toHaveBeenCalledTimes(2));
    value.owner.dispose();
    delayed.reject(new Error('late image readback failed'));
    await applying;
    expect(candidateDispose).toHaveBeenCalledOnce();
    expect(value.hooks.status).not.toHaveBeenCalled();
    expect(value.owner.texture).toBeNull();
  });

  test('a load finishing after clear releases the original before any lighting conversion', async () => {
    const value = harness();
    await accept(value);
    const candidate = texture(4, 2);
    const candidateDispose = vi.spyOn(candidate, 'dispose');
    const delayed = pending<Texture>();
    load.mockReturnValueOnce(delayed.promise);
    const applying = value.owner.apply(value.set('pending'));
    await value.owner.apply(value.set());
    delayed.resolve(candidate);
    await applying;
    expect(candidateDispose).toHaveBeenCalledOnce();
    expect(derive).toHaveBeenCalledOnce();
    expect(value.owner.texture).toBeNull();
    value.owner.dispose();
  });

  test('replacement and final disposal attempt both owners after either cleanup callback throws', async () => {
    const value = harness();
    const first = await accept(value);
    const originalDispose = vi.spyOn(first.original, 'dispose');
    const lightingDispose = vi.spyOn(first.lighting, 'dispose').mockImplementation(() => {
      throw new Error('previous lighting cleanup failed');
    });
    const next = await accept(value, 'next');
    expect(originalDispose).toHaveBeenCalledOnce();
    expect(lightingDispose).toHaveBeenCalledOnce();
    expect(value.owner.texture).toBe(next.original);
    expect(value.scene.environment).toBe(next.lighting);
    expect(value.hooks.status).toHaveBeenCalledWith('render.cleanupFailed', expect.anything());
    const nextOriginalDispose = vi.spyOn(next.original, 'dispose');
    const nextLightingDispose = vi.spyOn(next.lighting, 'dispose').mockImplementation(() => {
      throw new Error('final lighting cleanup failed');
    });
    expect(() => value.owner.dispose()).toThrow(AggregateError);
    expect(nextOriginalDispose).toHaveBeenCalledOnce();
    expect(nextLightingDispose).toHaveBeenCalledOnce();
    expect(() => value.owner.dispose()).not.toThrow();
  });

  test('an accepted transition hook failure still releases old owners and keeps its first reason', async () => {
    const value = harness();
    const first = await accept(value);
    const originalDispose = vi.spyOn(first.original, 'dispose');
    const lightingDispose = vi.spyOn(first.lighting, 'dispose').mockImplementation(() => {
      throw new Error('secondary cleanup failed');
    });
    const primary = new Error('new scene observer failed');
    value.hooks.changed.mockImplementationOnce(() => {
      throw primary;
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const next = await accept(value, 'next');
    expect(originalDispose).toHaveBeenCalledOnce();
    expect(lightingDispose).toHaveBeenCalledOnce();
    expect(value.owner.texture).toBe(next.original);
    expect(value.scene.environment).toBe(next.lighting);
    expect(value.hooks.status).toHaveBeenCalledWith('render.environmentFailed', {
      reason: String(primary),
    });
    expect(warning).toHaveBeenCalledOnce();
    value.owner.dispose();
  });
});
