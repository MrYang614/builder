import { describe, expect, it } from 'vitest';
import {
  BoxGeometry,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
  type Intersection,
} from 'three';
import { acceleratedRaycast, MeshBVH } from 'three-mesh-bvh';
import {
  createEmptyProject,
  createOpening,
  createSlab,
  createWall,
  type ProjectDocument,
} from '@building/editor-core';
import { buildBuilding, buildObject, doorRadians } from '@building/three-runtime/scene';
import { acquireMeshBvh, bvhDiagnostics } from '@building/three-runtime/bvh';

function document(): ProjectDocument {
  const doc = createEmptyProject();
  const wall = createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 0 });
  wall.id = 'bvh_wall';
  const door = createOpening(wall, 'door', 0.4);
  door.id = 'bvh_door';
  door.width = 0.8;
  door.angle = 45;
  const window = createOpening(wall, 'window', 2.2);
  window.id = 'bvh_window';
  window.width = 1.1;
  doc.walls.push(wall);
  doc.openings.push(door, window);
  doc.slabs.push(createSlab('level_1', { x: -1, z: -1 }, { x: 5, z: 1 }, 0));
  return doc;
}

function meshes(root: import('three').Object3D): Mesh[] {
  const result: Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof Mesh) {
      result.push(object);
    }
  });
  return result;
}

function compareHits(actual: Intersection[], expected: Intersection[]): void {
  expect(actual).toHaveLength(expected.length);
  for (let index = 0; index < expected.length; index++) {
    const a = actual[index]!;
    const b = expected[index]!;
    expect(a.faceIndex).toBe(b.faceIndex);
    expect(a.face?.materialIndex).toBe(b.face?.materialIndex);
    expect(a.face?.a).toBe(b.face?.a);
    expect(a.face?.b).toBe(b.face?.b);
    expect(a.face?.c).toBe(b.face?.c);
    expect(a.distance).toBeCloseTo(b.distance, 9);
    expect(a.point.distanceTo(b.point)).toBeLessThan(1e-9);
    expect(a.uv?.distanceTo(b.uv!)).toBeLessThan(1e-9);
    expect(a.normal?.distanceTo(b.normal!)).toBeLessThan(1e-9);
    expect(a.face?.normal.distanceTo(b.face!.normal)).toBeLessThan(1e-9);
  }
}

function cast(mesh: Mesh, origin: number[], direction: number[], firstHitOnly = false) {
  const caster = new Raycaster(new Vector3(...origin), new Vector3(...direction).normalize());
  caster.firstHitOnly = firstHitOnly;
  return caster.intersectObject(mesh, false);
}

