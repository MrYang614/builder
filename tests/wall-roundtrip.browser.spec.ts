import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { validateBytes } from 'gltf-validator';
import type { Mesh, MeshStandardMaterial, Object3D } from 'three';
import type { ProjectDocument } from '@building/editor-core';
import type { ThreeRuntime } from '@building/three-runtime';

type RuntimeDiagnostics = ReturnType<ThreeRuntime['diagnostics']>;
interface Instrumented {
  __editor: {
    document(): ProjectDocument;
    history(): { undoCount: number; redoCount: number };
    diagnostics(): RuntimeDiagnostics;
    project(point: { x: number; y: number; z: number }): { x: number; y: number };
  };
}
const documentOf = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.document());
const historyOf = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.history());
const diagnostics = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.diagnostics());
const project = (page: Page, x: number, z: number, y = 0) =>
  page.evaluate((point) => (window as unknown as Instrumented).__editor.project(point), {
    x,
    y,
    z,
  });
async function rendered(page: Page) {
  await page.waitForFunction(
    () => !(window as unknown as Instrumented).__editor.diagnostics().pendingFrame,
  );
  // Observe completed browser frames; no arbitrary sleep or direct scene mutation.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.waitForFunction(
    () => !(window as unknown as Instrumented).__editor.diagnostics().pendingFrame,
  );
}
async function clickWorld(page: Page, x: number, z: number, y = 0) {
  await rendered(page);
  const point = await project(page, x, z, y);
  await page.mouse.click(point.x, point.y);
}
async function number(page: Page, label: string, value: string) {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(value);
  await input.press('Enter');
  await rendered(page);
}
async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await rendered(page);
}
function sameBuilding(actual: ProjectDocument, expected: ProjectDocument) {
  expect(actual.levels).toEqual(expected.levels);
  expect(actual.walls).toEqual(expected.walls);
  expect(actual.openings).toEqual(expected.openings);
  expect(actual.slabs).toEqual(expected.slabs);
  expect(actual.resources).toEqual(expected.resources);
  expect(actual.continuity).toEqual(expected.continuity);
}

