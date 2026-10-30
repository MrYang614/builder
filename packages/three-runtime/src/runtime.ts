import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ChangeSet, ProjectDocument } from '@building/editor-core';
import { bvhDiagnostics } from './bvh';
import type { SceneRenderer, RendererBackend, RenderState } from './renderer';
import type { PostProcessingOptions } from './postprocessing';
import { objectsOf, type RuntimeOptions, type ViewportTheme } from './runtime-contracts';
import { RuntimeBuilding } from './runtime-building';
import { RuntimeSelection } from './runtime-selection';
import { RuntimeAnimations } from './runtime-animations';
import { RuntimeDecorations } from './runtime-decorations';
import { RuntimeInteraction } from './runtime-interaction';
import { RuntimePreview } from './runtime-preview';
import { RuntimePicking } from './runtime-picking';
import { RuntimeRendering } from './runtime-rendering';
import { RuntimeSnapping } from './snapping';
import { runResourceCleanup } from './resource-cleanup';
import { RuntimeViewTransition } from './runtime-view-transition';
import type { PlanViewFraming, ViewTransitionOptions } from './view-transition-math';

export type { Tool, ViewportTheme, RuntimeSession, RuntimeOptions } from './runtime-contracts';
export type {
  PlanViewFraming,
  ViewTransitionOptions,
  ViewTransitionPhase,
} from './view-transition-math';
const lifecycle = { created: 0, disposed: 0 };

