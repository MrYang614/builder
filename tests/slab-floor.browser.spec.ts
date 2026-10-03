import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateBytes } from 'gltf-validator';
import type { ProjectDocument } from '@building/editor-core';
import type { ThreeRuntime } from '@building/three-runtime';

type Diagnostics = ReturnType<ThreeRuntime['diagnostics']>;
type Probe = {
  __editor: {
    document(): ProjectDocument;
    diagnostics(): Diagnostics;
    project(point: { x: number; y: number; z: number }): { x: number; y: number };
  };
};
const documentOf = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__editor.document());
const diagnostics = (page: Page) =>
  page.evaluate(() => (window as unknown as Probe).__editor.diagnostics());
async function idle(page: Page) {
  await page.waitForFunction(
    () => !(window as unknown as Probe).__editor.diagnostics().pendingFrame,
  );
}
async function point(page: Page, x: number, z: number, y = 0) {
  return page.evaluate((p) => (window as unknown as Probe).__editor.project(p), { x, y, z });
}
async function clickWorld(page: Page, x: number, z: number, y = 0) {
  const p = await point(page, x, z, y);
  await page.mouse.click(p.x, p.y);
}
async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
async function number(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel(label, { exact: true }).press('Enter');
}
function evidence(name: string, details: unknown) {
  const path = 'test-results/theme-toggle/evidence/slab-floor-validation.json';
  mkdirSync('test-results/theme-toggle/evidence', { recursive: true });
  const previous = existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8'))
    : {
        scope:
          'Windows Chromium/SwiftShader browser UI and independent GLTFLoader. No Tauri/native GUI or macOS acceptance.',
        runs: [],
      };
  previous.runs.push({ name, status: 'passed', measuredAt: new Date().toISOString(), details });
  writeFileSync(path, JSON.stringify(previous, null, 2));
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Probe).__editor);
  await expect(page.locator('canvas')).toHaveCount(1);
});

test('A08 real thick slab UI assigns different top/bottom images and independently exports one closed solid', async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.getByRole('radio', { name: '楼板', exact: true }).click();
  await clickWorld(page, -2, -1.5);
  await clickWorld(page, 2, 1.5);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await documentOf(page)).slabs.length).toBe(1);
  await page.getByRole('button', { name: '楼板 1', exact: true }).click();
  await number(page, '厚度（m）', '.35');
  await number(page, '上表面标高（m）', '1');
  await choose(page, '表面', '上表面（地板）');
  await choose(page, '图片', '木地板');
  await choose(page, '表面', '下表面（天花板）');
  await choose(page, '图片', '墙面');
  const doc = await documentOf(page),
    slab = doc.slabs[0]!;
  expect(slab.materials.top.resourceId).toBe('builtin_wood');
  expect(slab.materials.bottom.resourceId).toBe('builtin_plaster');
  expect(slab.materials.edge.resourceId).toBeUndefined();
  expect(doc.walls).toHaveLength(0);
  expect(doc.openings).toHaveLength(0);
  const wait = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 GLB', exact: true }).click();
  const download = await wait,
    file = resolve(testInfo.outputDir, 'actual-thick-slab.glb');
  await download.saveAs(file);
  const bytes = await readFile(file);
  const validator = await validateBytes(bytes, { uri: 'actual-thick-slab.glb' });
  expect(validator.issues.numErrors).toBe(0);
  expect(validator.issues.numWarnings).toBe(0);
  const loader = `/@fs/${resolve('node_modules/three/examples/jsm/loaders/GLTFLoader.js').replaceAll('\\', '/')}`;
  const loaded = await page.evaluate(
    async ({ loader, bytes, slabId }) => {
      const url = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((name) => /\/three\.js(?:\?|$)/.test(name));
      const THREE = await import(url!),
        { GLTFLoader } = await import(loader);
      const result = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
      result.scene.updateMatrixWorld(true);
      const entities: string[] = [];
      result.scene.traverse((object: { name: string }) => {
        if (object.name.startsWith('Slab_')) {
          entities.push(object.name);
        }
      });
      const root = result.scene.getObjectByName(`Slab_${slabId}`);
      if (!root) {
        throw new Error('Slab entity missing from independently loaded file');
      }
      const triangles: { positions: number[][]; role: string; image: string | null }[] = [],
        materials: Record<string, { name: string; image: string | null }> = {};
      let primitiveCount = 0;
      root.traverse((object: any) => {
        if (!object.isMesh) {
          return;
        }
        primitiveCount++;
        const geometry = object.geometry,
          index = geometry.getIndex(),
          positions = geometry.getAttribute('position');
        const count = index?.count ?? positions.count;
        for (let i = 0; i < count; i += 3) {
          const group = geometry.groups.find(
            (group: { start: number; count: number }) =>
              i >= group.start && i < group.start + group.count,
          );
          const material = Array.isArray(object.material)
            ? object.material[group?.materialIndex ?? 0]
            : object.material;
          const vertices = [0, 1, 2].map((n) =>
            new THREE.Vector3()
              .fromBufferAttribute(positions, index ? index.getX(i + n) : i + n)
              .applyMatrix4(object.matrixWorld),
          );
          const normal = vertices[1]
            .clone()
            .sub(vertices[0])
            .cross(vertices[2].clone().sub(vertices[0]))
            .normalize();
          const role = normal.y > 0.9 ? 'top' : normal.y < -0.9 ? 'bottom' : 'edge';
          const image = material.map ? material.name : null;
          triangles.push({ positions: vertices.map((vertex) => vertex.toArray()), role, image });
          materials[role] = { name: material.name, image };
        }
      });
      let volume = 0;
      const edges = new Map<string, number>(),
        areas = { top: 0, bottom: 0, edge: 0 };
      for (const triangle of triangles) {
        const [a, b, c] = triangle.positions.map((p) => new THREE.Vector3(...p));
        volume += a.dot(b.clone().cross(c)) / 6;
        areas[triangle.role as keyof typeof areas] +=
          b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
        for (const [left, right] of [
          [a, b],
          [b, c],
          [c, a],
        ]) {
          const pair = [left, right]
            .map((v) =>
              v
                .toArray()
                .map((n: number) => n.toFixed(5))
                .join(','),
            )
            .sort()
            .join('|');
          edges.set(pair, (edges.get(pair) ?? 0) + 1);
        }
      }
      const bounds = new THREE.Box3().setFromObject(root);
      return {
        entities,
        primitiveCount,
        triangleCount: triangles.length,
        materials,
        areas,
        volume: Math.abs(volume),
        closedEdgeCounts: [...new Set(edges.values())],
        bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
        animations: result.animations.length,
      };
    },
    { loader, bytes: [...bytes], slabId: slab.id },
  );
  expect(loaded.entities).toEqual([`Slab_${slab.id}`]);
  expect(loaded.triangleCount).toBe(12);
  expect(loaded.closedEdgeCounts).toEqual([2]);
  expect(loaded.materials.top.image).toBe('Image_builtin_wood');
  expect(loaded.materials.bottom.image).toBe('Image_builtin_plaster');
  expect(loaded.materials.edge.image).toBeNull();
  expect(loaded.bounds.max[1]).toBeCloseTo(1, 6);
  expect(loaded.bounds.min[1]).toBeCloseTo(0.65, 6);
  expect(loaded.volume).toBeCloseTo(4 * 3 * 0.35, 5);
  expect(loaded.areas.top).toBeCloseTo(12, 5);
  expect(loaded.areas.bottom).toBeCloseTo(12, 5);
  expect(loaded.animations).toBe(0);
  expect(await documentOf(page)).toEqual(doc);
  expect(pageErrors).toEqual([]);
  evidence('A08', {
    actualMouseCreation: true,
    uiIndependentMaterialAssignment: true,
    exportedFile: file,
    validator: { errors: validator.issues.numErrors, warnings: validator.issues.numWarnings },
    independentLoad: loaded,
    pageErrors,
  });
});

