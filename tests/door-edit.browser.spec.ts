import { evidencePath } from './evidence-path';
import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { validateBytes } from 'gltf-validator';
import type { Mesh, Object3D } from 'three';
import type { Opening, ProjectDocument } from '@building/editor-core';
import type { ThreeRuntime } from '@building/three-runtime';

interface Instrumented {
  __editor: {
    document(): ProjectDocument;
    history(): { undoCount: number; redoCount: number };
    diagnostics(): ReturnType<ThreeRuntime['diagnostics']>;
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

test('A10: door width/height, real drag, direct deletion and one undo update actual exported wall holes', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const record: Record<string, unknown> = {
    measuredAt: new Date().toISOString(),
    status: 'running',
    scope: 'Windows Chromium SwiftShader browser E2E; not native Tauri desktop acceptance',
    operations:
      'Real viewport mouse creates wall/door, inspector edits width and height, pointer drag moves door, direct door deletion and one Undo restore it. Every stage downloads and independently loads actual GLB output; no injected commands.',
  };
  const stages: Record<string, unknown>[] = [],
    errors: string[] = [];
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
    await clickWorld(page, 2, -1);
    await page.keyboard.press('Escape');
    const wall = (await documentOf(page)).walls[0]!;
    expect(wall.end.x - wall.start.x).toBeCloseTo(4, 7);

    async function inspect(name: string, opening: Opening | null) {
      await rendered(page);
      const wait = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export GLB', exact: true }).click();
      const download = await wait,
        file = resolve(testInfo.outputDir, `${name}.glb`);
      await download.saveAs(file);
      const bytes = await readFile(file),
        validation = await validateBytes(bytes, { uri: name });
      expect(validation.issues.numErrors).toBe(0);
      expect(validation.issues.numWarnings).toBe(0);
      const loader = `/@fs/${resolve('node_modules/three/examples/jsm/loaders/GLTFLoader.js').replaceAll('\\', '/')}`;
      const data = await page.evaluate(
        async ({ loader, bytes, wallId, wallStart, wallEnd, wallHeight, opening }) => {
          const { GLTFLoader } = await import(loader);
          const url = performance
            .getEntriesByType('resource')
            .map((entry) => entry.name)
            .find((name) => /\/three\.js(?:\?|$)/.test(name));
          if (!url) {
            throw new Error('Actual Three runtime module unavailable');
          }
          const THREE = await import(url),
            loaded = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
          loaded.scene.updateMatrixWorld(true);
          const root = loaded.scene.getObjectByName(`Wall_${wallId}`) as Object3D | undefined;
          if (!root) {
            throw new Error('Independent actual exported wall missing');
          }
          const coordinatesX: number[] = [],
            coordinatesY: number[] = [],
            faceAreas = { A: 0, B: 0 };
          const geometries: { positions: number[]; normals: number[]; indices: number[] }[] = [];
          root.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) {
              return;
            }
            const mesh = object as Mesh,
              position = mesh.geometry.getAttribute('position'),
              normal = mesh.geometry.getAttribute('normal'),
              index = mesh.geometry.getIndex();
            if (!position || !normal || !index) {
              throw new Error('Actual wall triangle attributes missing');
            }
            geometries.push({
              positions: Array.from({ length: position.count }, (_, i) => [
                position.getX(i),
                position.getY(i),
                position.getZ(i),
              ]).flat(),
              normals: Array.from({ length: normal.count }, (_, i) => [
                normal.getX(i),
                normal.getY(i),
                normal.getZ(i),
              ]).flat(),
              indices: Array.from({ length: index.count }, (_, i) => index.getX(i)),
            });
            for (let cursor = 0; cursor < index.count; cursor += 3) {
              const indices = [index.getX(cursor), index.getX(cursor + 1), index.getX(cursor + 2)],
                nz = normal.getZ(indices[0]!);
              if (Math.abs(nz) < 0.9) {
                continue;
              }
              const points = indices.map(
                (i) => new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)),
              );
              const area =
                points[1]!
                  .clone()
                  .sub(points[0]!)
                  .cross(points[2]!.clone().sub(points[0]!))
                  .length() / 2;
              faceAreas[nz > 0 ? 'A' : 'B'] += area;
              for (const point of points) {
                coordinatesX.push(point.x);
                coordinatesY.push(point.y);
              }
            }
          });
          const interior = (values: number[], low: number, high: number) =>
            [
              ...new Set(
                values
                  .filter((value) => value > low + 1e-5 && value < high - 1e-5)
                  .map((value) => Math.round(value * 1e5) / 1e5),
              ),
            ].sort((a, b) => a - b);
          const xs = interior(coordinatesX, wallStart.x, wallEnd.x),
            ys = interior(coordinatesY, 0, wallHeight);
          const openingRect =
            xs.length === 2 && ys.length === 1
              ? {
                  xMin: xs[0]!,
                  xMax: xs[1]!,
                  yMin: 0,
                  yMax: ys[0]!,
                  width: xs[1]! - xs[0]!,
                  height: ys[0]!,
                }
              : null;
          const ray = (x: number, y: number) =>
            new THREE.Raycaster(
              new THREE.Vector3(x, y, wallStart.z + 3),
              new THREE.Vector3(0, 0, -1),
            ).intersectObject(root, true).length;
          const probes = opening
            ? {
                centre: ray(wallStart.x + opening.offset + opening.width / 2, opening.height / 2),
                leftInside: ray(wallStart.x + opening.offset + 0.02, opening.height / 2),
                rightInside: ray(
                  wallStart.x + opening.offset + opening.width - 0.02,
                  opening.height / 2,
                ),
                leftOutside: ray(wallStart.x + opening.offset - 0.02, opening.height / 2),
                rightOutside: ray(
                  wallStart.x + opening.offset + opening.width + 0.02,
                  opening.height / 2,
                ),
                above: ray(wallStart.x + opening.offset + opening.width / 2, opening.height + 0.02),
              }
            : {
                centre: ray(0, 1),
                leftInside: ray(-1.3, 1),
                rightInside: ray(0.2, 1),
                leftOutside: ray(-1.9, 1),
                rightOutside: ray(1.9, 1),
                above: ray(0, wallHeight - 0.1),
              };
          const names: string[] = [];
          loaded.scene.traverse((object: Object3D) => names.push(object.name));
          const doorRoots = names.filter((name) => name.startsWith('DoorRoot_')),
            frames = names.filter((name) => name.startsWith('Frame_')),
            hinges = names.filter((name) => name.startsWith('HingePivot_'));
          let doorBox: { width: number; height: number; centreX: number } | null = null;
          let animation: {
            open: number[];
            close: number[];
            stablePivotAndFrame: boolean;
            tracks: { name: string; times: number[]; values: number[] }[][];
          } | null = null;
          if (opening) {
            const door = loaded.scene.getObjectByName(`DoorRoot_${opening.id}`),
              pivot = loaded.scene.getObjectByName(`HingePivot_${opening.id}`),
              frame = loaded.scene.getObjectByName(`Frame_${opening.id}`);
            if (!door || !pivot || !frame) {
              throw new Error('Actual exported door hierarchy is incomplete');
            }
            const bounds = new THREE.Box3().setFromObject(door),
              size = bounds.getSize(new THREE.Vector3()),
              centre = bounds.getCenter(new THREE.Vector3());
            doorBox = { width: size.x, height: size.y, centreX: centre.x };
            const pivotPosition = pivot.getWorldPosition(new THREE.Vector3()).clone(),
              framePosition = frame.getWorldPosition(new THREE.Vector3()).clone(),
              mixer = new THREE.AnimationMixer(loaded.scene);
            let stable = true;
            const sample = (suffix: string) => {
              const clip = loaded.animations.find(
                (candidate: { name: string }) => candidate.name === `Door_${opening.id}_${suffix}`,
              );
              if (!clip) {
                throw new Error(`Independent ${suffix} clip missing`);
              }
              const action = mixer.clipAction(clip);
              action.setLoop(THREE.LoopOnce, 1);
              action.clampWhenFinished = true;
              action.play();
              const angles: number[] = [];
              for (const fraction of [0, 0.5, 1]) {
                action.time = clip.duration * fraction;
                mixer.update(0);
                loaded.scene.updateMatrixWorld(true);
                angles.push(2 * Math.atan2(pivot.quaternion.y, pivot.quaternion.w));
                stable &&=
                  pivot.getWorldPosition(new THREE.Vector3()).distanceTo(pivotPosition) < 1e-6 &&
                  frame.getWorldPosition(new THREE.Vector3()).distanceTo(framePosition) < 1e-6;
              }
              action.stop();
              return angles;
            };
            const open = sample('Open'),
              close = sample('Close');
            animation = {
              open,
              close,
              stablePivotAndFrame: stable,
              tracks: loaded.animations.map(
                (clip: { tracks: { name: string; times: Float32Array; values: Float32Array }[] }) =>
                  clip.tracks.map((track) => ({
                    name: track.name,
                    times: [...track.times],
                    values: [...track.values],
                  })),
              ),
            };
            mixer.stopAllAction();
            mixer.uncacheRoot(loaded.scene);
          }
          const result = {
            faceAreas,
            openingRect,
            xs,
            ys,
            probes,
            doorRoots,
            frames,
            hinges,
            doorBox,
            animation,
            clips: loaded.animations.map((clip: { name: string }) => clip.name),
            geometries,
          };
          loaded.scene.traverse((object: Object3D) => {
            if (!(object instanceof THREE.Mesh)) {
              return;
            }
            const mesh = object as Mesh;
            mesh.geometry.dispose();
            for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
              material.dispose();
            }
          });
          return result;
        },
        {
          loader,
          bytes: [...bytes],
          wallId: wall.id,
          wallStart: wall.start,
          wallEnd: wall.end,
          wallHeight: wall.height,
          opening,
        },
      );
      const fullArea = (wall.end.x - wall.start.x) * wall.height,
        expectedArea = fullArea - (opening ? opening.width * opening.height : 0);
      expect(data.faceAreas.A).toBeCloseTo(expectedArea, 4);
      expect(data.faceAreas.B).toBeCloseTo(expectedArea, 4);
      if (opening) {
        expect(data.openingRect).not.toBeNull();
        expect(data.openingRect!.xMin).toBeCloseTo(wall.start.x + opening.offset, 5);
        expect(data.openingRect!.width).toBeCloseTo(opening.width, 5);
        expect(data.openingRect!.height).toBeCloseTo(opening.height, 5);
        expect(data.probes.centre).toBe(0);
        expect(data.probes.leftInside).toBe(0);
        expect(data.probes.rightInside).toBe(0);
        expect(data.probes.leftOutside).toBeGreaterThan(0);
        expect(data.probes.rightOutside).toBeGreaterThan(0);
        expect(data.probes.above).toBeGreaterThan(0);
        expect(data.doorRoots).toEqual([`DoorRoot_${opening.id}`]);
        expect(data.frames).toEqual([`Frame_${opening.id}`]);
        expect(data.hinges).toEqual([`HingePivot_${opening.id}`]);
        expect(data.doorBox!.width).toBeCloseTo(opening.width, 5);
        expect(data.doorBox!.height).toBeCloseTo(opening.height, 5);
        expect(data.doorBox!.centreX).toBeCloseTo(
          wall.start.x + opening.offset + opening.width / 2,
          5,
        );
        expect(data.clips).toEqual([`Door_${opening.id}_Open`, `Door_${opening.id}_Close`]);
        expect(data.animation!.stablePivotAndFrame).toBe(true);
        const sign =
          (opening.hinge === 'left' ? -1 : 1) * opening.direction * (wall.surfaceOrientation ?? 1);
        for (const [index, fraction] of [0, 0.5, 1].entries()) {
          expect(data.animation!.open[index]).toBeCloseTo(
            (sign * opening.openAngle * fraction * Math.PI) / 180,
            5,
          );
          expect(data.animation!.close[index]).toBeCloseTo(
            (sign * opening.openAngle * (1 - fraction) * Math.PI) / 180,
            5,
          );
        }
      } else {
        expect(data.openingRect).toBeNull();
        expect(data.xs).toEqual([]);
        expect(data.ys).toEqual([]);
        for (const hits of Object.values(data.probes)) {
          expect(hits).toBeGreaterThan(0);
        }
        expect(data.doorRoots).toEqual([]);
        expect(data.frames).toEqual([]);
        expect(data.hinges).toEqual([]);
        expect(data.clips).toEqual([]);
      }
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify({
            geometries: data.geometries,
            openingRect: data.openingRect,
            doorBox: data.doorBox,
            animation: data.animation,
          }),
        )
        .digest('hex');
      stages.push({
        name,
        file,
        bytes: bytes.length,
        validatorErrors: validation.issues.numErrors,
        validatorWarnings: validation.issues.numWarnings,
        opening: opening
          ? { id: opening.id, offset: opening.offset, width: opening.width, height: opening.height }
          : null,
        actualFaceAreas: data.faceAreas,
        actualOpeningRect: data.openingRect,
        probes: data.probes,
        actualDoorBox: data.doorBox,
        doorRoots: data.doorRoots,
        frames: data.frames,
        hinges: data.hinges,
        clips: data.clips,
        animation: data.animation,
        fingerprint,
      });
      return fingerprint;
    }
    const initialWallFingerprint = await inspect('01-wall-before-door', null);
    await page.getByRole('radio', { name: 'Door', exact: true }).click();
    await clickWorld(page, -0.8, -0.9, 1);
    await page.getByRole('radio', { name: 'Select', exact: true }).click();
    await rendered(page);
    let current = await documentOf(page);
    expect(current.openings).toHaveLength(1);
    expect(current.openings[0]!.wallId).toBe(wall.id);
    await inspect('02-placed-door', current.openings[0]!);
    async function dimension(
      label: string,
      value: string,
      property: 'width' | 'height',
      stage: string,
    ) {
      const history = await historyOf(page),
        input = page.getByLabel(label, { exact: true });
      await input.fill(value);
      await input.press('Enter');
      await rendered(page);
      current = await documentOf(page);
      expect(current.openings[0]![property]).toBe(Number(value));
      expect((await historyOf(page)).undoCount).toBe(history.undoCount + 1);
      await inspect(stage, current.openings[0]!);
    }
    await dimension('Opening width (m)', '1.2', 'width', '03-door-width-1.2');
    await dimension('Opening height (m)', '2.35', 'height', '04-door-height-2.35');
    const beforeFocus = await diagnostics(page);
    await page.getByRole('button', { name: 'Whole building', exact: true }).click();
    await page.waitForFunction((frame) => {
      const d = (window as unknown as Instrumented).__editor.diagnostics();
      return d.frameCount > frame && !d.pendingFrame;
    }, beforeFocus.frameCount);
    await rendered(page);
    const beforeDrag = await documentOf(page),
      beforeDragHistory = await historyOf(page),
      beforeOpening = beforeDrag.openings[0]!;
    const start = await project(
      page,
      wall.start.x + beforeOpening.offset + beforeOpening.width / 2,
      wall.start.z + 0.03,
      beforeOpening.height / 2,
    );
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    expect((await diagnostics(page)).preview.dragging).toBe(true);
    await page.mouse.move(start.x + 40, start.y, { steps: 10 });
    await rendered(page);
    expect((await diagnostics(page)).preview.valid).toBe(true);
    expect(await documentOf(page)).toEqual(beforeDrag);
    expect(await historyOf(page)).toEqual(beforeDragHistory);
    await page.mouse.up();
    await rendered(page);
    const moved = await documentOf(page),
      movedDoor = moved.openings[0]!;
    expect(movedDoor.offset).toBeGreaterThan(beforeOpening.offset + 0.1);
    expect(movedDoor.width).toBe(1.2);
    expect(movedDoor.height).toBe(2.35);
    expect(movedDoor.wallId).toBe(wall.id);
    expect((await historyOf(page)).undoCount).toBe(beforeDragHistory.undoCount + 1);
    const movedFingerprint = await inspect('05-real-pointer-moved-door', movedDoor);
    const beforeDeleteHistory = await historyOf(page);
    await page.locator('.inspector').getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await rendered(page);
    const deleted = await documentOf(page);
    expect(deleted.walls).toEqual(moved.walls);
    expect(deleted.openings).toHaveLength(0);
    expect((await historyOf(page)).undoCount).toBe(beforeDeleteHistory.undoCount + 1);
    expect(await inspect('06-direct-door-delete-solid-wall', null)).toBe(initialWallFingerprint);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await rendered(page);
    const restored = await documentOf(page);
    expect(restored.openings).toEqual(moved.openings);
    expect(restored.walls).toEqual(moved.walls);
    expect((await historyOf(page)).undoCount).toBe(beforeDeleteHistory.undoCount);
    expect(await inspect('07-one-undo-restored-door-and-clips', restored.openings[0]!)).toBe(
      movedFingerprint,
    );
    expect(errors).toEqual([]);
    record.status = 'passed';
    record.singleDragHistoryRecord = true;
    record.singleDeleteUndoRestored = true;
    record.directDoorDeletionRestoredOriginalSolidWall = true;
    record.restoredExportGeometryDoorAndAnimationIdentical = true;
  } catch (failure) {
    record.status = 'failed';
    record.failure = failure instanceof Error ? failure.message : String(failure);
    throw failure;
  } finally {
    record.stages = stages;
    record.pageErrors = errors;
    await mkdir(resolve(evidencePath('theme-toggle/evidence')), { recursive: true });
    const file = resolve(evidencePath('theme-toggle/evidence/door-edit-validation.json'));
    await writeFile(file, JSON.stringify(record, null, 2) + '\n');
    await testInfo.attach('door-edit-independent-export-evidence', {
      path: file,
      contentType: 'application/json',
    });
  }
});
