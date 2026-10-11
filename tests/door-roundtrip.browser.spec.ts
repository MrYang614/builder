import { evidencePath } from './evidence-path';
import { test, expect, type Page } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateBytes } from 'gltf-validator';
import type { ProjectDocument } from '@building/editor-core';
type Instrumented = {
  __editor: {
    document: () => ProjectDocument;
    history: () => { undoCount: number };
    diagnostics: () => { rendererId: string; preview: { dragging: boolean; valid: boolean } };
    project: (p: { x: number; y: number; z: number }) => { x: number; y: number };
  };
};
const snapshot = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.document());
async function setNumber(page: Page, label: string, value: string) {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(value);
  await field.press('Enter');
}
async function choose(page: Page, label: string, value: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: value, exact: true }).click();
}
async function save(page: Page, file: string) {
  const wait = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const download = await wait;
  await download.saveAs(file);
  const bytes = await readFile(file);
  expect([...bytes.subarray(0, 2)]).toEqual([80, 75]);
  await expect(page.getByTestId('dirty-state')).toHaveText('已保存');
  return bytes.length;
}

test('actual save/open/move/hinge/direction/save/GLB roundtrip preserves half-open pose and complete independent door clips', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Instrumented).__editor);
  const rendererId = await page.evaluate(
    () => (window as unknown as Instrumented).__editor.diagnostics().rendererId,
  );
  await page.getByRole('button', { name: '可编辑示例', exact: true }).click();
  await page.getByRole('button', { name: '门 6', exact: true }).click();
  await setNumber(page, '当前角度（°）', '45');
  const first = await snapshot(page),
    firstDoor = first.openings.find((o) => o.kind === 'door')!;
  expect(firstDoor.angle).toBe(45);
  const firstFile = resolve(testInfo.outputDir, 'moved folder 中文/half-open.building');
  const firstBytes = await save(page, firstFile);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await (await chooser).setFiles(firstFile);
  await expect(page.getByText('工程已打开', { exact: true })).toBeVisible();
  await expect.poll(async () => (await snapshot(page)).id).toBe(first.id);
  await expect.poll(async () => (await snapshot(page)).revision).toBe(first.revision);
  expect(await snapshot(page)).toEqual(first);
  await page.getByRole('button', { name: '门 6', exact: true }).click();
  await expect(page.getByLabel('当前角度（°）', { exact: true })).toHaveValue('45');
  await page.getByRole('button', { name: '聚焦选中', exact: true }).click();
  const host = first.walls.find((w) => w.id === firstDoor.wallId)!,
    level = first.levels.find((l) => l.id === firstDoor.levelId)!;
  const length = Math.hypot(host.end.x - host.start.x, host.end.z - host.start.z),
    ux = (host.end.x - host.start.x) / length,
    uz = (host.end.z - host.start.z) / length;
  const bar = Math.min(0.06, firstDoor.width / 8, firstDoor.height / 8),
    leafWidth = firstDoor.width - 2 * bar,
    hingeDistance = firstDoor.offset + bar;
  // Click the actual rotated leaf, whose centre is outside the closed wall plane at 45°.
  const leafX = (leafWidth / 2) * Math.cos(Math.PI / 4),
    leafZ = (leafWidth / 2) * Math.sin(Math.PI / 4);
  const point = {
    x: host.start.x + ux * (hingeDistance + leafX) - uz * leafZ,
    y: level.elevation + firstDoor.height / 2,
    z: host.start.z + uz * (hingeDistance + leafX) + ux * leafZ,
  };
  const client = await page.evaluate(
      (p) => (window as unknown as Instrumented).__editor.project(p),
      point,
    ),
    beforeDrag = await page.evaluate(
      () => (window as unknown as Instrumented).__editor.history().undoCount,
    );
  await page.mouse.move(client.x, client.y);
  await page.mouse.down();
  expect(
    await page.evaluate(
      () => (window as unknown as Instrumented).__editor.diagnostics().preview.dragging,
    ),
  ).toBe(true);
  await page.mouse.move(client.x + 25, client.y, { steps: 8 });
  expect(
    await page.evaluate(
      () => (window as unknown as Instrumented).__editor.diagnostics().preview.valid,
    ),
  ).toBe(true);
  await page.mouse.up();
  let moved = await snapshot(page);
  expect(moved.openings.find((o) => o.id === firstDoor.id)!.offset).not.toBe(firstDoor.offset);
  expect(moved.openings.find((o) => o.id === firstDoor.id)!.angle).toBe(45);
  expect(
    await page.evaluate(() => (window as unknown as Instrumented).__editor.history().undoCount),
  ).toBe(beforeDrag + 1);
  await choose(page, '铰链侧', '右侧');
  await choose(page, '朝向开启', 'B 面');
  moved = await snapshot(page);
  const changed = moved.openings.find((o) => o.id === firstDoor.id)!;
  expect(changed).toMatchObject({ angle: 45, hinge: 'right', direction: -1 });
  const secondFile = resolve(testInfo.outputDir, 'moved folder 中文/moved-right-hinge.building'),
    secondBytes = await save(page, secondFile),
    beforeExport = await snapshot(page);
  const downloadWait = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 GLB', exact: true }).click();
  const download = await downloadWait;
  const glbFile = resolve(testInfo.outputDir, 'actual-half-open-roundtrip.glb');
  await download.saveAs(glbFile);
  const bytes = await readFile(glbFile);
  expect(await snapshot(page)).toEqual(beforeExport);
  expect(
    await page.evaluate(
      () => (window as unknown as Instrumented).__editor.diagnostics().rendererId,
    ),
  ).toBe(rendererId);
  const validation = await validateBytes(bytes, { uri: 'actual-half-open-roundtrip.glb' });
  expect(validation.issues.numErrors).toBe(0);
  expect(validation.issues.numWarnings).toBe(0);
  const jsonLength = bytes.readUInt32LE(12),
    json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString()),
    doors = beforeExport.openings.filter((o) => o.kind === 'door');
  expect(json.animations).toHaveLength(doors.length * 2);
  for (const door of doors) {
    const pivotIndex = json.nodes.findIndex(
      (node: { name?: string }) => node.name === `HingePivot_${door.id}`,
    );
    expect(pivotIndex).toBeGreaterThanOrEqual(0);
    expect(json.nodes[pivotIndex].matrix).toBeUndefined();
    for (const suffix of ['Open', 'Close']) {
      const clip = json.animations.find(
        (animation: { name: string }) => animation.name === `Door_${door.id}_${suffix}`,
      );
      expect(clip.channels).toHaveLength(1);
      expect(clip.channels[0].target).toEqual({ node: pivotIndex, path: 'rotation' });
    }
  }
  const loader = `/@fs/${resolve('node_modules/three/examples/jsm/loaders/GLTFLoader.js').replaceAll('\\', '/')}`;
  const independent = await page.evaluate(
    async ({ loader, bytes, doc }) => {
      const { GLTFLoader } = await import(loader),
        url = performance
          .getEntriesByType('resource')
          .map((entry) => entry.name)
          .find((name) => /\/three\.js(?:\?|$)/.test(name)),
        THREE = await import(url!);
      const gltf = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
      gltf.scene.updateMatrixWorld(true);
      const mixer = new THREE.AnimationMixer(gltf.scene),
        doors = doc.openings.filter((o) => o.kind === 'door'),
        results = [];
      const radians = (door: (typeof doors)[number], angle: number) =>
        ((angle * Math.PI) / 180) *
        (door.hinge === 'left' ? -1 : 1) *
        door.direction *
        (doc.walls.find((w) => w.id === door.wallId)?.surfaceOrientation ?? 1);
      const orientation = (door: (typeof doors)[number], angle: number) =>
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), radians(door, angle));
      const distance = (a: number[], b: number[]) =>
        Math.hypot(...a.map((value, index) => value - b[index]!));
      for (const door of doors) {
        const pivot = gltf.scene.getObjectByName(`HingePivot_${door.id}`),
          frame = gltf.scene.getObjectByName(`Frame_${door.id}`),
          panel = gltf.scene.getObjectByName(`DoorPanel_${door.id}`);
        if (!pivot || !frame || !panel) {
          throw new Error('Independent hierarchy missing');
        }
        const host = doc.walls.find((w) => w.id === door.wallId)!,
          level = doc.levels.find((l) => l.id === door.levelId)!,
          length = Math.hypot(host.end.x - host.start.x, host.end.z - host.start.z),
          bar = Math.min(0.06, door.width / 8, door.height / 8),
          leafWidth = door.width - 2 * bar;
        const along =
            door.offset + door.width / 2 + ((door.hinge === 'left' ? -1 : 1) * leafWidth) / 2,
          expectedPosition = [
            host.start.x + ((host.end.x - host.start.x) / length) * along,
            level.elevation + door.sill,
            host.start.z + ((host.end.z - host.start.z) / length) * along,
          ];
        const staticError = pivot.quaternion
            .clone()
            .normalize()
            .angleTo(orientation(door, door.angle)),
          initialPosition = pivot.getWorldPosition(new THREE.Vector3()).toArray();
        const positionError = distance(initialPosition, expectedPosition),
          frameMatrix = frame.matrixWorld.toArray(),
          closed = door.closedAngle ?? 0,
          clips = [];
        for (const name of ['Open', 'Close']) {
          mixer.stopAllAction();
          const others = doors
            .filter((other) => other.id !== door.id)
            .map((other) => ({
              id: other.id,
              quaternion: gltf.scene.getObjectByName(`HingePivot_${other.id}`).quaternion.clone(),
            }));
          const clip = gltf.animations.find(
            (clip: { name: string }) => clip.name === `Door_${door.id}_${name}`,
          );
          if (!clip) {
            throw new Error('Independent clip missing');
          }
          const action = mixer.clipAction(clip);
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          action.reset().play();
          const samples = [];
          for (const fraction of [0, 0.5, 1]) {
            action.time = fraction * door.duration;
            mixer.update(0);
            gltf.scene.updateMatrixWorld(true);
            const angle =
              name === 'Open'
                ? closed + fraction * (door.openAngle - closed)
                : door.openAngle + fraction * (closed - door.openAngle);
            samples.push({
              fraction,
              expectedAngle: angle,
              quaternionError: pivot.quaternion
                .clone()
                .normalize()
                .angleTo(orientation(door, angle)),
              pivotShift: distance(
                pivot.getWorldPosition(new THREE.Vector3()).toArray(),
                initialPosition,
              ),
              frameShift: distance(frame.matrixWorld.toArray(), frameMatrix),
              otherDoorError: Math.max(
                0,
                ...others.map((other) =>
                  gltf.scene
                    .getObjectByName(`HingePivot_${other.id}`)
                    .quaternion.clone()
                    .normalize()
                    .angleTo(other.quaternion.clone().normalize()),
                ),
              ),
              leafWorldCentre: panel.getWorldPosition(new THREE.Vector3()).toArray(),
            });
          }
          clips.push({ name: clip.name, samples });
        }
        results.push({
          id: door.id,
          currentAngle: door.angle,
          hinge: door.hinge,
          direction: door.direction,
          staticError,
          expectedPosition,
          initialPosition,
          positionError,
          clips,
        });
      }
      const textures = new Set<import('three').Texture>();
      gltf.scene.traverse((node: import('three').Object3D) => {
        if ((node as import('three').Mesh).isMesh) {
          const mesh = node as import('three').Mesh;
          mesh.geometry.dispose();
          for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            const map = (material as import('three').MeshStandardMaterial).map;
            if (map) {
              textures.add(map);
            }
            material.dispose();
          }
        }
      });
      textures.forEach((texture) => texture.dispose());
      mixer.stopAllAction();
      mixer.uncacheRoot(gltf.scene);
      return results;
    },
    { loader, bytes: [...bytes], doc: beforeExport },
  );
  for (const door of independent) {
    expect(door.staticError).toBeLessThan(1e-6);
    expect(door.positionError).toBeLessThan(1e-6);
    for (const clip of door.clips) {
      for (const sample of clip.samples) {
        expect(sample.quaternionError).toBeLessThan(1e-6);
        expect(sample.pivotShift).toBeLessThan(1e-6);
        expect(sample.frameShift).toBeLessThan(1e-6);
        expect(sample.otherDoorError).toBeLessThan(1e-6);
      }
    }
    expect(door.clips[0]!.samples[0]!.leafWorldCentre).not.toEqual(
      door.clips[0]!.samples[2]!.leafWorldCentre,
    );
  }
  expect(await snapshot(page)).toEqual(beforeExport);
  await mkdir(evidencePath('theme-toggle/evidence'), { recursive: true });
  await writeFile(
    evidencePath('theme-toggle/evidence/door-roundtrip-validation.json'),
    JSON.stringify(
      {
        platform: 'Windows Chromium SwiftShader browser; not native Tauri/macOS acceptance',
        path: 'Actual UI example → 45° → Save download → file chooser Open → pointer drag → hinge/direction edits → Save download → GLB download → independent GLTFLoader playback',
        firstProjectBytes: firstBytes,
        secondProjectBytes: secondBytes,
        glbBytes: bytes.length,
        changedDoor: {
          id: changed.id,
          oldOffset: firstDoor.offset,
          newOffset: changed.offset,
          currentAngle: changed.angle,
          hinge: changed.hinge,
          direction: changed.direction,
        },
        validator: { errors: validation.issues.numErrors, warnings: validation.issues.numWarnings },
        rendererStable: true,
        documentUnchangedByExport: true,
        independent,
      },
      null,
      2,
    ),
  );
});
