import * as THREE from 'three';
import type { ProjectDocument, Vec2 } from '@building/editor-core';
import type { BuiltObject } from './scene';
import { objectsOf, type RuntimeSession, type ViewportTheme } from './runtime-contracts';
import { disposeHelpers } from './runtime-helpers';
import { runResourceCleanup } from './resource-cleanup';

/** Owns selection overlays; their buffers and materials never become formal building resources. */
export class RuntimeSelection {
  readonly handles = new THREE.Group();
  private surfaceHighlight = new THREE.Group();
  private hingeHighlight = new THREE.Group();
  private outline: THREE.Box3Helper;
  private key = '';
  private disposed = false;

  constructor(
    private auxiliary: THREE.Group,
    private theme: ViewportTheme,
    private lookup: (id: string) => BuiltObject | undefined,
  ) {
    this.outline = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color(theme.selection));
    this.outline.visible = false;
    auxiliary.add(this.handles, this.surfaceHighlight, this.hingeHighlight, this.outline);
  }

  invalidate(): void {
    this.key = '';
  }

  /** Recolors through the existing palette and forces one selection overlay rebuild. */
  setTheme(theme: ViewportTheme): void {
    this.theme = theme;
    (this.outline.material as THREE.LineBasicMaterial).color.set(theme.selection);
    this.invalidate();
  }

  /** Rebuilds only when selection/document state changes, never during ordinary rendering frames. */
  update(doc: ProjectDocument, session: RuntimeSession): void {
    if (this.disposed) {
      return;
    }
    const key = JSON.stringify([
      doc.id,
      doc.revision,
      session.selectedId,
      session.surface,
      session.tool,
      session.levelId,
      session.wholeBuilding,
      session.hiddenIds,
    ]);
    if (key === this.key) {
      return;
    }
    this.key = key;
    disposeHelpers(this.handles);
    disposeHelpers(this.surfaceHighlight);
    disposeHelpers(this.hingeHighlight);
    this.outline.visible = false;
    const built = session.selectedId ? this.lookup(session.selectedId) : undefined,
      data = objectsOf(doc).find((o) => o.id === session.selectedId);
    if (!built || !built.root.visible || !data) {
      return;
    }
    built.root.updateWorldMatrix(true, true);
    this.outline.box.setFromObject(built.root);
    this.outline.visible = true;
    built.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !object.geometry.index) {
        return;
      }
      const roles = object.userData.surfaceRoles as string[] | undefined;
      if (!roles) {
        return;
      }
      const indices: number[] = [];
      for (const group of object.geometry.groups) {
        const role = roles[group.materialIndex ?? 0];
        if (
          role === session.surface ||
          ('start' in data &&
            session.surface === 'edge' &&
            ['edge', 'top', 'bottom', 'reveal'].includes(role ?? ''))
        ) {
          for (let index = group.start; index < group.start + group.count; index++) {
            indices.push(object.geometry.index.getX(index));
          }
        }
      }
      if (!indices.length) {
        return;
      }
      const subset = new THREE.BufferGeometry();
      subset.setAttribute('position', object.geometry.getAttribute('position'));
      subset.setIndex(indices);
      const edges = new THREE.EdgesGeometry(subset, 1);
      subset.dispose();
      const boundary = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: this.theme.selection, depthTest: false }),
      );
      boundary.matrixAutoUpdate = false;
      boundary.matrix.copy(object.matrixWorld);
      boundary.userData.source = object;
      boundary.renderOrder = 20;
      this.surfaceHighlight.add(boundary);
    });
    if ('kind' in data && data.kind === 'door') {
      const pivot = built.root.getObjectByName(`HingePivot_${data.id}`);
      if (pivot) {
        const position = pivot.getWorldPosition(new THREE.Vector3()),
          marker = new THREE.Mesh(
            new THREE.SphereGeometry(0.09, 12, 8),
            new THREE.MeshBasicMaterial({ color: this.theme.selection, depthTest: false }),
          );
        marker.position.copy(position);
        marker.renderOrder = 21;
        const geometry = new THREE.BufferGeometry().setFromPoints([
          position,
          position.clone().add(new THREE.Vector3(0, data.height, 0)),
        ]);
        const axis = new THREE.Line(
          geometry,
          new THREE.LineBasicMaterial({ color: this.theme.selection, depthTest: false }),
        );
        axis.renderOrder = 21;
        this.hingeHighlight.add(marker, axis);
      }
    }
    if (session.tool !== 'select' || session.wholeBuilding) {
      return;
    }
    const handle = (point: Vec2, elevation: number, props: Record<string, unknown>) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 12, 8),
        new THREE.MeshBasicMaterial({ color: this.theme.selection, depthTest: false }),
      );
      mesh.position.set(point.x, elevation, point.z);
      mesh.renderOrder = 22;
      Object.assign(mesh.userData, props);
      this.handles.add(mesh);
    };
    if ('start' in data) {
      const elevation = (doc.levels.find((l) => l.id === data.levelId)?.elevation ?? 0) + 0.15;
      for (const endpoint of ['start', 'end'] as const) {
        handle(data[endpoint], elevation, { endpoint });
      }
    } else if ('polygon' in data) {
      data.polygon.forEach((point, corner) => handle(point, data.elevation + 0.06, { corner }));
    }
  }

  /** Moves the existing selected-surface boundaries with an animated door without rebuilding them. */
  updateDoorPose(root: THREE.Object3D): void {
    root.updateWorldMatrix(true, true);
    for (const boundary of this.surfaceHighlight.children) {
      const source = boundary.userData.source as THREE.Object3D | undefined;
      if (source) {
        boundary.matrix.copy(source.matrixWorld);
      }
    }
    this.outline.box.setFromObject(root);
  }

  diagnostics() {
    return {
      handles: this.handles.children.length,
      surfaceHighlights: this.surfaceHighlight.children.length,
      hingeMarkers: this.hingeHighlight.children.length,
    };
  }

  /** Removes and frees every selection overlay, leaving borrowed formal geometry untouched. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    runResourceCleanup([
      () => disposeHelpers(this.handles),
      () => disposeHelpers(this.surfaceHighlight),
      () => disposeHelpers(this.hingeHighlight),
      () => this.outline.geometry.dispose(),
      () => (this.outline.material as THREE.Material).dispose(),
      () =>
        this.auxiliary.remove(
          this.handles,
          this.surfaceHighlight,
          this.hingeHighlight,
          this.outline,
        ),
    ]);
  }
}
