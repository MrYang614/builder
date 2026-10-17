import { evidencePath } from './evidence-path';
import { choose } from './browser-controls';
import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import type { ProjectDocument } from '@building/editor-core';
import type { ThreeRuntime } from '@building/three-runtime';
type Instrumented = {
  __editor: { document(): ProjectDocument; diagnostics(): ReturnType<ThreeRuntime['diagnostics']> };
};
const snapshot = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.document());
const diagnostics = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.diagnostics());
const source = `/@fs/${resolve('.').replaceAll('\\', '/')}`;

async function idle(page: Page) {
  await page.waitForFunction(
    () => !(window as unknown as Instrumented).__editor.diagnostics().pendingFrame,
  );
}

test('real decoded image completion arriving after UI project replacement cannot restore old models or resource caches', async ({
  page,
}) => {
  // Delay delivery of genuine successful image load events, preserving the decoder,
  // TextureLoader, document commands and renderer. No fabricated image result is used.
  await page.addInitScript(() => {
    const add = HTMLImageElement.prototype.addEventListener,
      remove = HTMLImageElement.prototype.removeEventListener;
    let holding = true,
      released = 0;
    const queued: { invoke: () => void; width: number; height: number; complete: boolean }[] = [],
      wrappers = new WeakMap<
        HTMLImageElement,
        Map<EventListenerOrEventListenerObject, EventListener>
      >();
    HTMLImageElement.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (!listener) {
        return;
      }
      if (type !== 'load') {
        return add.call(this, type, listener, options);
      }
      // oxlint-disable-next-line typescript/no-this-alias -- Deferred native load listeners must keep the exact image receiver captured at registration.
      const image = this,
        wrapped: EventListener = (event) => {
          const invoke = () => {
            if (typeof listener === 'function') {
              listener.call(image, event);
            } else {
              listener.handleEvent(event);
            }
          };
          if (holding) {
            queued.push({
              invoke,
              width: image.naturalWidth,
              height: image.naturalHeight,
              complete: image.complete,
            });
          } else {
            invoke();
          }
        };
      let map = wrappers.get(image);
      if (!map) {
        map = new Map();
        wrappers.set(image, map);
      }
      map.set(listener, wrapped);
      return add.call(image, type, wrapped, options);
    };
    HTMLImageElement.prototype.removeEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | EventListenerOptions,
    ) {
      if (!listener) {
        return;
      }
      const map = wrappers.get(this),
        wrapped = map?.get(listener);
      if (wrapped) {
        map?.delete(listener);
      }
      return remove.call(this, type, wrapped ?? listener, options);
    };
    Object.assign(window, {
      __imageGate: {
        status: () => ({
          pending: queued.length,
          released,
          images: queued.map(({ width, height, complete }) => ({ width, height, complete })),
        }),
        release: () => {
          holding = false;
          const ready = queued.splice(0);
          for (const row of ready) {
            row.invoke();
            released++;
          }
          return ready.length;
        },
      },
    });
  });
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Instrumented).__editor);
  await page.evaluate(async () => {
    const materialUrl = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((name) => /\/packages\/three-runtime\/src\/materials\.ts(?:\?|$)/.test(name));
    if (!materialUrl) {
      throw new Error('Actual running ResourcePool module was not found');
    }
    const { ResourcePool } = await import(materialUrl),
      pools = new Set<import('@building/three-runtime').ResourcePool>(),
      acquire = ResourcePool.prototype.acquire,
      dispose = ResourcePool.prototype.dispose;
    const disposed: {
      before: { cached: number; materials: number; textures: number; references: number };
      after: { cached: number; materials: number; textures: number; references: number };
    }[] = [];
    ResourcePool.prototype.acquire = function (
      this: import('@building/three-runtime').ResourcePool,
      ...args: Parameters<import('@building/three-runtime').ResourcePool['acquire']>
    ) {
      pools.add(this);
      return acquire.apply(this, args);
    };
    ResourcePool.prototype.dispose = function (
      this: import('@building/three-runtime').ResourcePool,
    ) {
      const before = { cached: this.cachedResources, ...this.stats };
      dispose.call(this);
      disposed.push({ before, after: { cached: this.cachedResources, ...this.stats } });
    };
    Object.assign(window, {
      __poolAudit: () => ({
        disposed,
        pools: [...pools].map((pool) => ({ cached: pool.cachedResources, ...pool.stats })),
      }),
    });
  });
  const rendererId = (await diagnostics(page)).rendererId;
  await page.getByRole('button', { name: '庭院样板', exact: true }).click();
  type Gate = {
    __imageGate: {
      status(): {
        pending: number;
        released: number;
        images: { width: number; height: number; complete: boolean }[];
      };
      release(): number;
    };
  };
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Gate).__imageGate.status().pending))
    .toBe(3);
  const delayed = await page.evaluate(() => (window as unknown as Gate).__imageGate.status());
  expect(
    delayed.images.every((image) => image.complete && image.width === 128 && image.height === 128),
  ).toBe(true);
  const old = await snapshot(page),
    oldIds = [...old.walls, ...old.slabs, ...old.openings].map((object) => object.id);
  expect((await diagnostics(page)).objects).toBeGreaterThan(0);
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).id).not.toBe(old.id);
  await idle(page);
  const replacement = await snapshot(page),
    before = await diagnostics(page);
  expect(replacement.walls).toEqual([]);
  expect(replacement.slabs).toEqual([]);
  expect(replacement.openings).toEqual([]);
  expect(replacement.resources).toEqual([]);
  expect(before.objects).toBe(0);
  expect(before.resources).toEqual({ materials: 0, textures: 0, references: 0 });
  expect(await page.evaluate(() => (window as unknown as Gate).__imageGate.release())).toBe(3);
  // Promise continuations from the old pool have settled before measuring. Two real
  // browser frames also expose accidental stale invalidate/render scheduling.
  await page.evaluate(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  const after = await diagnostics(page),
    audit = await page.evaluate(() =>
      (
        window as unknown as {
          __poolAudit(): {
            disposed: {
              before: { cached: number };
              after: { cached: number; materials: number; textures: number; references: number };
            }[];
            pools: { cached: number; materials: number; textures: number; references: number }[];
          };
        }
      ).__poolAudit(),
    );
  expect(await snapshot(page)).toEqual(replacement);
  expect(after.rendererId).toBe(rendererId);
  expect(after.objects).toBe(0);
  expect(after.resources).toEqual({ materials: 0, textures: 0, references: 0 });
  expect(after.geometries).toBe(before.geometries);
  expect(after.textures).toBe(before.textures);
  expect(after.frameCount).toBe(before.frameCount);
  expect(after.pendingFrame).toBe(false);
  expect(audit.disposed.some((pool) => pool.before.cached === 3)).toBe(true);
  expect(audit.pools).toEqual([{ cached: 0, materials: 0, textures: 0, references: 0 }]);
  expect(
    audit.disposed.every(
      (pool) =>
        pool.after.cached === 0 &&
        pool.after.materials === 0 &&
        pool.after.textures === 0 &&
        pool.after.references === 0,
    ),
  ).toBe(true);
  await mkdir(evidencePath('theme-toggle/evidence'), { recursive: true });
  await writeFile(
    evidencePath('theme-toggle/evidence/late-image-validation.json'),
    JSON.stringify(
      {
        acceptance: 'A28',
        platform: 'Windows Chromium WebGL browser; no native desktop inference',
        path: 'Actual UI example → hold delivery of three genuinely decoded 128×128 PNG load events → actual UI New → release old completions',
        delayed,
        oldObjectIds: oldIds,
        newProjectId: replacement.id,
        formalDocumentUnchangedAfterLateCompletion: true,
        before,
        after,
        poolAudit: audit,
      },
      null,
      2,
    ),
  );
});

