import { evidencePath } from './evidence-path';
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { validateBytes } from 'gltf-validator';

test('generate portable editable two-storey examples and independently verify all door clips', async ({
  page,
}) => {
  await page.goto('/');
  const workspace = `/@fs/${path.resolve('.').replaceAll('\\', '/')}`;
  const result = await page.evaluate(async (workspace) => {
    const core = await import(`${workspace}/packages/editor-core/src/index.ts`);
    const { builtInResources } = await import(`${workspace}/apps/desktop/src/app/materials.ts`);
    const container = await import(`${workspace}/apps/desktop/src/platform/container.ts`);
    const exporter = await import(`${workspace}/packages/three-runtime/src/export.ts`);
    const scene = await import(`${workspace}/packages/three-runtime/src/scene.ts`);
    const threeUrl =
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((name) => /\/three\.js(?:\?|$)/.test(name)) ??
      `${workspace}/node_modules/.vite/deps/three.js`;
    const THREE = await import(threeUrl),
      loaderUrl = `${workspace}/node_modules/three/examples/jsm/loaders/GLTFLoader.js`,
      { GLTFLoader } = await import(loaderUrl);
    const doc = core.createExampleProject();
    doc.id = 'example_two_storeys';
    doc.name = 'Two storeys with independent animated doors';
    const wallIds = new Map<string, string>();
    doc.walls.forEach((wall: any, index: number) => {
      const id = `example_wall_${Math.floor(index / 4) + 1}_${(index % 4) + 1}`;
      wallIds.set(wall.id, id);
      wall.id = id;
    });
    doc.slabs.forEach((slab: any, index: number) => {
      slab.id = slab.purpose === 'roof' ? 'example_roof' : `example_floor_${index + 1}`;
    });
    doc.openings.forEach((opening: any) => {
      opening.wallId = wallIds.get(opening.wallId);
      opening.id = `example_${opening.kind}_${opening.levelId}`;
    });
    doc.resources = structuredClone(builtInResources);
    for (const wall of doc.walls) {
      wall.materials.A = { ...wall.materials.A, color: '#ffffff', resourceId: 'builtin_brick' };
      wall.materials.B = { ...wall.materials.B, color: '#ffffff', resourceId: 'builtin_plaster' };
    }
    for (const slab of doc.slabs) {
      slab.materials.top = {
        ...slab.materials.top,
        color: '#ffffff',
        resourceId: slab.purpose === 'roof' ? 'builtin_tile' : 'builtin_wood',
        tileWidth: 0.8,
        tileHeight: 0.8,
      };
      slab.materials.bottom = {
        ...slab.materials.bottom,
        color: '#ffffff',
        resourceId: 'builtin_plaster',
      };
    }
    for (const door of doc.openings.filter((o: any) => o.kind === 'door')) {
      door.materials.A = { ...door.materials.A, color: '#ffffff', resourceId: 'builtin_wood' };
      door.materials.B = { ...door.materials.B, color: '#ffffff', resourceId: 'builtin_plaster' };
    }
    doc.continuity = doc.levels.flatMap((level: any) =>
      ['A', 'B'].map((side) => {
        const walls = doc.walls.filter((wall: any) => wall.levelId === level.id),
          anchor = { wallId: walls[0].id, side, endpoint: 'start' };
        return {
          id: `example_route_${level.id}_${side}`,
          members: walls.map((wall: any) => ({ wallId: wall.id, side, direction: 1 })),
          anchor,
          seam: anchor,
          verticalOrigin: 0,
        };
      }),
    );
    const variants = [];
    for (const roof of [true, false]) {
      const document = structuredClone(doc);
      if (!roof) {
        document.slabs = document.slabs.filter((slab: any) => slab.purpose !== 'roof');
        document.revision = 1;
      }
      const formal = JSON.stringify(document),
        project = await container.encodeProjectContainer(document),
        reopened = await container.decodeProjectContainer(project);
      if (JSON.stringify(reopened) !== formal) {
        throw new Error('Example container roundtrip changed formal data');
      }
      const glb: ArrayBuffer = await exporter.exportGLB(document),
        loaded = await new GLTFLoader().parseAsync(glb, '');
      loaded.scene.updateMatrixWorld(true);
      const mixer = new THREE.AnimationMixer(loaded.scene),
        doors = document.openings.filter((opening: any) => opening.kind === 'door'),
        checks = [];
      for (const door of doors) {
        const host = document.walls.find((wall: any) => wall.id === door.wallId),
          pivot = loaded.scene.getObjectByName(`HingePivot_${door.id}`),
          frame = loaded.scene.getObjectByName(`Frame_${door.id}`);
        const staticDegrees =
          (2 * Math.atan2(pivot.quaternion.y, pivot.quaternion.w) * 180) / Math.PI;
        for (const type of ['Open', 'Close']) {
          mixer.stopAllAction();
          loaded.scene.updateMatrixWorld(true);
          const frameMatrix = frame.matrixWorld.clone(),
            hingePosition = pivot.getWorldPosition(new THREE.Vector3()),
            others = doors
              .filter((other: any) => other.id !== door.id)
              .map((other: any) => ({
                node: loaded.scene.getObjectByName(`HingePivot_${other.id}`),
                quaternion: loaded.scene
                  .getObjectByName(`HingePivot_${other.id}`)
                  .quaternion.clone(),
              }));
          const clip = loaded.animations.find(
            (clip: any) => clip.name === `Door_${door.id}_${type}`,
          );
          if (!clip) {
            throw new Error('Missing independent door clip');
          }
          const action = mixer.clipAction(clip);
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          action.reset().play();
          const poses = [];
          for (const fraction of [0, 0.5, 1]) {
            action.time = fraction * door.duration;
            mixer.update(0);
            loaded.scene.updateMatrixWorld(true);
            const closed = door.closedAngle ?? 0,
              angle =
                type === 'Open'
                  ? closed + fraction * (door.openAngle - closed)
                  : door.openAngle + fraction * (closed - door.openAngle),
              expected = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                scene.doorRadians(door, host, angle),
              );
            if (
              Math.abs(pivot.quaternion.dot(expected)) < 1 - 1e-5 ||
              pivot.getWorldPosition(new THREE.Vector3()).distanceTo(hingePosition) > 1e-6 ||
              !frame.matrixWorld.equals(frameMatrix) ||
              others.some(
                (other: any) => Math.abs(other.node.quaternion.dot(other.quaternion)) < 1 - 1e-5,
              )
            ) {
              throw new Error('Independent animation changed pose, hinge, frame or another door');
            }
            poses.push((2 * Math.atan2(pivot.quaternion.y, pivot.quaternion.w) * 180) / Math.PI);
          }
          checks.push({
            clip: clip.name,
            fractions: [0, 0.5, 1],
            degrees: poses,
            frameAndHingeStable: true,
            otherDoorsUnaffected: true,
            staticDegrees,
          });
        }
      }
      const bounds = new THREE.Box3().setFromObject(loaded.scene),
        jsonLength = new DataView(glb).getUint32(12, true),
        json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, jsonLength)));
      variants.push({
        name: roof ? 'two-storeys' : 'two-storeys-open-roof',
        source: JSON.stringify(document, null, 2),
        project: Array.from(project as Uint8Array),
        glb: Array.from(new Uint8Array(glb)),
        summary: {
          roof,
          projectRevision: document.revision,
          levels: document.levels.length,
          walls: document.walls.length,
          slabs: document.slabs.length,
          doors: doors.length,
          windows: document.openings.length - doors.length,
          images: json.images.length,
          allImagesEmbedded: json.images.every(
            (image: any) => image.bufferView !== undefined && !image.uri,
          ),
          boundingBoxMetres: { min: bounds.min.toArray(), max: bounds.max.toArray() },
          animations: checks,
        },
      });
      loaded.scene.traverse((object: any) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material]) {
            material.map?.dispose();
            material.dispose();
          }
        }
      });
    }
    return variants;
  }, workspace);
  mkdirSync(evidencePath('theme-toggle/evidence/examples'), { recursive: true });
  mkdirSync(evidencePath('theme-toggle/evidence'), { recursive: true });
  const reports = [];
  for (const variant of result) {
    const glb = new Uint8Array(variant.glb),
      report = await validateBytes(glb, { uri: `${variant.name}.glb`, maxIssues: 1000 });
    expect(report.issues.numErrors).toBe(0);
    expect(report.issues.numWarnings).toBe(0);
    expect(variant.summary.allImagesEmbedded).toBe(true);
    writeFileSync(
      evidencePath(`theme-toggle/evidence/examples/${variant.name}.building`),
      new Uint8Array(variant.project),
    );
    writeFileSync(evidencePath(`theme-toggle/evidence/examples/${variant.name}.glb`), glb);
    writeFileSync(
      evidencePath(`theme-toggle/evidence/examples/${variant.name}.source.json`),
      `${variant.source}\n`,
    );
    const information = report.issues.messages
      .filter((issue) => issue.severity > 1)
      .reduce<Record<string, number>>((counts, issue) => {
        counts[issue.code] = (counts[issue.code] ?? 0) + 1;
        return counts;
      }, {});
    reports.push({
      file: evidencePath(`theme-toggle/evidence/examples/${variant.name}.glb`),
      byteLength: glb.byteLength,
      projectByteLength: variant.project.length,
      validator: {
        errors: report.issues.numErrors,
        warnings: report.issues.numWarnings,
        information: report.issues.numInfos,
        hints: report.issues.numHints,
        errorAndWarningMessages: report.issues.messages.filter((issue) => issue.severity <= 1),
        informationCodes: information,
        informationAssessment:
          'UNUSED_OBJECT refers to UV attributes retained on pure-colour primitives by the shared grouped BufferGeometry; these materials intentionally sample no texture.',
      },
      independentChromiumGLTFLoader: variant.summary,
    });
  }
  writeFileSync(
    evidencePath('theme-toggle/evidence/export-validation.json'),
    `${JSON.stringify({ measuredAt: new Date().toISOString(), scope: 'Actual Chromium WebGL/browser export and independent GLTFLoader plus Khronos Validator. Browser results do not substitute for Tauri desktop or macOS acceptance.', reports }, null, 2)}\n`,
  );
});