/** Coordinates independent runtime owners; EditorCore remains the sole formal document owner. */
export class ThreeRuntime {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.05, 1500);
  readonly controls: OrbitControls;
  private readonly building: RuntimeBuilding;
  private readonly selection: RuntimeSelection;
  private readonly animations: RuntimeAnimations;
  private readonly decorations: RuntimeDecorations;
  private readonly snapping: RuntimeSnapping;
  private readonly preview: RuntimePreview;
  private readonly interaction: RuntimeInteraction;
  private readonly rendering: RuntimeRendering;
  private readonly viewTransition: RuntimeViewTransition;
  private readonly observer: ResizeObserver;
  private disposed = false;
  private active = true;
  private theme: ViewportTheme;
  private readonly onControlsChange = () => this.interaction.onCameraChange();

  constructor(
    private readonly container: HTMLElement,
    private readonly options: RuntimeOptions,
    theme: ViewportTheme,
  ) {
    this.theme = theme;
    this.building = new RuntimeBuilding(options.getDocument(), this.invalidate, options.status);
    this.scene.add(this.building.root);
    this.decorations = new RuntimeDecorations(this.scene, theme);
    this.selection = new RuntimeSelection(this.decorations.auxiliary, theme, (id) =>
      this.building.get(id),
    );
    this.animations = new RuntimeAnimations({
      document: () => this.building.document,
      snapshotDocument: options.getDocument,
      object: (id) => this.building.get(id),
      selectedId: () => options.getSession().selectedId,
      updateSelection: (root) => this.selection.updateDoorPose(root),
      command: options.command,
      invalidate: this.invalidate,
    });
    this.rendering = new RuntimeRendering(this.scene, this.camera, {
      background: () => this.theme.background,
      document: () => this.building.document,
      snapshot: () => this.animations.snapshot(),
      interactive: () =>
        this.viewTransition?.active || this.interaction.active || this.animations.active,
      advanceAnimations: (time) =>
        this.viewTransition?.active
          ? this.viewTransition.advance(time)
          : this.animations.advance(time),
      frameRendered: (time) => this.viewTransition?.presented(time),
      cancelEditing: () => {
        this.viewTransition?.cancel();
        this.interaction.cancel(false);
      },
      disconnectControls: () => this.controls.disconnect(),
      connectControls: (canvas) => this.controls.connect(canvas),
      bindCanvas: () => this.interaction.bindCanvas(),
      resizeViewport: () => this.resize(),
      status: options.status,
      renderState: options.renderState,
    });
    container.appendChild(this.renderer.domElement);
    this.snapping = new RuntimeSnapping(
      container,
      this.decorations.auxiliary,
      this.decorations.snapMark,
      theme.snap,
      options.status,
    );
    this.preview = new RuntimePreview(options, this.decorations.auxiliary, theme, this.snapping);
    this.camera.position.set(9, 10, 12);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1, 0);
    this.controls.enableDamping = false;
    this.controls.mouseButtons = {
      LEFT: null as unknown as THREE.MOUSE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    this.controls.update();
    const picking = new RuntimePicking(
      this.camera,
      {
        getDocument: options.getDocument,
        getSession: options.getSession,
        getCanvas: () => this.renderer.domElement,
        roots: () => this.building.pickRoots(options.getSession()),
        handles: () => {
          this.selection.handles.updateWorldMatrix(true, true);
          return this.selection.handles.children;
        },
        invalidateHistory: () => this.rendering.invalidateHistory(),
      },
      this.snapping,
    );
    this.interaction = new RuntimeInteraction(
      {
        getDocument: options.getDocument,
        getSession: options.getSession,
        command: options.command,
        select: options.select,
        activateTool: options.activateTool,
        status: options.status,
        getCanvas: () => this.renderer.domElement,
        controls: this.controls,
        invalidate: this.invalidate,
        invalidateHistory: () => this.rendering.invalidateHistory(),
      },
      this.preview,
      picking,
      this.snapping,
    );
    this.viewTransition = new RuntimeViewTransition({
      camera: this.camera,
      target: this.controls.target,
      building: this.building.root,
      auxiliary: this.decorations.auxiliary,
      roots: () => {
        const levelId = this.options.getSession().levelId;
        const ids = new Set(
          objectsOf(this.building.document)
            .filter((object) => object.levelId === levelId)
            .map((object) => object.id),
        );
        return [...this.building.entries()].map(([id, built]) => ({
          root: built.root,
          currentLevel: ids.has(id),
        }));
      },
      viewport: () => this.container.getBoundingClientRect(),
      isActive: () => this.active,
      prepare: () => this.animations.cancel(),
      activate: (active) => this.setActive(active),
      input: (active) => {
        this.interaction.setActive(active);
        this.renderer.domElement.tabIndex = active ? 0 : -1;
      },
      rasterOnly: (active) => this.rendering.setRasterOnly(active),
      invalidate: this.invalidate,
    });
    this.controls.addEventListener('change', this.onControlsChange);
    this.interaction.bindCanvas();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    lifecycle.created++;
    this.sync(this.building.document);
    this.resize();
  }

  get renderer(): SceneRenderer {
    return this.rendering.renderer;
  }

  /** Coalesces edit/UI invalidations into the render owner's demand-driven scheduler. */
  invalidate = (): void => {
    if (!this.disposed) {
      this.rendering.invalidate();
    }
  };

  /** Rejects stale gestures before rebuilding formal meshes, then reconciles dependent owners. */
  sync(doc: ProjectDocument, changes?: ChangeSet): void {
    if (this.disposed) {
      return;
    }
    this.viewTransition.cancel();
    this.interaction.sync(doc, changes);
    const delta = this.building.sync(doc, changes);
    this.animations.sync(delta, doc, changes);
    this.snapping.sync(doc, changes);
    this.selection.invalidate();
    this.rendering.sync(doc);
    this.setSession();
  }

  /** Applies one session policy to editing and display without replacing the renderer or document. */
  setSession(): void {
    if (this.disposed) {
      return;
    }
    this.viewTransition.cancel();
    this.rendering.invalidateHistory();
    this.interaction.setSession();
    const session = this.options.getSession(),
      doc = this.options.getDocument();
    this.decorations.setElevation(doc.levels.find((l) => l.id === session.levelId)?.elevation ?? 0);
    this.building.applyVisibility(session, doc);
    this.selection.update(this.building.document, session);
    this.invalidate();
  }

  /** Keeps the 3D scene synchronized while another view owns input; no renderer is recreated. */
  setActive(active: boolean): void {
    if (this.disposed || this.viewTransition?.active || this.active === active) {
      return;
    }
    this.active = active;
    this.rendering.setActive(active);
    this.interaction.setActive(active);
    this.renderer.domElement.tabIndex = active ? 0 : -1;
    if (active) {
      this.setSession();
      this.resize();
    } else {
      this.animations.cancel();
    }
  }

  /** Runs the planar fade, camera arc and height morph through the retained renderer's scheduler. */
  transitionView(
    target: '3d' | 'plan',
    framing: PlanViewFraming,
    options: ViewTransitionOptions = {},
  ): Promise<boolean> {
    if (this.disposed || this.rendering.getRenderState().switching) {
      return Promise.resolve(false);
    }
    return this.viewTransition.start(target, framing, options);
  }

  /** Restores the origin view when its framing or the user's motion preference becomes stale. */
  cancelViewTransition(): void {
    this.viewTransition.cancel();
  }

  /** Reprojects the shared camera before resizing render targets; screen-dependent feedback is cleared. */
  resize(): void {
    if (this.disposed || !this.active) {
      return;
    }
    this.snapping.clear();
    const { width, height } = this.container.getBoundingClientRect();
    this.viewTransition?.resize(width, height);
    if (!width || !height) {
      return;
    }
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.rendering.resize(width, height, Math.min(devicePixelRatio, 2));
  }

  /** Updates display owners through the existing palette while keeping formal materials unchanged. */
  setViewportTheme(theme: ViewportTheme): void {
    this.theme = theme;
    this.snapping.setTheme(theme.snap);
    this.rendering.setBackground(theme.background);
    this.decorations.setTheme(theme);
    this.preview.setTheme(theme);
    this.selection.setTheme(theme);
    this.rendering.invalidateHistory();
    this.selection.update(this.building.document, this.options.getSession());
    this.invalidate();
  }

  /** Cancels the owned gesture; an idle Escape can return the session to the selection tool. */
  cancel = (exitTool: boolean | Event = true): void => this.interaction.cancel(exitTool);

  /** Frames formal visible objects only; selection and preview overlays do not expand the bounds. */
  focus(scope: 'selected' | 'level' | 'all' | 'top' = 'all'): void {
    if (this.viewTransition.active) {
      return;
    }
    const box = new THREE.Box3(),
      session = this.options.getSession(),
      dataById = new Map(objectsOf(this.building.document).map((o) => [o.id, o]));
    for (const [id, built] of this.building.entries()) {
      if (
        !built.root.visible ||
        (scope === 'selected' && id !== session.selectedId) ||
        (scope === 'level' && dataById.get(id)?.levelId !== session.levelId)
      ) {
        continue;
      }
      box.expandByObject(built.root);
    }
    if (box.isEmpty()) {
      box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(6, 3, 6));
    }
    const center = box.getCenter(new THREE.Vector3()),
      size = box.getSize(new THREE.Vector3()).length();
    this.controls.target.copy(center);
    this.camera.position
      .copy(center)
      .add(
        scope === 'top'
          ? new THREE.Vector3(0, Math.max(12, size * 1.1), 0.001)
          : new THREE.Vector3(0.8, 0.75, 1).normalize().multiplyScalar(Math.max(12, size * 1.4)),
      );
    this.controls.update();
    this.camera.updateMatrixWorld(true);
    this.invalidate();
  }

  /** Starts a transient door animation; its final angle uses the existing Core command boundary. */
  animateDoor(id: string, to: number): void {
    if (this.viewTransition.active) {
      return;
    }
    if (this.active) {
      this.animations.animate(id, to);
    } else {
      this.options.command({ type: 'update-opening', id, patch: { angle: to } });
    }
  }

  /** Returns a revision snapshot with sampled live door angles, never display helpers. */
  snapshot(): ProjectDocument {
    return this.animations.snapshot();
  }

  getRenderState(): RenderState {
    return this.rendering.getRenderState();
  }

  /** Swaps renderer ownership asynchronously while retaining the scene, camera and editor policy. */
  setRendererBackend(backend: RendererBackend): Promise<boolean> {
    this.viewTransition.cancel();
    return this.rendering.setRendererBackend(backend);
  }

  /** Starts or releases a clean path-tracing snapshot through the render owner. */
  setPathTracing(enabled: boolean): Promise<void> {
    this.viewTransition.cancel();
    return this.rendering.setPathTracing(enabled);
  }

  setPathSamples(samples: number): void {
    this.rendering.setPathSamples(samples);
  }

  pausePathTracing(paused: boolean): void {
    this.rendering.pausePathTracing(paused);
  }

  /** Updates real-time effects; temporal history and GPU ownership remain inside rendering. */
  setPostProcessing(options: Partial<PostProcessingOptions>): void {
    this.rendering.setPostProcessing(options);
  }
  setGTAOEnabled = (enabled: boolean): void => this.setPostProcessing({ gtao: enabled });
  setTAAEnabled = (enabled: boolean): void => this.setPostProcessing({ taa: enabled });

  /** Captures the selected render pipeline only when editing and asynchronous transitions are idle. */
  capturePNG(): Promise<ArrayBuffer> {
    return this.rendering.capturePNG();
  }

  /** Aggregates read-only owner diagnostics, preserving the public browser instrumentation contract. */
  diagnostics() {
    return {
      ...this.rendering.diagnostics(),
      viewportActive: this.active,
      viewTransition: this.viewTransition.diagnostics(),
      ...this.building.diagnostics(),
      ...this.selection.diagnostics(),
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      rendererId: this.renderer.domElement.dataset.runtimeId,
      lifecycle: { ...lifecycle, active: lifecycle.created - lifecycle.disposed },
      eventListeners: this.interaction.listenerCount + (this.disposed ? 0 : 1),
      preview: { ...this.preview.diagnostics(), ...this.interaction.diagnostics() },
      snap: this.snapping.diagnostics(),
      animations: this.animations.diagnostics(),
      bvh: bvhDiagnostics(),
      sceneId: this.scene.uuid,
      cameraId: this.camera.uuid,
      camera: { position: this.camera.position.toArray(), target: this.controls.target.toArray() },
    };
  }

  /** Projects against the current shared camera matrix, including renderer/canvas replacement. */
  worldToClient(point: { x: number; y: number; z: number }) {
    this.camera.updateMatrixWorld(true);
    const vector = new THREE.Vector3(point.x, point.y, point.z).project(this.camera),
      rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + ((vector.x + 1) * rect.width) / 2,
      y: rect.top + ((1 - vector.y) * rect.height) / 2,
    };
  }

  /** Stops scheduling first, then releases input, formal and helper owners before the renderer. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.viewTransition.cancel();
    this.disposed = true;
    lifecycle.disposed++;
    runResourceCleanup([
      () => this.rendering.stopScheduling(),
      () => this.observer.disconnect(),
      () => this.controls.removeEventListener('change', this.onControlsChange),
      () => this.interaction.dispose(),
      () => this.controls.dispose(),
      () => this.animations.clear(),
      () => this.building.dispose(),
      () => this.snapping.dispose(),
      () => this.preview.dispose(),
      () => this.selection.dispose(),
      () => this.decorations.dispose(),
      () => this.rendering.dispose(),
      () => this.scene.clear(),
    ]);
  }
}
