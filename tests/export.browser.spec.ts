import { test, expect } from '@playwright/test';
import { validateBytes } from 'gltf-validator';
import path from 'node:path';

test('actual browser exports embedded A/B images and independently loads complete animated GLB', async ({
  page,
}) => {
  await page.goto('/');
  const source = `/@fs/${path.resolve('packages').replaceAll('\\', '/')}`;
  const result = await page.evaluate(async (source) => {
    const core = await import(`${source}/editor-core/src/index.ts`);
    const exporter = await import(`${source}/three-runtime/src/export.ts`);
    const modules = source.replace(/\/packages$/, '/node_modules');
    const threeUrl =
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((name) => /\/three\.js(?:\?|$)/.test(name)) ?? `${modules}/.vite/deps/three.js`;
    const loaderUrl = `${modules}/three/examples/jsm/loaders/GLTFLoader.js`;
    const THREE = await import(threeUrl);
    const { GLTFLoader } = await import(loaderUrl);
    const doc = core.createEmptyProject('Texture export verification');
    doc.id = 'browser_export';
    const a = core.createWall('level_1', { x: 0, z: 0 }, { x: 2.4, z: 0 }),
      b = core.createWall('level_1', { x: 2.4, z: 0 }, { x: 2.4, z: 1.8 });
    a.id = 'wall_browser_a';
    b.id = 'wall_browser_b';
    doc.walls = [a, b];
    const makeTexture = (id: string, colours: string[]) => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      colours.forEach((colour, index) => {
        ctx.fillStyle = colour;
        ctx.fillRect(index * 32, 0, 32, 32);
      });
      return { id, name: `${id}.png`, mime: 'image/png', dataUrl: canvas.toDataURL('image/png') };
    };
    // These are deliberately different project image data, independent of UI theme tokens.
    doc.resources = [
      makeTexture('image_a', ['#e63029', '#ffff00']),
      makeTexture('image_b', ['#2467ce', '#ffffff']),
    ];
    for (const wall of doc.walls) {
      wall.materials.A = { ...wall.materials.A, color: '#ffffff', resourceId: 'image_a' };
      wall.materials.B = { ...wall.materials.B, color: '#ffffff', resourceId: 'image_b' };
    }
    const door = core.createOpening(a, 'door', 0.3);
    door.id = 'browser_door';
    door.width = 0.8;
    door.angle = 45;
    doc.openings = [door];
    const before = JSON.stringify(doc);
    document.documentElement.classList.remove('dark');
    const buffer: ArrayBuffer = await exporter.exportGLB(doc);
    document.documentElement.classList.add('dark');
    const darkBuffer: ArrayBuffer = await exporter.exportGLB(doc);
    const loaded = await new GLTFLoader().parseAsync(buffer, '');
    loaded.scene.updateMatrixWorld(true);
    const maps = new Map<string, number[]>();
    let thicknessMaterialsHaveImages = false;
    loaded.scene.traverse((object: any) => {
      if (!(object instanceof THREE.Mesh)) {
        return;
      }
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material.name.startsWith('Colour_') && material.map) {
          thicknessMaterialsHaveImages = true;
        }
        if (!material.map || maps.has(material.name)) {
          continue;
        }
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(material.map.image, 0, 0);
        maps.set(material.name, Array.from(ctx.getImageData(0, 0, 1, 1).data));
      }
    });
    const faceU = (id: string, image: string, x: number, z: number): number[] => {
      const values: number[] = [];
      loaded.scene.getObjectByName(`Wall_${id}`)!.traverse((object: any) => {
        if (!(object instanceof THREE.Mesh)) {
          return;
        }
        const geometry = object.geometry,
          indices = geometry.getIndex(),
          positions = geometry.getAttribute('position'),
          uv = geometry.getAttribute('uv');
        for (let i = 0; i < indices.count; i++) {
          const group = geometry.groups.find((g: any) => i >= g.start && i < g.start + g.count),
            material = Array.isArray(object.material)
              ? object.material[group?.materialIndex ?? 0]
              : object.material;
          if (material.name !== image) {
            continue;
          }
          const index = indices.getX(i);
          if (
            Math.abs(positions.getX(index) - x) < 1e-5 &&
            Math.abs(positions.getZ(index) - z) < 1e-5
          ) {
            values.push(uv.getX(index));
          }
        }
      });
      return values;
    };
    const inner = [faceU(a.id, 'Image_image_a', 2.3, 0.1), faceU(b.id, 'Image_image_a', 2.3, 0.1)];
    const outer = [
      faceU(a.id, 'Image_image_b', 2.5, -0.1),
      faceU(b.id, 'Image_image_b', 2.5, -0.1),
    ];
    const pivot = loaded.scene.getObjectByName('HingePivot_browser_door')!,
      frame = loaded.scene.getObjectByName('Frame_browser_door')!;
    const framePosition = frame.getWorldPosition(new THREE.Vector3()).clone(),
      pivotPosition = pivot.getWorldPosition(new THREE.Vector3()).clone();
    const staticAngle = 2 * Math.atan2(pivot.quaternion.y, pivot.quaternion.w);
    const mixer = new THREE.AnimationMixer(loaded.scene),
      clip = loaded.animations.find((a: any) => a.name === 'Door_browser_door_Open')!;
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    const poses: number[] = [];
    let stable = true;
    for (const fraction of [0, 0.5, 1]) {
      action.time = fraction;
      mixer.update(0);
      loaded.scene.updateMatrixWorld(true);
      poses.push(2 * Math.atan2(pivot.quaternion.y, pivot.quaternion.w));
      stable &&=
        pivot.getWorldPosition(new THREE.Vector3()).distanceTo(pivotPosition) < 1e-6 &&
        frame.getWorldPosition(new THREE.Vector3()).distanceTo(framePosition) < 1e-6;
    }
    const jsonLength = new DataView(buffer).getUint32(12, true),
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
    const darkJSONLength = new DataView(darkBuffer).getUint32(12, true),
      darkJSON = JSON.parse(
        new TextDecoder().decode(new Uint8Array(darkBuffer, 20, darkJSONLength)),
      );
    return {
      bytes: Array.from(new Uint8Array(buffer)),
      staticAngle,
      poses,
      stable,
      inner,
      outer,
      themeSame: JSON.stringify(json) === JSON.stringify(darkJSON),
      unchanged: before === JSON.stringify(doc),
      images: [...maps],
      embedded: json.images.every((image: any) => image.bufferView !== undefined && !image.uri),
      thicknessMaterialsHaveImages,
      clips: loaded.animations.map((a: any) => a.name),
    };
  }, source);
  const report = await validateBytes(new Uint8Array(result.bytes), {
    uri: 'browser-textured.glb',
    maxIssues: 1000,
  });
  expect(report.issues.numErrors).toBe(0);
  expect(report.issues.numWarnings).toBe(0);
  expect(result.embedded).toBe(true);
  expect(result.unchanged).toBe(true);
  expect(result.thicknessMaterialsHaveImages).toBe(false);
  expect(result.themeSame).toBe(true);
  expect(result.inner[0].length).toBeGreaterThan(0);
  expect(result.inner[1].length).toBeGreaterThan(0);
  expect(result.inner[0][0]).toBeCloseTo(4.6, 5);
  expect(result.inner[0][0]).toBeCloseTo(result.inner[1][0], 5);
  expect(result.outer[0].length).toBeGreaterThan(0);
  expect(result.outer[1].length).toBeGreaterThan(0);
  expect(result.outer[0][0]).toBeCloseTo(5, 5);
  expect(result.outer[0][0]).toBeCloseTo(result.outer[1][0], 5);
  expect(result.images.find(([name]) => name === 'Image_image_a')?.[1]).toEqual([230, 48, 41, 255]);
  expect(result.images.find(([name]) => name === 'Image_image_b')?.[1]).toEqual([
    36, 103, 206, 255,
  ]);
  expect(result.staticAngle).toBeCloseTo(-Math.PI / 4, 5);
  expect(result.poses[0]).toBeCloseTo(0, 5);
  expect(result.poses[1]).toBeCloseTo(-Math.PI / 4, 5);
  expect(result.poses[2]).toBeCloseTo(-Math.PI / 2, 5);
  expect(result.stable).toBe(true);
  expect(result.clips).toEqual(['Door_browser_door_Open', 'Door_browser_door_Close']);
});