describe('local indirect BVH picking keeps geometry and surface identity', () => {
  it('matches native raycasts on both wall faces, real holes, reveals, top and end caps', () => {
    const doc = document();
    const before = structuredClone(doc);
    const plain = buildObject(doc, doc.walls[0]!.id);
    const original = meshes(plain.root)[0]!;
    // GeometryData buffers are shared by the snapshot context. Capture before BVH
    // construction so an accidental in-place reorder cannot change both comparands.
    const initialIndex = original.geometry.index!.array.slice();
    const initialGroups = structuredClone(original.geometry.groups);
    const initialUserData = structuredClone(original.geometry.userData);
    const initialAttributes = new Map(
      ['position', 'normal', 'uv'].map((name) => [
        name,
        original.geometry.getAttribute(name).array.slice(),
      ]),
    );
    const fast = buildObject(doc, doc.walls[0]!.id, undefined, { acceleratePicking: true });
    const accelerated = meshes(fast.root)[0]!;
    original.updateWorldMatrix(true, true);
    accelerated.updateWorldMatrix(true, true);
    const probes = [
      { name: 'A', origin: [1.75, 1.17, 2], direction: [0, 0, -1], role: 'A' },
      { name: 'B', origin: [1.75, 1.17, -2], direction: [0, 0, 1], role: 'B' },
      { name: 'door hole', origin: [0.67, 1.08, 2], direction: [0, 0, -1], role: null },
      { name: 'window hole', origin: [2.77, 1.27, 2], direction: [0, 0, -1], role: null },
      { name: 'door jamb', origin: [1.04, 1.13, 0], direction: [1, 0, 0], role: 'reveal' },
      { name: 'window sill', origin: [2.74, 1.1, 0], direction: [0, -1, 0], role: 'reveal' },
      { name: 'wall top', origin: [1.85, 4, 0.037], direction: [0, -1, 0], role: 'top' },
      { name: 'wall end', origin: [-1, 1.13, 0.037], direction: [1, 0, 0], role: 'edge' },
    ];
    try {
      for (const probe of probes) {
        const expected = cast(original, probe.origin, probe.direction);
        const actual = cast(accelerated, probe.origin, probe.direction);
        compareHits(actual, expected);
        if (probe.role === null) {
          expect(actual, probe.name).toEqual([]);
        } else {
          expect(actual.length, probe.name).toBeGreaterThan(0);
          expect(accelerated.userData.surfaceRoles[actual[0]!.face!.materialIndex]).toBe(
            probe.role,
          );
          compareHits(cast(accelerated, probe.origin, probe.direction, true), expected.slice(0, 1));
        }
      }
      expect(accelerated.geometry.index?.array).toEqual(initialIndex);
      expect(original.geometry.index?.array).toEqual(initialIndex);
      expect(accelerated.geometry.groups).toEqual(initialGroups);
      expect(accelerated.geometry.userData).toEqual(initialUserData);
      for (const attribute of ['position', 'normal', 'uv']) {
        expect(accelerated.geometry.getAttribute(attribute).array).toEqual(
          initialAttributes.get(attribute),
        );
      }
      expect(doc).toEqual(before);
    } finally {
      plain.dispose();
      fast.dispose();
    }
  });

  it('matches glass from both sides and independent slab top/bottom surface selection', () => {
    const doc = document();
    for (const id of [doc.openings[1]!.id, doc.slabs[0]!.id]) {
      const plain = buildObject(doc, id);
      const fast = buildObject(doc, id, undefined, { acceleratePicking: true });
      plain.root.updateWorldMatrix(true, true);
      fast.root.updateWorldMatrix(true, true);
      try {
        const plainMeshes = meshes(plain.root);
        const acceleratedMeshes = meshes(fast.root);
        for (let index = 0; index < plainMeshes.length; index++) {
          const original = plainMeshes[index]!;
          const accelerated = acceleratedMeshes[index]!;
          if (!original.name.startsWith('Glass') && !original.name.startsWith('Surface')) {
            continue;
          }
          const probes = original.name.startsWith('Glass')
            ? [
                { origin: [2.71, 1.37, 2], direction: [0, 0, -1] },
                { origin: [2.71, 1.37, -2], direction: [0, 0, 1] },
              ]
            : [
                { origin: [1.37, 2, 0.27], direction: [0, -1, 0] },
                { origin: [1.37, -2, 0.27], direction: [0, 1, 0] },
              ];
          for (const probe of probes) {
            const expected = cast(original, probe.origin, probe.direction);
            const actual = cast(accelerated, probe.origin, probe.direction);
            expect(actual.length).toBeGreaterThan(0);
            compareHits(actual, expected);
            compareHits(
              cast(accelerated, probe.origin, probe.direction, true),
              expected.slice(0, 1),
            );
          }
          expect(accelerated.geometry.index?.array).toEqual(original.geometry.index?.array);
          expect(accelerated.geometry.groups).toEqual(original.geometry.groups);
        }
      } finally {
        plain.dispose();
        fast.dispose();
      }
    }
  });

  it('tracks translated, rotated and nonuniformly scaled door leaf transforms without rebuilding', () => {
    const doc = document();
    doc.walls[0]!.start = { x: 2, z: -1 };
    doc.walls[0]!.end = { x: 2, z: 3 };
    const plain = buildObject(doc, doc.openings[0]!.id);
    const fast = buildObject(doc, doc.openings[0]!.id, undefined, { acceleratePicking: true });
    const original = plain.root.getObjectByName('DoorPanel_bvh_door') as Mesh;
    const accelerated = fast.root.getObjectByName('DoorPanel_bvh_door') as Mesh;
    const originalPivot = plain.root.getObjectByName('HingePivot_bvh_door')!;
    const acceleratedPivot = fast.root.getObjectByName('HingePivot_bvh_door')!;
    const tree = accelerated.geometry.boundsTree;
    const before = bvhDiagnostics();
    try {
      for (const angle of [0, 45, 90, -35]) {
        originalPivot.rotation.y = doorRadians(doc.openings[0]!, doc.walls[0], angle);
        acceleratedPivot.rotation.y = originalPivot.rotation.y;
        plain.root.scale.set(1.2, 0.8, 1.1);
        fast.root.scale.copy(plain.root.scale);
        plain.root.updateWorldMatrix(true, true);
        fast.root.updateWorldMatrix(true, true);
        for (const side of [-1, 1]) {
          const origin = original.localToWorld(new Vector3(0.07, 0.13, side * 2));
          const target = original.localToWorld(new Vector3(0.07, 0.13, 0));
          const direction = target.sub(origin).normalize().toArray();
          const expected = cast(original, origin.toArray(), direction);
          const actual = cast(accelerated, origin.toArray(), direction);
          expect(actual.length).toBeGreaterThan(0);
          compareHits(actual, expected);
        }
        expect(accelerated.geometry.boundsTree).toBe(tree);
      }
      expect(bvhDiagnostics().constructed).toBe(before.constructed);
    } finally {
      plain.dispose();
      fast.dispose();
    }
  });

  it('builds one indirect tree for shared geometries and releases exactly once at the final lease', () => {
    const before = bvhDiagnostics();
    const geometry = new BoxGeometry(2, 1, 0.2);
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const a = new Mesh(geometry, material);
    const b = new Mesh(geometry, material);
    b.position.x = 3;
    a.updateWorldMatrix(true, true);
    b.updateWorldMatrix(true, true);
    const indices = geometry.index!.array.slice();
    const groups = structuredClone(geometry.groups);
    const prototypeRaycast = Mesh.prototype.raycast;
    const first = acquireMeshBvh(a);
    const twice = acquireMeshBvh(a);
    const third = acquireMeshBvh(b);
    const tree = geometry.boundsTree;
    expect(tree).toBeInstanceOf(MeshBVH);
    expect(tree?.indirect).toBe(true);
    expect(geometry.index!.array).toEqual(indices);
    expect(geometry.groups).toEqual(groups);
    expect(Mesh.prototype.raycast).toBe(prototypeRaycast);
    expect(a.raycast).toBe(acceleratedRaycast);
    expect(bvhDiagnostics()).toEqual({
      geometries: before.geometries + 1,
      meshes: before.meshes + 2,
      references: before.references + 3,
      constructed: before.constructed + 1,
      disposed: before.disposed,
    });
    first.release();
    first.release();
    expect(geometry.boundsTree).toBe(tree);
    expect(a.raycast).toBe(acceleratedRaycast);
    twice.release();
    expect(a.raycast).toBe(prototypeRaycast);
    expect(Object.hasOwn(a, 'raycast')).toBe(false);
    expect(geometry.boundsTree).toBe(tree);
    expect(cast(b, [3.17, 0.13, 2], [0, 0, -1]).length).toBeGreaterThan(0);
    third.release();
    third.release();
    expect(Object.hasOwn(geometry, 'boundsTree')).toBe(false);
    expect(b.raycast).toBe(prototypeRaycast);
    expect(bvhDiagnostics()).toEqual({
      ...before,
      constructed: before.constructed + 1,
      disposed: before.disposed + 1,
    });
    geometry.dispose();
    material.dispose();
  });

  it('preserves non-indexed input and restores prior instance-owned tree/raycast state', () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    const prior = new MeshBVH(geometry, { indirect: true });
    geometry.boundsTree = prior;
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const mesh = new Mesh(geometry, material);
    const originalRaycast = (caster: Raycaster, hits: Intersection[]) => {
      Mesh.prototype.raycast.call(mesh, caster, hits);
    };
    mesh.raycast = originalRaycast;
    const lease = acquireMeshBvh(mesh);
    expect(geometry.index).toBeNull();
    expect(geometry.boundsTree).not.toBe(prior);
    lease.release();
    expect(geometry.boundsTree).toBe(prior);
    expect(mesh.raycast).toBe(originalRaycast);
    expect(Object.hasOwn(mesh, 'raycast')).toBe(true);
    geometry.dispose();
    material.dispose();
  });

  it('keeps clean export builders unaccelerated and releases all runtime trees before geometry disposal', () => {
    const before = bvhDiagnostics();
    const doc = document();
    const clean = buildBuilding(doc);
    expect(bvhDiagnostics()).toEqual(before);
    expect(meshes(clean.root).every((mesh) => !mesh.geometry.boundsTree)).toBe(true);
    clean.dispose();
    const built = [...doc.walls, ...doc.slabs, ...doc.openings].map(({ id }) =>
      buildObject(doc, id, undefined, { acceleratePicking: true }),
    );
    let disposedGeometryCount = 0;
    let treesPresentAtGeometryDisposal = 0;
    const runtimeMeshes = built.flatMap((object) => meshes(object.root));
    for (const mesh of runtimeMeshes) {
      mesh.geometry.addEventListener('dispose', () => {
        disposedGeometryCount++;
        if (mesh.geometry.boundsTree) {
          treesPresentAtGeometryDisposal++;
        }
      });
      expect(mesh.geometry.boundsTree?.indirect).toBe(true);
      expect(JSON.stringify(mesh.userData)).not.toMatch(/boundsTree|MeshBVH/);
      expect(JSON.stringify(mesh.geometry.userData)).not.toMatch(/boundsTree|MeshBVH/);
    }
    for (const object of built) {
      object.dispose();
      object.dispose();
    }
    expect(disposedGeometryCount).toBe(runtimeMeshes.length);
    expect(treesPresentAtGeometryDisposal).toBe(0);
    expect(bvhDiagnostics()).toEqual({
      ...before,
      constructed: before.constructed + runtimeMeshes.length,
      disposed: before.disposed + runtimeMeshes.length,
    });
  });
});
