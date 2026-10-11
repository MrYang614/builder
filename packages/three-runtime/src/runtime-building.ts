import * as THREE from 'three';
import type { ChangeSet, ProjectDocument } from '@building/editor-core';
import { buildObject, type BuiltObject } from './scene';
import { ResourcePool } from './materials';
import { objectsOf, type RuntimeSession, type RuntimeOptions } from './runtime-contracts';
import { runResourceCleanup } from './resource-cleanup';

export interface BuildingChanges {
  previous: ProjectDocument;
  replace: boolean;
  changed: ReadonlySet<string>;
}

/** Owns formal display meshes and their resource leases, never transient editing helpers. */
export class RuntimeBuilding {
  readonly root = new THREE.Group();
  private objects = new Map<string, BuiltObject>();
  private resources: ResourcePool;
  private previous: ProjectDocument;
  private rebuiltIds: string[] = [];
  private disposed = false;

  constructor(
    document: ProjectDocument,
    private invalidate: () => void,
    private status: RuntimeOptions['status'],
  ) {
    this.previous = document;
    this.resources = new ResourcePool(document);
  }

  get document(): ProjectDocument {
    return this.previous;
  }

  get(id: string): BuiltObject | undefined {
    return this.objects.get(id);
  }

  entries(): IterableIterator<[string, BuiltObject]> {
    return this.objects.entries();
  }

  /** Applies valid ChangeSets locally; replacement releases the previous project's resource pool. */
  sync(doc: ProjectDocument, changes?: ChangeSet): BuildingChanges {
    const previous = this.previous,
      replace = doc.id !== previous.id || changes?.reason === 'replace',
      precise =
        changes &&
        changes.projectId === doc.id &&
        changes.revision === doc.revision &&
        changes.previousRevision === previous.revision &&
        !changes.full,
      all = objectsOf(doc),
      changed = new Set(precise ? changes.affectedIds : all.map((o) => o.id));
    if (this.disposed) {
      return { previous, replace, changed };
    }
    if (replace) {
      const previousResources = this.resources;
      this.resources = new ResourcePool(doc);
      this.releaseDuringSync([() => this.clearObjects(), () => previousResources.dispose()]);
    } else {
      this.resources.setDocument(doc);
    }
    for (const [id, built] of this.objects) {
      if (!all.some((o) => o.id === id) || changed.has(id)) {
        this.objects.delete(id);
        this.releaseDuringSync([() => this.root.remove(built.root), () => built.dispose()]);
      }
    }
    this.rebuiltIds = [];
    for (const object of all) {
      if (this.objects.has(object.id)) {
        continue;
      }
      try {
        const built = buildObject(doc, object.id, this.resources, { acceleratePicking: true });
        this.objects.set(object.id, built);
        this.root.add(built.root);
        this.rebuiltIds.push(object.id);
      } catch (error) {
        this.status('geometry.failed', { reason: String(error) });
      }
    }
    this.previous = doc;
    const pool = this.resources;
    void pool.ready().then(
      () => {
        if (!this.disposed && pool === this.resources && doc === this.previous) {
          this.invalidate();
        }
      },
      (error: unknown) => {
        if (!this.disposed && pool === this.resources && doc === this.previous) {
          this.status('resource.failed', { reason: String(error) });
        }
      },
    );
    return { previous, replace, changed };
  }

  /** Ghost appearance is a display-only clone; formal materials remain unchanged for exports. */
  applyVisibility(session: RuntimeSession, doc: ProjectDocument): void {
    const dataById = new Map(objectsOf(doc).map((o) => [o.id, o]));
    for (const [id, built] of this.objects) {
      const ghost = !session.wholeBuilding && dataById.get(id)?.levelId !== session.levelId;
      built.root.visible = !session.hiddenIds.includes(id);
      built.root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) {
          return;
        }
        if (!object.userData.displayMaterials) {
          const formal = Array.isArray(object.material) ? object.material : [object.material];
          object.userData.formalMaterials = formal;
          object.userData.displayMaterials = formal.map((material) => material.clone());
          object.material = Array.isArray(object.material)
            ? object.userData.displayMaterials
            : object.userData.displayMaterials[0];
        }
        const formal = object.userData.formalMaterials as THREE.Material[];
        (object.userData.displayMaterials as THREE.Material[]).forEach((material, index) => {
          const transparent = ghost || formal[index]!.transparent,
            depthWrite = !ghost && formal[index]!.depthWrite;
          if (material.transparent !== transparent || material.depthWrite !== depthWrite) {
            material.transparent = transparent;
            material.depthWrite = depthWrite;
            material.needsUpdate = true;
          }
          material.opacity = ghost ? 0.18 : formal[index]!.opacity;
        });
      });
    }
  }

  /** Supplies current-level formal roots only; overlays and ghosts cannot enter picking. */
  pickRoots(session: RuntimeSession): THREE.Object3D[] {
    const dataById = new Map(objectsOf(this.previous).map((o) => [o.id, o]));
    return [...this.objects]
      .filter(
        ([id, built]) =>
          built.root.visible &&
          !session.hiddenIds.includes(id) &&
          dataById.get(id)?.levelId === session.levelId,
      )
      .map(([, built]) => built.root);
  }

  diagnostics() {
    return {
      objects: this.objects.size,
      resources: this.resources.stats,
      rebuiltIds: [...this.rebuiltIds],
    };
  }

  private clearObjects(): void {
    const owned = [...this.objects.values()];
    this.objects.clear();
    runResourceCleanup([...owned.map((built) => () => built.dispose()), () => this.root.clear()]);
  }

  /** Cleanup failure is reported after every release; a committed Core revision must still reconcile. */
  private releaseDuringSync(steps: (() => void)[]): void {
    try {
      runResourceCleanup(steps);
    } catch (error) {
      this.status('render.cleanupFailed', { reason: String(error) });
    }
  }

  /** Releases all building leases once; pending decodes cannot invalidate a disposed owner. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    runResourceCleanup([() => this.clearObjects(), () => this.resources.dispose()]);
  }
}