interface SceneRecord {
  theme: string;
  identity: { rendererId: string | undefined; sceneId: string; cameraId: string };
  exposure: number;
  toneMapping: number;
  outputColorSpace: string;
  background: string;
  lights: Record<string, unknown>[];
  models: Record<string, unknown>[];
  grid: number[][];
  auxColors: Record<string, string[]>;
  expected: {
    background: string;
    grid: string;
    axis: string;
    selection: string;
    snap: string;
    preview: string;
    invalid: string;
  };
  expectedGrid: number[][];
}
test('actual rendered scene keeps lights exposure and displayed building materials across themes while helpers follow public tokens', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Instrumented).__editor);
  await page.evaluate(async (source) => {
    const url = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((name) => /\/three\.js(?:\?|$)/.test(name)),
      THREE = await import(url!),
      { viewportTokens } = await import(`${source}/packages/ui/src/tokens/index.ts`);
    let latest: SceneRecord | null = null;
    const original = THREE.Scene.prototype.onBeforeRender;
    THREE.Scene.prototype.onBeforeRender = function (
      this: import('three').Scene,
      renderer: import('three').WebGLRenderer,
      scene: import('three').Scene,
      camera: import('three').Camera,
      ...rest: unknown[]
    ) {
      original.call(this, renderer, scene, camera, ...rest);
      // GTAO renders the same scene with a temporary normal material and clear color.
      // Record the actual color pass so the background token assertion stays meaningful.
      if (scene.overrideMaterial) {
        return;
      }
      const lights: Record<string, unknown>[] = [],
        models: Record<string, unknown>[] = [],
        auxColors: Record<string, string[]> = {},
        grid: number[][] = [];
      const theme = globalThis.document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
        expected = viewportTokens(theme);
      const auxiliary = (role: string, colour: string) => {
        (auxColors[role] ??= []).push(colour);
      };
      scene.traverse((object) => {
        if ((object as import('three').Light).isLight) {
          const light = object as import('three').Light;
          lights.push({
            id: light.uuid,
            type: light.type,
            color: light.color.getHexString(),
            groundColor: (light as import('three').HemisphereLight).groundColor?.getHexString(),
            intensity: light.intensity,
            position: light.position.toArray(),
          });
        }
        if (!(object as import('three').Mesh).isMesh && !(object as import('three').Line).isLine) {
          return;
        }
        const drawable = object as import('three').Mesh | import('three').Line;
        const materials = Array.isArray(drawable.material)
          ? drawable.material
          : [drawable.material];
        if (drawable.userData.objectId) {
          models.push({
            id: drawable.uuid,
            objectId: drawable.userData.objectId,
            name: drawable.name,
            geometryId: drawable.geometry.uuid,
            visible: drawable.visible,
            materials: materials.map((material) => {
              const physical = material as import('three').MeshStandardMaterial;
              return {
                id: material.uuid,
                name: material.name,
                color: physical.color.getHexString(),
                opacity: material.opacity,
                transparent: material.transparent,
                depthWrite: material.depthWrite,
                roughness: physical.roughness,
                metalness: physical.metalness,
                map: physical.map
                  ? {
                      id: physical.map.uuid,
                      name: physical.map.name,
                      colorSpace: physical.map.colorSpace,
                      wrapS: physical.map.wrapS,
                      wrapT: physical.map.wrapT,
                      width: (physical.map.image as HTMLImageElement | undefined)?.naturalWidth,
                      height: (physical.map.image as HTMLImageElement | undefined)?.naturalHeight,
                    }
                  : null,
              };
            }),
          });
          return;
        }
        if (drawable.type === 'GridHelper') {
          const colours = drawable.geometry.getAttribute('color'),
            seen = new Set<string>();
          for (let index = 0; index < colours.count; index++) {
            const values = [colours.getX(index), colours.getY(index), colours.getZ(index)],
              key = values.join(',');
            if (!seen.has(key)) {
              seen.add(key);
              grid.push(values);
            }
          }
          return;
        }
        let role: string | undefined;
        if (drawable.type === 'Box3Helper') {
          role = 'selection-outline';
        } else if (drawable.userData.source) {
          role = 'selected-face';
        } else if (drawable.geometry.type === 'SphereGeometry') {
          const radius = (drawable.geometry as import('three').SphereGeometry).parameters.radius;
          role =
            radius === 0.09
              ? 'hinge-marker'
              : radius === 0.065
                ? 'snap'
                : radius === 0.12
                  ? 'handle'
                  : undefined;
        } else if (
          drawable.type === 'Line' &&
          drawable.geometry.getAttribute('position').count === 2
        ) {
          role = 'hinge-axis';
        } else if (drawable.geometry.type === 'BoxGeometry') {
          role = 'preview';
        }
        if (role) {
          materials.forEach((material) =>
            auxiliary(role, (material as import('three').LineBasicMaterial).color.getHexString()),
          );
        }
      });
      latest = {
        theme,
        identity: {
          rendererId: renderer.domElement.dataset.runtimeId,
          sceneId: scene.uuid,
          cameraId: camera.uuid,
        },
        exposure: renderer.toneMappingExposure,
        toneMapping: renderer.toneMapping,
        outputColorSpace: renderer.outputColorSpace,
        background: renderer.getClearColor(new THREE.Color()).getHexString(),
        lights: lights.sort((a, b) => String(a.id).localeCompare(String(b.id))),
        models: models.sort((a, b) => String(a.id).localeCompare(String(b.id))),
        grid,
        auxColors,
        expected,
        expectedGrid: [
          new THREE.Color(expected.axis).toArray(),
          new THREE.Color(expected.grid).toArray(),
        ],
      };
    };
    Object.assign(window, { __sceneProbe: () => latest });
  }, source);
  await page.getByRole('button', { name: '庭院样板', exact: true }).click();
  await page.getByRole('button', { name: '门 6', exact: true }).click();
  const originalDocument = await snapshot(page);
  async function themeRecord(mode: 'light' | 'dark') {
    await choose(page, '外观', mode === 'light' ? '亮色' : '暗色');
    await page.waitForFunction((mode) => {
      const result = (window as unknown as { __sceneProbe(): SceneRecord | null }).__sceneProbe();
      return (
        result?.theme === mode &&
        result.auxColors['hinge-marker']?.length === 1 &&
        result.models.every((model) =>
          (model.materials as { map: { width?: number } | null }[]).every(
            (material) => !material.map || material.map.width === 128,
          ),
        )
      );
    }, mode);
    await idle(page);
    return page.evaluate(() =>
      (window as unknown as { __sceneProbe(): SceneRecord }).__sceneProbe(),
    );
  }
  const light = await themeRecord('light'),
    dark = await themeRecord('dark');
  expect(dark.identity).toEqual(light.identity);
  expect(dark.lights).toEqual(light.lights);
  expect(dark.exposure).toBe(light.exposure);
  expect(dark.toneMapping).toBe(light.toneMapping);
  expect(dark.outputColorSpace).toBe(light.outputColorSpace);
  expect(dark.models).toEqual(light.models);
  expect(light.models.length).toBeGreaterThan(0);
  expect(light.lights).toHaveLength(3);
  expect(light.lights.filter((value) => value.type === 'DirectionalLight')).toHaveLength(2);
  expect(light.lights.filter((value) => value.type === 'HemisphereLight')).toHaveLength(1);
  expect(await snapshot(page)).toEqual(originalDocument);
  for (const record of [light, dark]) {
    expect(record.background).toBe(record.expected.background.slice(1));
    expect(record.grid).toHaveLength(2);
    for (const expected of record.expectedGrid) {
      expect(
        record.grid.some((actual) =>
          actual.every((value, index) => Math.abs(value - expected[index]!) < 1e-7),
        ),
      ).toBe(true);
    }
    for (const role of ['selection-outline', 'selected-face', 'hinge-marker', 'hinge-axis']) {
      expect(record.auxColors[role]!.length).toBeGreaterThan(0);
      expect(
        record.auxColors[role]!.every((colour) => colour === record.expected.selection.slice(1)),
      ).toBe(true);
    }
    expect(record.auxColors.snap).toEqual([record.expected.snap.slice(1)]);
    expect(record.auxColors.preview).toEqual([record.expected.preview.slice(1)]);
  }
  expect(dark.grid).not.toEqual(light.grid);
  expect(dark.auxColors['hinge-marker']).not.toEqual(light.auxColors['hinge-marker']);
  expect(dark.auxColors['selected-face']).not.toEqual(light.auxColors['selected-face']);
  await mkdir(evidencePath('theme-toggle/evidence'), { recursive: true });
  await writeFile(
    evidencePath('theme-toggle/evidence/scene-theme-validation.json'),
    JSON.stringify(
      {
        acceptance: 'A38',
        platform: 'Windows Chromium WebGL browser; no native desktop inference',
        measurement:
          'Actual color Scene.onBeforeRender receives the current renderer, scene and camera; override-material prepasses are excluded; all tokens imported dynamically from packages/ui public API',
        exportEvidence:
          'tests/export.browser.spec.ts and test-results/theme-toggle/evidence/export-validation.json independently cover clean export/theme equality',
        lightsAndExposureUnchanged: true,
        displayedModelMaterialsUnchanged: true,
        helperColorsFollowTokens: true,
        formalDocumentUnchanged: true,
        light,
        dark,
      },
      null,
      2,
    ),
  );
});