test('A11 actual cross-floor mouse selection, material, opening placement and snap ignore ghost objects', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  // Read-only observation of actual render inputs; no session/document mutations or synthetic pointer dispatch.
  await page.evaluate(async () => {
    const url = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((name) => /\/three\.js(?:\?|$)/.test(name)),
      THREE = await import(url!);
    const original = THREE.Scene.prototype.onBeforeRender;
    THREE.Scene.prototype.onBeforeRender = function (this: any, ...args: any[]) {
      const records: { id: string; opacity: number; transparent: boolean }[] = [];
      this.traverse((object: any) => {
        if (!object.isMesh || !object.userData.objectId) {
          return;
        }
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          records.push({
            id: object.userData.objectId,
            opacity: material.opacity,
            transparent: material.transparent,
          });
        }
      });
      Object.assign(window, { __renderedMaterials: records });
      return original.apply(this, args);
    };
  });
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await clickWorld(page, -3, -1.2);
  await clickWorld(page, 1, -1.2);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();
  await number(page, '起点 X（m）', '-3.04');
  await number(page, '起点 Z（m）', '-1.24');
  await page.getByRole('button', { name: '俯视', exact: true }).click();
  await idle(page);
  await page.getByRole('radio', { name: '门', exact: true }).click();
  await clickWorld(page, -2.19, -1.24, 2.8);
  await page.getByRole('radio', { name: '窗', exact: true }).click();
  await clickWorld(page, 0.16, -1.24, 2.8);
  await expect.poll(async () => (await documentOf(page)).openings.length).toBe(2);
  await page.getByRole('radio', { name: '楼板', exact: true }).click();
  await clickWorld(page, -3, -2);
  await clickWorld(page, 1, 0);
  await page.keyboard.press('Escape');
  const lowerSlabButton = page.getByRole('button', { name: /^楼板 \d+$/ });
  await expect(lowerSlabButton).toHaveCount(1);
  await lowerSlabButton.click();
  await number(page, '位置 X（m）', '-3.04');
  await number(page, '位置 Z（m）', '-2.04');
  const lower = await documentOf(page);
  expect(lower.slabs).toHaveLength(1);
  await page.getByRole('button', { name: '新增楼层', exact: true }).click();
  await page.getByRole('button', { name: '查看整栋', exact: true }).click();
  await idle(page);
  const before = await documentOf(page),
    ghostIds = [...before.walls, ...before.slabs, ...before.openings].map((object) => object.id);
  const ghostDisplay = await page.evaluate(
    () =>
      (
        window as unknown as {
          __renderedMaterials: { id: string; opacity: number; transparent: boolean }[];
        }
      ).__renderedMaterials,
  );
  for (const id of ghostIds) {
    const records = ghostDisplay.filter((record) => record.id === id);
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((record) => record.opacity === 0.25 && record.transparent)).toBe(true);
  }
  const ghostTargets = [
    { name: 'wall', x: -1, z: -1.14, y: 1.2 },
    { name: 'slab', x: 0, z: -0.4, y: 0 },
    { name: 'door', x: -2.19, z: -1.215, y: 1 },
    { name: 'window', x: 0.16, z: -1.24, y: 1.5 },
  ];
  for (const target of ghostTargets) {
    await page.getByRole('radio', { name: '选择', exact: true }).click();
    await clickWorld(page, target.x, target.z, target.y);
    await expect(page.locator('.inspector-content')).toHaveCount(0);
    expect(await documentOf(page)).toEqual(before);
    await page.getByRole('radio', { name: '材质', exact: true }).click();
    await clickWorld(page, target.x, target.z, target.y);
    await expect(page.getByRole('combobox', { name: '图片', exact: true })).toHaveCount(0);
    expect(await documentOf(page)).toEqual(before);
  }
  for (const tool of ['门', '窗']) {
    await page.getByRole('radio', { name: tool, exact: true }).click();
    const p = await point(page, -1, -1.14, 1.2);
    await page.mouse.move(p.x, p.y);
    expect((await diagnostics(page)).preview.visible).toBe(false);
    await page.mouse.click(p.x, p.y);
    expect(await documentOf(page)).toEqual(before);
  }
  // The lower wall endpoint is off-grid. A real click close to it on the active y=3 plane
  // must round to the grid rather than snap to the ghost endpoint.
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await clickWorld(page, 0.93, -1.22, 3);
  await clickWorld(page, 2.9, -1.2, 3);
  await page.keyboard.press('Escape');
  const after = await documentOf(page),
    upper = after.walls.find((wall) => wall.levelId !== before.levels[0]!.id)!;
  expect(upper).toBeDefined();
  expect(upper.start.x).toBeCloseTo(0.9, 6);
  expect(upper.start.z).toBeCloseTo(-1.2, 6);
  expect(after.openings).toEqual(before.openings);
  expect(after.slabs).toEqual(before.slabs);
  await page.getByRole('radio', { name: '墙体', exact: true }).click();
  await clickWorld(page, -3.03, -2.02, 3);
  await clickWorld(page, -1, -2, 3);
  await page.keyboard.press('Escape');
  const withSecondWall = await documentOf(page),
    fromSlabCorner = withSecondWall.walls.at(-1)!;
  expect(fromSlabCorner.start.x).toBeCloseTo(-3, 6);
  expect(fromSlabCorner.start.z).toBeCloseTo(-2, 6);
  // Positive controls prove active-layer geometry is selectable and can host openings.
  await page.getByRole('radio', { name: '选择', exact: true }).click();
  await clickWorld(page, 1.8, -1.2, 5.8);
  await expect(page.locator('.inspector-content')).toHaveCount(1);
  await page.getByRole('radio', { name: '门', exact: true }).click();
  await clickWorld(page, 1.8, -1.2, 5.8);
  await expect
    .poll(async () => (await documentOf(page)).openings.length)
    .toBe(before.openings.length + 1);
  const final = await documentOf(page);
  expect(final.openings.at(-1)!.wallId).toBe(upper.id);
  expect(final.walls.find((wall) => wall.id === before.walls[0]!.id)).toEqual(before.walls[0]);
  await idle(page);
  const currentDisplay = await page.evaluate(
    () =>
      (
        window as unknown as {
          __renderedMaterials: { id: string; opacity: number; transparent: boolean }[];
        }
      ).__renderedMaterials,
  );
  const activeWallMaterials = currentDisplay.filter((record) => record.id === upper.id);
  expect(activeWallMaterials.length).toBeGreaterThan(0);
  expect(activeWallMaterials.every((record) => record.opacity === 1 && !record.transparent)).toBe(
    true,
  );
  expect(pageErrors).toEqual([]);
  evidence('A11', {
    realPointerTargets: ghostTargets,
    ghostObjects: ghostIds,
    ghostDisplay,
    selectionAndMaterialExcluded: true,
    ghostDoorAndWindowPlacementExcluded: true,
    offGridGhostEndpoint: before.walls[0]!.end,
    actualCurrentFloorWallStart: upper.start,
    offGridGhostSlabCorner: before.slabs[0]!.polygon[0],
    actualCurrentFloorWallFromSlabCorner: fromSlabCorner.start,
    activeLayerSelectionAndPlacementPositiveControl: true,
    activeWallMaterials,
    pageErrors,
  });
});