test('A27: property length and real endpoint drag round-trip one L wall with door and continuous A/B UV', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const record: Record<string, unknown> = {
    measuredAt: new Date().toISOString(),
    status: 'running',
    scope: 'Windows Chromium SwiftShader browser E2E; not Tauri native desktop acceptance',
    operations:
      'Real mouse creates L walls and places a door; UI assigns A/B images, edits length, undoes, drags endpoint, cancels and downloads actual GLBs. Diagnostic reads never inject commands.',
  };
  const errors: string[] = [],
    exports: Record<string, unknown>[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.addInitScript(() => {
      localStorage.setItem(
        'building-editor.settings.v1',
        JSON.stringify({ themeMode: 'light', language: 'en' }),
      );
      localStorage.setItem('building-theme', 'light');
      localStorage.setItem('building-language', 'en');
    });
    await page.goto('/');
    await page.waitForFunction(() => !!(window as unknown as Instrumented).__editor);
    await expect(page.locator('canvas')).toHaveCount(1);
    await page.getByRole('radio', { name: 'Wall', exact: true }).click();
    await clickWorld(page, -2, -1);
    await clickWorld(page, 0.4, -1);
    await clickWorld(page, 0.4, 0.8);
    await page.keyboard.press('Escape');
    const created = await documentOf(page);
    expect(created.walls).toHaveLength(2);
    expect(created.walls[0]!.end.x - created.walls[0]!.start.x).toBeCloseTo(2.4, 7);
    expect(created.walls[1]!.start).toEqual(created.walls[0]!.end);
    await page.getByRole('radio', { name: 'Door', exact: true }).click();
    await clickWorld(page, -1.2, -0.9, 1);
    expect((await documentOf(page)).openings).toHaveLength(1);
    await page.getByRole('radio', { name: 'Select', exact: true }).click();
    await number(page, 'Opening offset (m)', '.3');
    await number(page, 'Opening width (m)', '.8');
    for (const wall of ['Wall 1', 'Wall 2']) {
      await page.getByRole('button', { name: wall, exact: true }).click();
      await choose(page, 'Surface', 'Side A');
      await choose(page, 'Image', 'Brick');
      await choose(page, 'Surface', 'Side B');
      await choose(page, 'Image', 'Plaster');
    }
    await page.getByRole('button', { name: 'Wall 1', exact: true }).click();
    const beforeFocus = await diagnostics(page);
    await page.getByRole('button', { name: 'Whole building', exact: true }).click();
    await page.waitForFunction((frame) => {
      const d = (window as unknown as Instrumented).__editor.diagnostics();
      return d.frameCount > frame && !d.pendingFrame;
    }, beforeFocus.frameCount);
    await rendered(page);
    const baseline = await documentOf(page),
      a = baseline.walls[0]!,
      b = baseline.walls[1]!,
      door = baseline.openings[0]!;
    const baselineHistory = await historyOf(page),
      rendererId = (await diagnostics(page)).rendererId;
    expect(door.wallId).toBe(a.id);
    expect(door.offset).toBe(0.3);
    expect(door.width).toBe(0.8);
    expect(a.materials.A.resourceId).toBe('builtin_brick');
    expect(a.materials.B.resourceId).toBe('builtin_plaster');
    expect(b.materials.A).toEqual(a.materials.A);
    expect(b.materials.B).toEqual(a.materials.B);
    record.baseline = {
      wallIds: [a.id, b.id],
      doorId: door.id,
      axisLength: 2.4,
      history: baselineHistory,
      camera: (await diagnostics(page)).camera,
    };

    async function inspectExport(name: string, snapshot: ProjectDocument) {
      const downloadEvent = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export GLB', exact: true }).click();
      const download = await downloadEvent,
        file = resolve(testInfo.outputDir, name);
      await download.saveAs(file);
      const bytes = await readFile(file),
        validator = await validateBytes(bytes, { uri: name });
      expect(validator.issues.numErrors).toBe(0);
      expect(validator.issues.numWarnings).toBe(0);
      const loader = `/@fs/${resolve('node_modules/three/examples/jsm/loaders/GLTFLoader.js').replaceAll('\\', '/')}`;
      const independent = await page.evaluate(
        async ({ loader, bytes, aId, bId, doorId, endX, z, holeX, holeY, solidX, half }) => {
          const { GLTFLoader } = await import(loader);
          const threeUrl = performance
            .getEntriesByType('resource')
            .map((entry) => entry.name)
            .find((name) => /\/three\.js(?:\?|$)/.test(name));
          if (!threeUrl) {
            throw new Error('Actual runtime Three module URL missing');
          }
          const THREE = await import(threeUrl),
            loaded = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
          loaded.scene.updateMatrixWorld(true);
          const wallA = loaded.scene.getObjectByName(`Wall_${aId}`) as Object3D | undefined,
            wallB = loaded.scene.getObjectByName(`Wall_${bId}`) as Object3D | undefined;
          if (!wallA || !wallB) {
            throw new Error('Independent exported L walls missing');
          }
          const meshData = (wall: Object3D) => {
            const result: {
              name: string;
              material: string;
              positions: number[];
              uvs: number[];
              indices: number[];
            }[] = [];
            wall.traverse((object) => {
              if (!(object instanceof THREE.Mesh)) {
                return;
              }
              const mesh = object as Mesh;
              const position = mesh.geometry.getAttribute('position'),
                uv = mesh.geometry.getAttribute('uv'),
                index = mesh.geometry.getIndex();
              if (!position || !uv || !index) {
                throw new Error('Actual exported wall attributes missing');
              }
              const material = (
                Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material
              ) as MeshStandardMaterial;
              result.push({
                name: mesh.name,
                material: material.name,
                positions: Array.from({ length: position.count }, (_, i) => [
                  position.getX(i),
                  position.getY(i),
                  position.getZ(i),
                ]).flat(),
                uvs: Array.from({ length: uv.count }, (_, i) => [uv.getX(i), uv.getY(i)]).flat(),
                indices: Array.from({ length: index.count }, (_, i) => index.getX(i)),
              });
            });
            return result;
          };
          const faceU = (wall: Object3D, image: string, x: number, z: number) => {
            const values: number[] = [];
            wall.traverse((object) => {
              if (!(object instanceof THREE.Mesh)) {
                return;
              }
              const mesh = object as Mesh;
              const geometry = mesh.geometry,
                positions = geometry.getAttribute('position'),
                uv = geometry.getAttribute('uv'),
                indices = geometry.getIndex();
              if (!indices || !positions || !uv) {
                throw new Error('Actual exported face attributes missing');
              }
              for (let cursor = 0; cursor < indices.count; cursor += 1) {
                const group = geometry.groups.find(
                  (g) => cursor >= g.start && cursor < g.start + g.count,
                );
                const material = (
                  Array.isArray(mesh.material)
                    ? mesh.material[group?.materialIndex ?? 0]!
                    : mesh.material
                ) as MeshStandardMaterial;
                if (material.name !== `Image_${image}`) {
                  continue;
                }
                const vertex = indices.getX(cursor);
                if (
                  Math.abs(positions.getX(vertex) - x) < 1e-5 &&
                  Math.abs(positions.getZ(vertex) - z) < 1e-5
                ) {
                  values.push(uv.getX(vertex));
                }
              }
            });
            return values;
          };
          const inner = [
            faceU(wallA, 'builtin_brick', endX - half, z + half),
            faceU(wallB, 'builtin_brick', endX - half, z + half),
          ];
          const outer = [
            faceU(wallA, 'builtin_plaster', endX + half, z - half),
            faceU(wallB, 'builtin_plaster', endX + half, z - half),
          ];
          const ray = (x: number) =>
            new THREE.Raycaster(
              new THREE.Vector3(x, holeY, z + 3),
              new THREE.Vector3(0, 0, -1),
            ).intersectObject(wallA, true).length;
          const imageNames = new Set<string>();
          loaded.scene.traverse((object: Object3D) => {
            if (!(object instanceof THREE.Mesh)) {
              return;
            }
            const mesh = object as Mesh;
            for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
              if ((material as MeshStandardMaterial).map) {
                imageNames.add((material as MeshStandardMaterial).map!.name);
              }
            }
          });
          const result = {
            inner,
            outer,
            holeHits: ray(holeX),
            solidHits: ray(solidX),
            animations: loaded.animations.map((clip: { name: string }) => clip.name),
            doorPresent: !!loaded.scene.getObjectByName(`DoorRoot_${doorId}`),
            images: [...imageNames].sort(),
            walls: [meshData(wallA), meshData(wallB)],
          };
          loaded.scene.traverse((object: Object3D) => {
            if (!(object instanceof THREE.Mesh)) {
              return;
            }
            const mesh = object as Mesh;
            mesh.geometry.dispose();
            for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
              (material as MeshStandardMaterial).map?.dispose();
              material.dispose();
            }
          });
          return result;
        },
        {
          loader,
          bytes: [...bytes],
          aId: a.id,
          bId: b.id,
          doorId: door.id,
          endX: snapshot.walls[0]!.end.x,
          z: a.start.z,
          holeX: a.start.x + door.offset + door.width / 2,
          holeY: door.height / 2,
          solidX: a.start.x + 0.1,
          half: a.thickness / 2,
        },
      );
      expect(independent.inner.every((values) => values.length > 0)).toBe(true);
      expect(independent.outer.every((values) => values.length > 0)).toBe(true);
      expect(independent.inner[0]![0]).toBeCloseTo(independent.inner[1]![0]!, 5);
      expect(independent.outer[0]![0]).toBeCloseTo(independent.outer[1]![0]!, 5);
      expect(independent.inner[0]![0]).toBeCloseTo(
        (snapshot.walls[0]!.end.x - a.start.x - a.thickness / 2) / a.materials.A.tileWidth,
        5,
      );
      expect(independent.outer[0]![0]).toBeCloseTo(
        (snapshot.walls[0]!.end.x - a.start.x + a.thickness / 2) / a.materials.B.tileWidth,
        5,
      );
      expect(independent.holeHits).toBe(0);
      expect(independent.solidHits).toBeGreaterThan(0);
      expect(independent.doorPresent).toBe(true);
      expect(independent.animations).toEqual([`Door_${door.id}_Open`, `Door_${door.id}_Close`]);
      expect(independent.images).toHaveLength(2);
      const fingerprint = createHash('sha256')
        .update(JSON.stringify(independent.walls))
        .digest('hex');
      exports.push({
        file,
        bytes: bytes.length,
        validatorErrors: validator.issues.numErrors,
        validatorWarnings: validator.issues.numWarnings,
        fingerprint,
        inner: independent.inner.map((values) => values[0]),
        outer: independent.outer.map((values) => values[0]),
        holeHits: independent.holeHits,
      });
      return fingerprint;
    }
    const originalFingerprint = await inspectExport('before-property-and-drag.glb', baseline);
    await number(page, 'Axis length (m)', '3.2');
    const property = await documentOf(page);
    expect(property.walls[0]!.end.x - property.walls[0]!.start.x).toBeCloseTo(3.2, 7);
    expect(property.walls[1]!.start).toEqual(property.walls[0]!.end);
    expect(property.walls[1]!.end.x).toBeCloseTo(property.walls[0]!.end.x, 7);
    expect(property.openings).toEqual(baseline.openings);
    expect((await historyOf(page)).undoCount).toBe(baselineHistory.undoCount + 1);
    const propertyFingerprint = await inspectExport('property-length-3.2.glb', property);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await rendered(page);
    sameBuilding(await documentOf(page), baseline);

    const beforeDrag = await documentOf(page),
      dragHistory = await historyOf(page);
    const handle = await project(page, a.end.x, a.end.z, 0.15),
      target = await project(page, a.start.x + 3.2, a.end.z, 0);
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    expect((await diagnostics(page)).preview.dragging).toBe(true);
    await page.mouse.move(target.x, target.y, { steps: 10 });
    await rendered(page);
    const preview = await diagnostics(page);
    expect(preview.preview.valid).toBe(true);
    expect(preview.preview.visible).toBe(true);
    expect(await documentOf(page)).toEqual(beforeDrag);
    expect(await historyOf(page)).toEqual(dragHistory);
    record.preview = {
      documentUnchanged: true,
      historyUnchanged: true,
      valid: preview.preview.valid,
      dragging: preview.preview.dragging,
    };
    await page.mouse.up();
    await rendered(page);
    const dragged = await documentOf(page);
    expect(dragged.walls[0]!.end.x - dragged.walls[0]!.start.x).toBeCloseTo(3.2, 7);
    expect(dragged.walls[1]!.start).toEqual(dragged.walls[0]!.end);
    expect(dragged.walls[1]!.end.x).toBeCloseTo(dragged.walls[0]!.end.x, 7);
    expect(dragged.openings).toEqual(property.openings);
    expect((await historyOf(page)).undoCount).toBe(dragHistory.undoCount + 1);
    expect(await inspectExport('mouse-endpoint-length-3.2.glb', dragged)).toBe(propertyFingerprint);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await rendered(page);
    sameBuilding(await documentOf(page), baseline);
    const beforeCancel = await documentOf(page),
      cancelHistory = await historyOf(page),
      cancelHandle = await project(page, a.end.x, a.end.z, 0.15),
      cancelledTarget = await project(page, a.start.x + 3.6, a.end.z, 0);
    await page.mouse.move(cancelHandle.x, cancelHandle.y);
    await page.mouse.down();
    await page.mouse.move(cancelledTarget.x, cancelledTarget.y, { steps: 8 });
    await rendered(page);
    expect((await diagnostics(page)).preview.dragging).toBe(true);
    expect(await documentOf(page)).toEqual(beforeCancel);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await rendered(page);
    expect(await documentOf(page)).toEqual(beforeCancel);
    expect(await historyOf(page)).toEqual(cancelHistory);
    expect((await diagnostics(page)).preview.visible).toBe(false);
    expect((await diagnostics(page)).rendererId).toBe(rendererId);
    expect(await inspectExport('undo-and-cancel-restored.glb', beforeCancel)).toBe(
      originalFingerprint,
    );
    expect(errors).toEqual([]);
    record.status = 'passed';
    record.propertyLength = 3.2;
    record.mouseLength = 3.2;
    record.oneHistoryRecordPerEdit = true;
    record.undoRestoredConnectionDoorMaterialsAndUv = true;
    record.cancelDocumentAndHistoryUnchanged = true;
  } catch (failure) {
    record.status = 'failed';
    record.failure = failure instanceof Error ? failure.message : String(failure);
    throw failure;
  } finally {
    record.exports = exports;
    record.pageErrors = errors;
    await mkdir(resolve('test-results/theme-toggle/evidence'), { recursive: true });
    const path = resolve('test-results/theme-toggle/evidence/wall-roundtrip-validation.json');
    await writeFile(path, JSON.stringify(record, null, 2) + '\n');
    await testInfo.attach('wall-roundtrip-evidence', { path, contentType: 'application/json' });
  }
});
