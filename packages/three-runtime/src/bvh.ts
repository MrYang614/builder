import type { BufferGeometry, Mesh } from 'three';
import { acceleratedRaycast, MeshBVH } from 'three-mesh-bvh';

export interface BvhLease {
  /** Release only this acquisition; a shared geometry keeps its BVH until its last owner releases. */
  release(): void;
}

export interface BvhDiagnostics {
  geometries: number;
  meshes: number;
  references: number;
  constructed: number;
  disposed: number;
}

interface GeometryEntry {
  tree: MeshBVH;
  previousTree: BufferGeometry['boundsTree'];
  hadTree: boolean;
  meshes: number;
}

interface MeshEntry {
  geometry: BufferGeometry;
  geometryEntry: GeometryEntry;
  previousRaycast: Mesh['raycast'];
  hadRaycast: boolean;
  references: number;
}

const geometryEntries = new WeakMap<BufferGeometry, GeometryEntry>();
const meshEntries = new WeakMap<Mesh, MeshEntry>();
const totals: BvhDiagnostics = {
  geometries: 0,
  meshes: 0,
  references: 0,
  constructed: 0,
  disposed: 0,
};

/** A copy of ownership counters, without retaining Mesh, geometry or BVH references. */
export function bvhDiagnostics(): BvhDiagnostics {
  return { ...totals };
}

/**
 * Opt-in picking acceleration on one Mesh instance. Indirect BVHs preserve the geometry's
 * index and groups, which are also the editor's stable face and material identities.
 * Geometry and Mesh prototypes are never modified, and BVHs never enter export userData.
 */
export function acquireMeshBvh(mesh: Mesh): BvhLease {
  let entry = meshEntries.get(mesh);
  if (entry && entry.geometry !== mesh.geometry) {
    throw new Error('runtime.bvhGeometryChanged');
  }
  if (!entry) {
    const geometry = mesh.geometry;
    let geometryEntry = geometryEntries.get(geometry);
    if (!geometryEntry) {
      const previousTree = geometry.boundsTree;
      const hadTree = Object.hasOwn(geometry, 'boundsTree');
      const tree = new MeshBVH(geometry, {
        indirect: true,
        setBoundingBox: false,
        verbose: false,
      });
      geometryEntry = { tree, previousTree, hadTree, meshes: 0 };
      geometry.boundsTree = tree;
      geometryEntries.set(geometry, geometryEntry);
      totals.geometries++;
      totals.constructed++;
    }
    geometryEntry.meshes++;
    entry = {
      geometry,
      geometryEntry,
      previousRaycast: mesh.raycast,
      hadRaycast: Object.hasOwn(mesh, 'raycast'),
      references: 0,
    };
    mesh.raycast = acceleratedRaycast;
    meshEntries.set(mesh, entry);
    totals.meshes++;
  }
  entry.references++;
  totals.references++;
  let acquired: MeshEntry | undefined = entry;
  let heldMesh: Mesh | undefined = mesh;
  return {
    release: () => {
      const owned = acquired;
      const ownedMesh = heldMesh;
      if (!owned || !ownedMesh) {
        return;
      }
      // A released lease also drops its captured geometry/tree references, even when
      // callers retain the small lease object for idempotent cleanup.
      acquired = undefined;
      heldMesh = undefined;
      owned.references--;
      totals.references--;
      if (owned.references) {
        return;
      }
      if (ownedMesh.raycast === acceleratedRaycast) {
        if (owned.hadRaycast) {
          ownedMesh.raycast = owned.previousRaycast;
        } else {
          Reflect.deleteProperty(ownedMesh, 'raycast');
        }
      }
      meshEntries.delete(ownedMesh);
      totals.meshes--;
      const shared = owned.geometryEntry;
      shared.meshes--;
      if (shared.meshes) {
        return;
      }
      // MeshBVH owns CPU arrays only. Dropping our last tree reference releases those
      // arrays to GC; it must not dispose the geometry or another owner's replacement tree.
      if (owned.geometry.boundsTree === shared.tree) {
        if (shared.hadTree) {
          owned.geometry.boundsTree = shared.previousTree;
        } else {
          Reflect.deleteProperty(owned.geometry, 'boundsTree');
        }
      }
      geometryEntries.delete(owned.geometry);
      totals.geometries--;
      totals.disposed++;
    },
  };
}
