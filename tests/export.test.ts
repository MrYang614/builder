import { beforeAll, describe, expect, it } from 'vitest';
import {
  AnimationMixer,
  LoopOnce,
  Mesh,
  Quaternion,
  QuaternionLinearInterpolant,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { validateBytes } from 'gltf-validator';
import { createExampleProject, type ProjectDocument } from '@building/editor-core';
import {
  buildBuilding,
  buildObject,
  doorRadians,
  doorAnimations,
} from '@building/three-runtime/scene';
import { ResourcePool } from '@building/three-runtime/materials';
import { exportGLB, exportGLTF } from '@building/three-runtime/export';

/** Node lacks FileReader; the actual Three exporter still produces and parses the final GLB. */
beforeAll(() => {
  class BlobReader {
    result: ArrayBuffer | string | null = null;
    onloadend: null | (() => void) = null;
    readAsArrayBuffer(blob: Blob) {
      void blob.arrayBuffer().then((buffer) => {
        this.result = buffer;
        this.onloadend?.();
      });
    }
    readAsDataURL(blob: Blob) {
      void blob.arrayBuffer().then((buffer) => {
        this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
        this.onloadend?.();
      });
    }
  }
  if (!globalThis.FileReader) {
    Object.defineProperty(globalThis, 'FileReader', { value: BlobReader, configurable: true });
  }
});
function document(): ProjectDocument {
  const doc = createExampleProject();
  doc.id = 'export_project';
  doc.openings
    .filter((o) => o.kind === 'door')
    .forEach((o, i) => {
      o.id = `test_door_${i}`;
      o.angle = i ? 45 : 0;
    });
  return doc;
}
function jsonFromGLB(buffer: ArrayBuffer): any {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  return JSON.parse(
    new TextDecoder().decode(bytes.slice(20, 20 + view.getUint32(12, true))).trim(),
  );
}
const quaternionEqual = (a: Quaternion, b: Quaternion) => Math.abs(a.dot(b)) > 1 - 1e-5;

describe('real glTF output A15–A22, A32, A38, A42', () => {
  it('produces Validator-clean GLB with every independent stable door track and snapshot posture', async () => {
    const doc = document(),
      original = structuredClone(doc),
      buffer = await exportGLB(doc);
    expect(doc).toEqual(original);
    const report = await validateBytes(new Uint8Array(buffer), {
      uri: 'building.glb',
      maxIssues: 1000,
    });
    expect(report.issues.numErrors).toBe(0);
    const json = jsonFromGLB(buffer);
    expect(json.animations).toHaveLength(4);
    expect(json.nodes.some((n: any) => /grid|preview|selection/i.test(n.name ?? ''))).toBe(false);
    for (const door of doc.openings.filter((o) => o.kind === 'door')) {
      const pivotIndex = json.nodes.findIndex((n: any) => n.name === `HingePivot_${door.id}`),
        pivot = json.nodes[pivotIndex];
      expect(pivot.matrix).toBeUndefined();
      const expected = new Quaternion().setFromAxisAngle(
        new Vector3(0, 1, 0),
        doorRadians(
          door,
          doc.walls.find((w) => w.id === door.wallId),
        ),
      );
      expect(quaternionEqual(new Quaternion(...(pivot.rotation ?? [0, 0, 0, 1])), expected)).toBe(
        true,
      );
      for (const animation of json.animations.filter((a: any) =>
        a.name.startsWith(`Door_${door.id}_`),
      )) {
        expect(animation.channels).toHaveLength(1);
        expect(animation.channels[0].target).toEqual({ node: pivotIndex, path: 'rotation' });
      }
    }
    expect(json.materials.filter((m: any) => m.alphaMode === 'BLEND')).toHaveLength(1); // shared glass only
    expect(json.nodes.filter((n: any) => n.name?.startsWith('Slab_'))).toHaveLength(
      doc.slabs.length,
    );
    // Warnings are evaluated here: exporter naming metadata does not hide invalid buffers.
    expect(
      report.issues.messages.filter((m: any) => m.severity === 1).map((m: any) => m.code),
    ).toEqual([]);
  });
  it('independently reloads the exported bytes and plays 0/50/100% without moving frames or other doors', async () => {
    const doc = document(),
      buffer = await exportGLB(doc);
    const loaded = await new GLTFLoader().parseAsync(buffer, '');
    expect(loaded.animations).toHaveLength(4);
    const mixer = new AnimationMixer(loaded.scene);
    for (const door of doc.openings.filter((o) => o.kind === 'door')) {
      const host = doc.walls.find((w) => w.id === door.wallId)!;
      const pivot = loaded.scene.getObjectByName(`HingePivot_${door.id}`)!;
      const frame = loaded.scene.getObjectByName(`Frame_${door.id}`)!;
      const frameBefore = frame.matrixWorld.clone(),
        position = pivot.getWorldPosition(new Vector3()).clone();
      for (const type of ['Open', 'Close']) {
        mixer.stopAllAction();
        const clip = loaded.animations.find((a) => a.name === `Door_${door.id}_${type}`)!;
        const action = mixer.clipAction(clip);
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
        action.reset().play();
        for (const fraction of [0, 0.5, 1]) {
          action.time = fraction * door.duration;
          mixer.update(0);
          loaded.scene.updateMatrixWorld(true);
          const degrees =
            type === 'Open'
              ? (door.closedAngle ?? 0) + fraction * (door.openAngle - (door.closedAngle ?? 0))
              : door.openAngle + fraction * ((door.closedAngle ?? 0) - door.openAngle);
          expect(
            quaternionEqual(
              pivot.quaternion,
              new Quaternion().setFromAxisAngle(
                new Vector3(0, 1, 0),
                doorRadians(door, host, degrees),
              ),
            ),
          ).toBe(true);
          expect(pivot.getWorldPosition(new Vector3()).distanceTo(position)).toBeLessThan(1e-6);
          expect(frame.matrixWorld.equals(frameBefore)).toBe(true);
        }
      }
    }
    loaded.scene.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        const mats = Array.isArray(object.material) ? object.material : [object.material];
        mats.forEach((m) => m.dispose());
      }
    });
  });
  it('exports JSON glTF with equivalent animations and no absolute resource locations', async () => {
    const doc = document(),
      json = (await exportGLTF(doc)) as any;
    expect(json.asset.version).toBe('2.0');
    expect(json.animations).toHaveLength(4);
    expect(
      json.buffers.every((b: any) => b.uri.startsWith('data:application/octet-stream;base64,')),
    ).toBe(true);
    const report = await validateBytes(new TextEncoder().encode(JSON.stringify(json)), {
      uri: 'building.gltf',
      maxIssues: 1000,
    });
    expect(report.issues.numErrors).toBe(0);
  });
  it('keeps shared resources alive until the last owner releases, and disposal is idempotent', () => {
    const doc = document(),
      pool = new ResourcePool(doc),
      a = buildObject(doc, doc.walls[0].id, pool),
      b = buildObject(doc, doc.walls[1].id, pool);
    expect(pool.stats.materials).toBe(3);
    expect(pool.stats.references).toBeGreaterThan(3);
    a.dispose();
    expect(pool.stats.materials).toBe(3);
    b.dispose();
    expect(pool.stats).toEqual({ materials: 0, textures: 0, references: 0 });
    a.dispose();
    b.dispose();
    pool.dispose();
    pool.dispose();
    const scene = buildBuilding(doc);
    expect(scene.resources.stats.materials).toBeGreaterThan(0);
    scene.dispose();
    expect(scene.resources.stats.materials).toBe(0);
  });
  it('preserves a signed sweep over 180 degrees rather than quaternion shortest-path reversal', () => {
    const doc = document(),
      door = doc.openings.find((o) => o.kind === 'door')!,
      host = doc.walls.find((w) => w.id === door.wallId)!;
    door.closedAngle = -150;
    door.openAngle = 150;
    const clip = doorAnimations(door, host)[0],
      track = clip.tracks[0],
      at = new QuaternionLinearInterpolant(track.times, track.values, 4).evaluate(0.5);
    expect(quaternionEqual(new Quaternion(at[0], at[1], at[2], at[3]), new Quaternion())).toBe(
      true,
    );
    expect(track.times.length).toBe(5);
  });
});
