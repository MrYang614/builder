import {
  AnimationClip,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  type Material,
} from 'three';
import type { ProjectDocument, Opening, Wall, SurfaceBinding } from '@building/editor-core';
import {
  doorRotationRadians,
  prepareGeometry,
  type GeometryData,
  type SurfaceRole,
} from '@building/building-geometry';
import { ResourcePool, type MaterialLease } from './materials';
import { acquireMeshBvh, type BvhLease } from './bvh';
import { prepareBorrowedShadow } from './shadow-materials';
import { cleanupAfterFailure, runResourceCleanup } from './resource-cleanup';

export interface BuiltObject {
  root: Group;
  animations: AnimationClip[];
  dispose(): void;
}
export interface BuiltBuilding extends BuiltObject {
  resources: ResourcePool;
}
export interface BuildObjectOptions {
  /** The clean snapshot/export builder leaves picking-only BVHs disabled by default. */
  acceleratePicking?: boolean;
}
const geometryContexts = new WeakMap<ProjectDocument, ReturnType<typeof prepareGeometry>>();
function geometryContext(doc: ProjectDocument) {
  let context = geometryContexts.get(doc);
  if (!context) {
    context = prepareGeometry(doc);
    geometryContexts.set(doc, context);
  }
  return context;
}
export function toBufferGeometry(data: GeometryData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(data.normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(data.uvs, 2));
  geometry.setIndex(new BufferAttribute(data.indices, 1));
  for (const group of data.groups) {
    geometry.addGroup(group.start, group.count, group.materialIndex);
  }
  geometry.userData = { objectId: data.objectId, surfaceGroups: data.groups };
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Rotation is absolute relative to the closed leaf; current angle never gets added to animation endpoints. */
export function doorRadians(opening: Opening, wall?: Wall, angle = opening.angle): number {
  return doorRotationRadians(opening, wall, angle);
}
export function doorAnimations(opening: Opening, wall?: Wall): AnimationClip[] {
  const axis = new Vector3(0, 1, 0);
  const closed = opening.closedAngle ?? 0,
    open = opening.openAngle;
  const make = (name: string, from: number, to: number) => {
    // Adjacent quaternion samples stay within 90 degrees, retaining the signed sweep even
    // when the two endpoint quaternions alone would choose a shorter, opposite rotation.
    const steps = Math.max(1, Math.ceil(Math.abs(to - from) / 90)),
      times: number[] = [],
      values: number[] = [];
    for (let step = 0; step <= steps; step++) {
      times.push((opening.duration * step) / steps);
      values.push(
        ...new Quaternion()
          .setFromAxisAngle(axis, doorRadians(opening, wall, from + ((to - from) * step) / steps))
          .toArray(),
      );
    }
    return new AnimationClip(`Door_${opening.id}_${name}`, opening.duration, [
      new QuaternionKeyframeTrack(`HingePivot_${opening.id}.quaternion`, times, values),
    ]);
  };
  return [make('Open', closed, open), make('Close', open, closed)];
}
function roleBinding(materials: Record<string, SurfaceBinding>, role: SurfaceRole): SurfaceBinding {
  return materials[role] ?? materials.edge;
}

/** Owns each object's buffers and leases; failed construction rolls back without disposing a supplied pool. */
export function buildObject(
  doc: ProjectDocument,
  id: string,
  supplied?: ResourcePool,
  options: BuildObjectOptions = {},
): BuiltObject {
  const resources = supplied ?? new ResourcePool(doc),
    root = new Group(),
    geometries: BufferGeometry[] = [],
    leases: MaterialLease[] = [],
    bvhLeases: BvhLease[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    const displayMaterials = new Set<Material>();
    root.traverse((object) => {
      if (object instanceof Mesh) {
        const display = object.userData.displayMaterials as Material[] | undefined;
        display?.forEach((material) => displayMaterials.add(material));
      }
    });
    const cleanup = [
      () => root.removeFromParent(),
      ...[...displayMaterials].map((material) => () => material.dispose()),
      ...bvhLeases.map((lease) => () => lease.release()),
      ...geometries.map((geometry) => () => geometry.dispose()),
      ...leases.map((lease) => () => lease.release()),
      ...(!supplied ? [() => resources.dispose()] : []),
      () => root.clear(),
    ];
    bvhLeases.length = 0;
    geometries.length = 0;
    leases.length = 0;
    runResourceCleanup(cleanup);
  };
  try {
    const wall = doc.walls.find((w) => w.id === id),
      slab = doc.slabs.find((s) => s.id === id),
      opening = doc.openings.find((o) => o.id === id);
    const object = wall ?? slab ?? opening;
    if (!object) {
      throw new Error(`runtime.objectNotFound:${id}`);
    }
    root.name = `${wall ? 'Wall' : slab ? 'Slab' : opening?.kind === 'door' ? 'DoorRoot' : 'Window'}_${id}`;
    root.userData = {
      objectId: id,
      levelId: object.levelId,
      kind: wall ? 'wall' : slab ? 'slab' : opening?.kind,
    };
    const material = (binding: SurfaceBinding, glass = false): Material => {
      const lease = resources.acquire(binding, { glass });
      leases.push(lease);
      return lease.material;
    };
    const meshFrom = (data: GeometryData, bindings: Record<string, SurfaceBinding>) => {
      const geometry = toBufferGeometry(data);
      geometries.push(geometry);
      const mesh = new Mesh(
        geometry,
        data.groups.map((g) => material(roleBinding(bindings, g.role))),
      );
      mesh.name = `Surface_${id}`;
      mesh.castShadow = true;
      mesh.onBeforeShadow = prepareBorrowedShadow;
      mesh.receiveShadow = true;
      mesh.userData = {
        ...root.userData,
        surfaceGroups: data.groups,
        surfaceRoles: data.groups.map((g) => g.role),
      };
      root.add(mesh);
    };
    const animations: AnimationClip[] = [];
    if (wall) {
      meshFrom(geometryContext(doc).wall(wall.id), wall.materials);
    } else if (slab) {
      meshFrom(geometryContext(doc).slab(slab.id), slab.materials);
    } else if (opening) {
      const host = doc.walls.find((w) => w.id === opening.wallId);
      if (!host) {
        throw new Error(`runtime.hostMissing:${id}`);
      }
      const dx = host.end.x - host.start.x,
        dz = host.end.z - host.start.z,
        len = Math.hypot(dx, dz);
      const centerOffset = opening.offset + opening.width / 2;
      root.position.set(
        host.start.x + (dx / len) * centerOffset,
        (doc.levels.find((l) => l.id === opening.levelId)?.elevation ?? 0) + opening.sill,
        host.start.z + (dz / len) * centerOffset,
      );
      root.rotation.y = -Math.atan2(dz, dx);
      const bindings = opening.materials ?? host.materials;
      const frameBinding = bindings.edge,
        frameMaterial = material(frameBinding);
      const frame = new Group();
      frame.name = `Frame_${id}`;
      root.add(frame);
      const bar = Math.min(0.06, opening.width / 8, opening.height / 8),
        depth = host.thickness;
      const boxMesh = (
        width: number,
        height: number,
        thickness: number,
        x: number,
        y: number,
        parent: Group,
        materials: Material | Material[],
        name: string,
      ) => {
        const geometry = new BoxGeometry(width, height, thickness);
        geometries.push(geometry);
        const mesh = new Mesh(geometry, materials);
        mesh.castShadow = true;
        mesh.onBeforeShadow = prepareBorrowedShadow;
        mesh.receiveShadow = true;
        mesh.position.set(x, y, 0);
        mesh.name = name;
        mesh.userData = {
          objectId: id,
          levelId: opening.levelId,
          kind: opening.kind,
          surfaceRoles: Array.isArray(materials)
            ? ['edge', 'edge', 'edge', 'edge', 'A', 'B']
            : ['edge'],
        };
        parent.add(mesh);
        return mesh;
      };
      boxMesh(
        bar,
        opening.height,
        depth,
        -opening.width / 2 + bar / 2,
        opening.height / 2,
        frame,
        frameMaterial,
        `FrameLeft_${id}`,
      );
      boxMesh(
        bar,
        opening.height,
        depth,
        opening.width / 2 - bar / 2,
        opening.height / 2,
        frame,
        frameMaterial,
        `FrameRight_${id}`,
      );
      boxMesh(
        opening.width - 2 * bar,
        bar,
        depth,
        0,
        opening.height - bar / 2,
        frame,
        frameMaterial,
        `FrameTop_${id}`,
      );
      if (opening.kind === 'door') {
        const pivot = new Group();
        pivot.name = `HingePivot_${id}`;
        pivot.userData = { objectId: id, levelId: opening.levelId, kind: 'hinge' };
        const leafWidth = opening.width - 2 * bar,
          leafHeight = opening.height - bar - 0.01,
          sign = opening.hinge === 'left' ? 1 : -1;
        pivot.position.x = (-sign * leafWidth) / 2;
        root.add(pivot);
        const edge = material(bindings.edge),
          a = material(bindings.A),
          b = material(bindings.B);
        const frontA = (host.surfaceOrientation ?? 1) === 1;
        const leaf = boxMesh(
          leafWidth,
          leafHeight,
          Math.min(0.045, depth / 2),
          (sign * leafWidth) / 2,
          leafHeight / 2 + 0.005,
          pivot,
          [edge, edge, edge, edge, frontA ? a : b, frontA ? b : a],
          `DoorPanel_${id}`,
        );
        leaf.userData.surfaceRoles = [
          'edge',
          'edge',
          'edge',
          'edge',
          frontA ? 'A' : 'B',
          frontA ? 'B' : 'A',
        ];
        // BoxGeometry's default UV would stretch; panel broad faces use physical tile dimensions.
        const uv = leaf.geometry.getAttribute('uv');
        const positions = leaf.geometry.getAttribute('position');
        for (const group of leaf.geometry.groups) {
          if (group.materialIndex !== 4 && group.materialIndex !== 5) {
            continue;
          }
          const binding = (group.materialIndex === 4) === frontA ? bindings.A : bindings.B;
          const indices = leaf.geometry.getIndex()!;
          const visited = new Set<number>();
          for (let i = group.start; i < group.start + group.count; i++) {
            visited.add(indices.getX(i));
          }
          const angle = (binding.rotation * Math.PI) / 180,
            c = Math.cos(angle),
            s = Math.sin(angle);
          for (const index of visited) {
            const u = (positions.getX(index) + leafWidth / 2) / binding.tileWidth,
              v = (positions.getY(index) + leafHeight / 2) / binding.tileHeight;
            uv.setXY(index, u * c - v * s + binding.offsetX, u * s + v * c + binding.offsetY);
          }
        }
        pivot.rotation.y = doorRadians(opening, host);
        animations.push(...doorAnimations(opening, host));
      } else {
        boxMesh(
          opening.width - 2 * bar,
          bar,
          depth,
          0,
          bar / 2,
          frame,
          frameMaterial,
          `FrameBottom_${id}`,
        );
        boxMesh(
          opening.width - 2 * bar,
          opening.height - 2 * bar,
          0.012,
          0,
          opening.height / 2,
          root,
          material(frameBinding, true),
          `Glass_${id}`,
        );
      }
    }
    if (options.acceleratePicking) {
      root.traverse((object) => {
        if (object instanceof Mesh) {
          bvhLeases.push(acquireMeshBvh(object));
        }
      });
    }

    return { root, animations, dispose };
  } catch (error) {
    cleanupAfterFailure(dispose);
    throw error;
  }
}

/** Builds a clean formal snapshot and rolls back every completed object if later construction fails. */
export function buildBuilding(doc: ProjectDocument): BuiltBuilding {
  const root = new Group();
  root.name = `Building_${doc.id}`;
  root.userData = { projectId: doc.id, documentRevision: doc.revision, units: 'metre' };
  const resources = new ResourcePool(doc),
    objects: BuiltObject[] = [],
    animations: AnimationClip[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    const cleanup = [
      ...objects.map((object) => () => object.dispose()),
      () => resources.dispose(),
      () => root.clear(),
    ];
    objects.length = 0;
    runResourceCleanup(cleanup);
  };
  try {
    for (const level of [...doc.levels].sort((a, b) => a.elevation - b.elevation)) {
      const group = new Group();
      group.name = `Level_${level.id}`;
      group.userData = { levelId: level.id, levelName: level.name };
      root.add(group);
      for (const object of [...doc.walls, ...doc.slabs, ...doc.openings].filter(
        (o) => o.levelId === level.id,
      )) {
        const built = buildObject(doc, object.id, resources);
        objects.push(built);
        group.add(built.root);
        animations.push(...built.animations);
      }
    }
  } catch (error) {
    cleanupAfterFailure(dispose);
    throw error;
  }
  root.updateMatrixWorld(true);
  return {
    root,
    animations,
    resources,
    dispose,
  };
}
