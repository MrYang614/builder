import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  createWall,
  createSlab,
  createOpening,
  rectanglePolygon,
  wallLength,
  snapPoint,
  ToolStateMachine,
  type Command,
  type ChangeSet,
  type PreviewResult,
  type ProjectDocument,
  type Vec2,
  type Wall,
  type Slab,
  type Opening,
} from '@building/editor-core';
import {
  buildObject,
  buildBuilding,
  doorRadians,
  type BuiltObject,
  type BuiltBuilding,
} from './scene';
import { ResourcePool } from './materials';
import { bvhDiagnostics } from './bvh';
import {
  createWebGLRenderer,
  createSceneRenderer,
  disposeSceneRenderer,
  initialRenderState,
  type SceneRenderer,
  type RendererBackend,
  type RenderState,
} from './renderer';
import {
  loadEnvironmentTexture,
  createDefaultEnvironmentTexture,
  createPathTracingEnvironmentTexture,
} from './environment';
import type { PathTraceSession } from './pathtracing';

export type Tool = 'select' | 'wall' | 'slab' | 'door' | 'window' | 'material';
export interface ViewportTheme {
  background: string;
  grid: string;
  axis: string;
  selection: string;
  snap: string;
  preview: string;
  invalid: string;
}
export interface RuntimeSession {
  levelId: string;
  tool: Tool;
  selectedId: string | null;
  surface: string;
  wholeBuilding: boolean;
  hiddenIds: string[];
  slabPurpose: 'floor' | 'roof';
  roofElevation: number;
  cameraMode: 'edit' | 'rotate' | 'pan';
}
export interface RuntimeOptions {
  getDocument(): ProjectDocument;
  getSession(): RuntimeSession;
  command(command: Command): boolean;
  select(id: string | null, surface?: string): void;
  beginPreview(): string;
  preview(token: string, command: Command): PreviewResult;
  cancelPreview(token?: string): void;
  activateTool?(tool: Tool): void;
  status(code: string, params?: Record<string, string | number>): void;
  renderState?(state: RenderState): void;
}
type ObjectData = Wall | Slab | Opening;
type Drag = {
  id: string;
  start: Vec2;
  initial: ObjectData;
  draft: ObjectData;
  endpoint?: 'start' | 'end';
  corner?: number;
  elevation: number;
  projectId: string;
  revision: number;
};
type Playback = { id: string; from: number; to: number; start: number; duration: number };
const lifecycle = { created: 0, disposed: 0 };
const objectsOf = (doc: ProjectDocument): ObjectData[] => [
  ...doc.walls,
  ...doc.slabs,
  ...doc.openings,
];
function updateCommand(data: ObjectData): Command {
  if ('start' in data) {
    return { type: 'update-wall', id: data.id, patch: data };
  }
  if ('polygon' in data) {
    return { type: 'update-slab', id: data.id, patch: data };
  }
  return { type: 'update-opening', id: data.id, patch: data };
}
function addCommand(data: ObjectData): Command {
  if ('start' in data) {
    return { type: 'add-wall', wall: data };
  }
  if ('polygon' in data) {
    return { type: 'add-slab', slab: data };
  }
  return { type: 'add-opening', opening: data };
}
/** Helpers own their GPU allocations. Building meshes dispose through BuiltObject instead. */
function disposeHelpers(group: THREE.Group) {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments || o instanceof THREE.Line) {
      o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    }
  });
  group.clear();
}
/** Owns all GPU objects, normalized input, camera and on-demand rendering. React only owns its container. */
export class ThreeRuntime {
  private currentRenderer: SceneRenderer;
  get renderer(): SceneRenderer {
    return this.currentRenderer;
  }
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.05, 1500);
  readonly controls: OrbitControls;
  private building = new THREE.Group();
  private auxiliary = new THREE.Group();
  private handles = new THREE.Group();
  private surfaceHighlight = new THREE.Group();
  private hingeHighlight = new THREE.Group();
  private objects = new Map<string, BuiltObject>();
  private resources: ResourcePool;
  private previous: ProjectDocument;
  private ray = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private plane = new THREE.Plane();
  private theme: ViewportTheme;
  private grid: THREE.GridHelper;
  private outline: THREE.Box3Helper;
  private preview: THREE.Mesh;
  private snapMark: THREE.Mesh;
  private tools = new ToolStateMachine();
  private drag: Drag | null = null;
  private pointerId: number | null = null;
  private cameraPointers = new Set<number>();
  private previewToken: string | null = null;
  private previewRevision = -1;
  private previewValid = true;
  private previewError = '';
  private previewObjectId: string | null = null;
  private lengthSignature = '';
  private raf: number | null = null;
  private disposed = false;
  private observer: ResizeObserver;
  private unsubscribers: (() => void)[] = [];
  private animations = new Map<string, Playback>();
  private liveAngles = new Map<string, number>();
  private lastStatus = 0;
  private activeTool: Tool = 'select';
  private activeLevel = '';
  private frameCount = 0;
  private selectionKey = '';
  private rebuiltIds: string[] = [];
  private canvasUnsubscribers: (() => void)[] = [];
  private renderState = initialRenderState();
  private backendRequest = 0;
  private rendererCallbacksCleanup: (() => void) | null = null;
  private frameInProgress = false;
  private frameRequested = false;
  private path: PathTraceSession | null = null;
  private pathBuilding: BuiltBuilding | null = null;
  private pathScene: THREE.Scene | null = null;
  private pathDefaultEnvironment: THREE.Texture | null = null;
  private pathDirty = false;
  private pathRequest = 0;
  private pathTimer: ReturnType<typeof setTimeout> | null = null;
  private pathPaused = false;
  private pathCameraKey = '';
  private lastSamplePublish = 0;
  private lastInteraction = 0;
  private environmentTexture: THREE.Texture | null = null;
  private environmentRequest = 0;
  private environmentKey = '';
  private environmentTextureKey = '';
  constructor(
    private container: HTMLElement,
    private options: RuntimeOptions,
    theme: ViewportTheme,
  ) {
    this.theme = theme;
    this.previous = options.getDocument();
    this.resources = new ResourcePool(this.previous);
    this.currentRenderer = createWebGLRenderer();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(theme.background);
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute('aria-label', '3D viewport');
    this.renderer.domElement.dataset.testid = 'viewport-canvas';
    container.appendChild(this.renderer.domElement);
    this.scene.add(this.building, this.auxiliary);
    this.auxiliary.add(this.handles, this.surfaceHighlight, this.hingeHighlight);
    // Illumination is independent of UI theme; clean exports contain neither lights nor helpers.
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x7c7c7c, 2.2));
    const light = new THREE.DirectionalLight(0xffffff, 2.4);
    light.position.set(8, 12, 6);
    this.scene.add(light);
    this.grid = new THREE.GridHelper(100, 100, theme.axis, theme.grid);
    this.auxiliary.add(this.grid);
    this.outline = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color(theme.selection));
    this.outline.visible = false;
    this.auxiliary.add(this.outline);
    this.preview = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        color: theme.preview,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      }),
    );
    this.preview.visible = false;
    this.auxiliary.add(this.preview);
    this.snapMark = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 12, 8),
      new THREE.MeshBasicMaterial({ color: theme.snap, depthTest: false }),
    );
    this.snapMark.visible = false;
    this.auxiliary.add(this.snapMark);
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
    this.controls.addEventListener('change', this.invalidate);
    this.unsubscribers.push(() => this.controls.removeEventListener('change', this.invalidate));
    this.bindCanvas();
    this.ray.firstHitOnly = true;
    this.listen(window, 'blur', this.cancel as EventListener);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    lifecycle.created++;
    this.sync(this.previous);
    this.resize();
  }
  private listen(target: EventTarget, event: string, fn: EventListener) {
    target.addEventListener(event, fn);
    this.unsubscribers.push(() => target.removeEventListener(event, fn));
  }
  private bindCanvas() {
    this.canvasUnsubscribers.forEach((f) => f());
    this.canvasUnsubscribers = [];
    const canvas = this.renderer.domElement;
    const listen = (event: string, fn: EventListener) => {
      canvas.addEventListener(event, fn);
      this.canvasUnsubscribers.push(() => canvas.removeEventListener(event, fn));
    };
    listen('pointerdown', this.down as EventListener);
    listen('pointermove', this.move as EventListener);
    listen('pointerup', this.up as EventListener);
    listen('pointercancel', this.pointerCancelled as EventListener);
    listen('lostpointercapture', this.lost as EventListener);
    listen('contextmenu', (e) => e.preventDefault());
  }
  private publishRender(patch: Partial<RenderState>) {
    if (this.disposed) {
      return;
    }
    this.renderState = { ...this.renderState, ...patch };
    this.options.renderState?.(this.renderState);
  }
  getRenderState(): RenderState {
    return this.renderState;
  }
  private bindRendererCallbacks(renderer: SceneRenderer) {
    this.rendererCallbacksCleanup?.();
    this.rendererCallbacksCleanup = null;
    if (renderer instanceof THREE.WebGLRenderer) {
      return;
    }
    // r186 emits structured GPU errors although its published type still says string.
    const previousError = renderer.onError as (info: unknown) => void;
    const previousLost = renderer.onDeviceLost;
    const onError = (info: unknown) => {
      previousError.call(renderer, info);
      if (this.disposed || this.renderer !== renderer || this.renderState.mode !== 'pathtrace') {
        return;
      }
      const reason =
        typeof info === 'object' && info !== null && 'message' in info
          ? String(info.message)
          : String(info);
      this.stopPathResources();
      this.publishRender({ mode: 'raster', pathStatus: 'error', error: 'render.pathFailed' });
      this.options.status('render.pathFailed', { reason });
      this.invalidate();
    };
    const onDeviceLost: typeof previousLost = () => {
      if (this.disposed || this.renderer !== renderer) {
        return;
      }
      this.options.status('render.deviceLost');
      void this.setRendererBackend('webgl');
    };
    renderer.onError = onError;
    renderer.onDeviceLost = onDeviceLost;
    this.rendererCallbacksCleanup = () => {
      if (renderer.onError === onError) {
        renderer.onError = previousError;
      }
      if (renderer.onDeviceLost === onDeviceLost) {
        renderer.onDeviceLost = previousLost;
      }
    };
  }
  async setRendererBackend(backend: RendererBackend): Promise<boolean> {
    const request = ++this.backendRequest;
    if (backend === this.renderState.backend && !this.renderState.switching) {
      this.publishRender({ error: undefined });
      return true;
    }
    this.publishRender({ switching: true, error: undefined });
    let next: SceneRenderer | null = null;
    try {
      next = await createSceneRenderer(backend);
      if (this.disposed || request !== this.backendRequest) {
        await disposeSceneRenderer(next);
        return false;
      }
      next.setPixelRatio(Math.min(devicePixelRatio, 2));
      next.outputColorSpace = this.renderer.outputColorSpace;
      next.toneMapping = this.renderer.toneMapping;
      next.toneMappingExposure = this.renderer.toneMappingExposure;
      next.setClearColor(this.theme.background);
      const old = this.renderer;
      const canvas = next.domElement;
      canvas.tabIndex = old.domElement.tabIndex;
      canvas.setAttribute('aria-label', old.domElement.getAttribute('aria-label') ?? '3D viewport');
      canvas.dataset.testid = 'viewport-canvas';
      canvas.dataset.runtimeId = crypto.randomUUID();
      // Different context APIs require a fresh canvas; the runtime, scene, camera and project survive.
      this.cancel(false);
      this.stopPathResources();
      this.controls.disconnect();
      old.domElement.replaceWith(canvas);
      this.currentRenderer = next;
      this.camera.coordinateSystem = next.coordinateSystem;
      this.camera.updateProjectionMatrix();
      this.controls.connect(canvas);
      this.bindCanvas();
      this.bindRendererCallbacks(next);
      this.publishRender({ backend, switching: false, samples: 0 });
      this.resize();
      // The new renderer is already active. A failure releasing the previous one
      // cannot be reported as a failed initialization or revert its saved preference.
      try {
        await disposeSceneRenderer(old);
      } catch (error) {
        if (!this.disposed && request === this.backendRequest) {
          this.publishRender({ error: 'render.cleanupFailed' });
          this.options.status('render.cleanupFailed', { reason: String(error) });
        }
      }
      if (this.renderer !== next || request !== this.backendRequest || this.disposed) {
        return false;
      }
      if (this.renderState.mode === 'pathtrace') {
        this.markPathDirty();
      }
      return true;
    } catch (error) {
      if (next && next !== this.renderer) {
        await disposeSceneRenderer(next);
      }
      if (request === this.backendRequest) {
        this.publishRender({ switching: false, error: 'render.webgpuUnsupported' });
        this.options.status('render.webgpuUnsupported', { reason: String(error) });
      }
      return false;
    }
  }
  invalidate = () => {
    if (this.frameInProgress) {
      this.frameRequested = true;
      return;
    }
    if (!this.disposed && this.raf === null) {
      this.raf = requestAnimationFrame(this.frame);
    }
  };
  private sampledAngle(a: Playback, time: number) {
    return a.from + (a.to - a.from) * Math.max(0, Math.min(1, (time - a.start) / a.duration));
  }
  private frame = async (time: number) => {
    this.raf = null;
    if (this.disposed) {
      return;
    }
    this.frameInProgress = true;
    this.frameRequested = false;
    let continueSampling = false;
    try {
      // oxlint-disable-next-line unicorn/no-useless-spread -- Completing a door submits a command that can mutate the animation Map.
      for (const [id, a] of [...this.animations]) {
        const angle = this.sampledAngle(a, time);
        this.liveAngles.set(id, angle);
        this.setDoorPose(id, angle);
        if (time >= a.start + a.duration) {
          this.animations.delete(id);
          this.liveAngles.delete(id);
          if (!this.options.command({ type: 'update-opening', id, patch: { angle: a.to } })) {
            const formal = this.previous.openings.find((o) => o.id === id);
            if (formal) {
              this.setDoorPose(id, formal.angle);
            }
          }
        }
      }
      if (this.animations.size) {
        this.invalidate();
      }
      const interactive =
        !!this.drag ||
        this.preview.visible ||
        this.cameraPointers.size > 0 ||
        this.animations.size > 0;
      if (interactive) {
        this.lastInteraction = time;
      }
      const activePath = this.path;
      if (activePath && !this.pathDirty) {
        const cameraKey = this.pathCameraSignature();
        if (cameraKey !== this.pathCameraKey) {
          activePath.updateCamera(this.camera);
          this.pathCameraKey = cameraKey;
        }
      }
      if (activePath && !this.pathDirty && !interactive && time - this.lastInteraction > 150) {
        const retained = activePath.getStats();
        if (retained.paused || retained.complete) {
          activePath.present();
        } else {
          continueSampling = await activePath.renderSample();
        }
        if (this.disposed || activePath !== this.path) {
          return;
        }
        const stats = activePath.getStats();
        if (time - this.lastSamplePublish > 500 || stats.complete || stats.paused) {
          this.lastSamplePublish = time;
          this.publishRender({
            samples: stats.samples,
            pathStatus: stats.paused ? 'paused' : stats.complete ? 'complete' : 'rendering',
          });
        }
      } else {
        this.renderer.render(this.scene, this.camera);
        continueSampling = this.renderState.mode === 'pathtrace' && !!this.path && !this.pathDirty;
      }
      this.frameCount++;
    } catch (error) {
      continueSampling = false;
      // An uncaptured device error may already have stopped this in-flight frame.
      // Keep its first shader diagnostic instead of replacing it with a disposal consequence.
      if (this.renderState.error !== 'render.pathFailed') {
        this.stopPathResources();
        this.publishRender({ mode: 'raster', pathStatus: 'error', error: 'render.pathFailed' });
        this.options.status('render.pathFailed', { reason: String(error) });
      }
    } finally {
      this.frameInProgress = false;
      if (this.frameRequested || continueSampling || this.animations.size) {
        this.invalidate();
      }
    }
  };
  private pathCameraSignature() {
    return [
      ...this.camera.position.toArray(),
      ...this.camera.quaternion.toArray(),
      ...this.camera.projectionMatrix.elements,
    ].join(',');
  }
  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) {
      return;
    }
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.path?.reset();
    this.invalidate();
  }
  setViewportTheme(theme: ViewportTheme) {
    this.theme = theme;
    this.renderer.setClearColor(theme.background);
    const old = this.grid;
    this.grid = new THREE.GridHelper(100, 100, theme.axis, theme.grid);
    this.grid.position.copy(old.position);
    this.auxiliary.remove(old);
    old.geometry.dispose();
    (Array.isArray(old.material) ? old.material : [old.material]).forEach((m) => m.dispose());
    this.auxiliary.add(this.grid);
    (this.outline.material as THREE.LineBasicMaterial).color.set(theme.selection);
    (this.snapMark.material as THREE.MeshBasicMaterial).color.set(theme.snap);
    (this.preview.material as THREE.MeshBasicMaterial).color.set(
      this.previewValid ? theme.preview : theme.invalid,
    );
    this.selectionKey = '';
    this.selection();
    this.invalidate();
  }
  private stopPathResources() {
    this.pathRequest++;
    if (this.pathTimer !== null) {
      clearTimeout(this.pathTimer);
      this.pathTimer = null;
    }
    const owned = [this.path, this.pathBuilding, this.pathDefaultEnvironment];
    this.path = null;
    this.pathBuilding = null;
    this.pathScene = null;
    this.pathDefaultEnvironment = null;
    this.pathDirty = false;
    this.pathCameraKey = '';
    const failures: unknown[] = [];
    for (const resource of owned) {
      try {
        resource?.dispose();
      } catch (error) {
        failures.push(error);
        console.warn('Path tracing resource cleanup failed.', error);
      }
    }
    if (failures.length && !this.disposed) {
      this.publishRender({ error: 'render.cleanupFailed' });
      this.options.status('render.cleanupFailed', { reason: failures.map(String).join('\n') });
    }
  }
  async setPathTracing(enabled: boolean): Promise<void> {
    this.cancel(false);
    if (!enabled) {
      this.stopPathResources();
      this.publishRender({ mode: 'raster', pathStatus: 'idle', samples: 0, error: undefined });
      this.invalidate();
      return;
    }
    this.pathPaused = false;
    this.publishRender({ mode: 'pathtrace', pathStatus: 'building', error: undefined });
    this.pathDirty = true;
    await this.rebuildPath(++this.pathRequest);
  }
  setPathSamples(samples: number) {
    if (!Number.isInteger(samples) || samples < 1 || samples > 4096) {
      return;
    }
    this.path?.setMaxSamples(samples);
    this.publishRender({ targetSamples: samples });
    this.invalidate();
  }
  pausePathTracing(paused: boolean) {
    this.pathPaused = paused;
    this.path?.pause(paused);
    this.publishRender({ pathStatus: paused ? 'paused' : 'rendering' });
    this.invalidate();
  }
  private markPathDirty() {
    if (this.renderState.mode !== 'pathtrace' || this.disposed) {
      return;
    }
    this.pathDirty = true;
    this.publishRender({ pathStatus: 'building', samples: 0 });
    const request = ++this.pathRequest;
    if (this.pathTimer !== null) {
      clearTimeout(this.pathTimer);
    }
    this.pathTimer = setTimeout(() => {
      this.pathTimer = null;
      void this.rebuildPath(request);
    }, 200);
  }
  private async rebuildPath(request: number) {
    if (
      this.disposed ||
      this.renderState.mode !== 'pathtrace' ||
      this.renderState.environmentLoading
    ) {
      return;
    }
    const snapshot = this.snapshot(),
      renderer = this.renderer;
    let built: BuiltBuilding | null = null;
    let path: PathTraceSession | null = null;
    let fallbackEnvironment: THREE.Texture | null = null;
    try {
      built = buildBuilding(snapshot);
      await built.resources.ready();
      const scene = new THREE.Scene();
      scene.add(built.root);
      for (const light of this.scene.children) {
        if (light instanceof THREE.DirectionalLight && light.visible) {
          scene.add(light.clone());
        }
      }
      if (this.environmentTexture) {
        fallbackEnvironment = await createPathTracingEnvironmentTexture(this.environmentTexture);
        scene.environment = fallbackEnvironment;
        scene.environmentIntensity = snapshot.environment?.intensity ?? 1;
        scene.environmentRotation.copy(this.scene.environmentRotation);
        if (snapshot.environment?.background) {
          scene.background = fallbackEnvironment;
          scene.backgroundRotation.copy(this.scene.backgroundRotation);
        }
      } else {
        fallbackEnvironment = createDefaultEnvironmentTexture();
        scene.environment = fallbackEnvironment;
      }
      scene.background ??= new THREE.Color().setScalar(0.12);
      const { PathTraceSession } = await import('./pathtracing');
      path = await PathTraceSession.create(renderer, {
        maxSamples: this.renderState.targetSamples,
      });
      await path.start(scene, this.camera);
      if (
        this.disposed ||
        request !== this.pathRequest ||
        renderer !== this.renderer ||
        snapshot.id !== this.previous.id ||
        snapshot.revision !== this.previous.revision
      ) {
        path.dispose();
        built.dispose();
        fallbackEnvironment?.dispose();
        return;
      }
      this.path?.dispose();
      this.pathBuilding?.dispose();
      this.pathDefaultEnvironment?.dispose();
      this.path = path;
      this.pathBuilding = built;
      this.pathScene = scene;
      this.pathDefaultEnvironment = fallbackEnvironment;
      this.pathDirty = false;
      this.pathCameraKey = '';
      path.pause(this.pathPaused);
      this.publishRender({ pathStatus: this.pathPaused ? 'paused' : 'rendering', samples: 0 });
      this.invalidate();
    } catch (error) {
      path?.dispose();
      built?.dispose();
      fallbackEnvironment?.dispose();
      if (!this.disposed && request === this.pathRequest) {
        this.stopPathResources();
        this.publishRender({ mode: 'raster', pathStatus: 'error', error: 'render.pathFailed' });
        this.options.status('render.pathFailed', { reason: String(error) });
        this.invalidate();
      }
    }
  }
  private async applyEnvironment(doc: ProjectDocument) {
    const resource = doc.environmentResources?.find((r) => r.id === doc.environment?.resourceId);
    const key = resource ? `${resource.id}:${resource.dataUrl}` : '';
    const configure = () => {
      const environment = this.previous.environment;
      this.scene.environment = this.environmentTexture;
      this.scene.environmentIntensity = environment?.intensity ?? 1;
      this.scene.environmentRotation.set(
        0,
        THREE.MathUtils.degToRad(environment?.rotation ?? 0),
        0,
      );
      this.scene.background = environment?.background ? this.environmentTexture : null;
      this.scene.backgroundRotation.copy(this.scene.environmentRotation);
      for (const light of this.scene.children) {
        if (light instanceof THREE.Light) {
          light.visible = !this.environmentTexture;
        }
      }
    };
    if (key === this.environmentKey) {
      configure();
      return;
    }
    this.environmentKey = key;
    const request = ++this.environmentRequest;
    this.publishRender({ environmentLoading: !!resource, error: undefined });
    try {
      const texture = resource ? await loadEnvironmentTexture(resource) : null;
      if (this.disposed || request !== this.environmentRequest) {
        texture?.dispose();
        return;
      }
      this.stopPathResources();
      this.environmentTexture?.dispose();
      this.environmentTexture = texture;
      this.environmentTextureKey = key;
      configure();
      this.publishRender({ environmentLoading: false });
      this.markPathDirty();
      this.invalidate();
    } catch (error) {
      if (this.disposed || request !== this.environmentRequest) {
        return;
      }
      // The pending key is not the retained texture's identity. A failed replacement
      // must still allow clearing or re-selecting the previously loaded environment.
      this.environmentKey = this.environmentTextureKey;
      this.stopPathResources();
      this.publishRender({
        mode: 'raster',
        pathStatus: 'error',
        environmentLoading: false,
        error: 'render.environmentFailed',
      });
      this.options.status('render.environmentFailed', { reason: String(error) });
      this.invalidate();
    }
  }
  async capturePNG(): Promise<ArrayBuffer> {
    if (this.path && this.pathCameraKey !== this.pathCameraSignature()) {
      this.path.updateCamera(this.camera);
      this.pathCameraKey = this.pathCameraSignature();
      this.invalidate();
      throw new Error('render.notReady');
    }
    if (
      this.renderState.environmentLoading ||
      this.pathDirty ||
      this.renderState.switching ||
      this.drag ||
      this.preview.visible ||
      this.cameraPointers.size > 0 ||
      this.animations.size > 0 ||
      (this.renderState.mode === 'pathtrace' && (!this.path || this.path.getStats().samples < 1))
    ) {
      throw new Error('render.notReady');
    }
    if (this.path) {
      this.path.present();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    const blob = await new Promise<Blob>((resolve, reject) =>
      this.renderer.domElement.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('render.captureFailed'))),
        'image/png',
      ),
    );
    return blob.arrayBuffer();
  }
  sync(doc: ProjectDocument, changes?: ChangeSet) {
    if (this.disposed) {
      return;
    }
    const prev = this.previous,
      replace = doc.id !== prev.id || changes?.reason === 'replace';
    const precise =
      changes &&
      changes.projectId === doc.id &&
      changes.revision === doc.revision &&
      changes.previousRevision === prev.revision &&
      !changes.full;
    const all = objectsOf(doc),
      changed = new Set(precise ? changes.affectedIds : all.map((o) => o.id));
    if (replace) {
      this.cancel(false);
      this.animations.clear();
      this.liveAngles.clear();
      for (const b of this.objects.values()) {
        this.building.remove(b.root);
        b.dispose();
      }
      this.objects.clear();
      this.resources.dispose();
      this.resources = new ResourcePool(doc);
    } else {
      this.resources.setDocument(doc);
    }
    for (const [id] of this.animations) {
      const old = prev.openings.find((o) => o.id === id),
        next = doc.openings.find((o) => o.id === id);
      if (
        !next ||
        old?.angle !== next.angle ||
        (['undo', 'redo'].includes(changes?.reason ?? '') && changed.has(id))
      ) {
        this.animations.delete(id);
        this.liveAngles.delete(id);
      }
    }
    for (const [id, b] of this.objects) {
      if (!all.some((o) => o.id === id) || changed.has(id)) {
        this.building.remove(b.root);
        b.dispose();
        this.objects.delete(id);
      }
    }
    this.rebuiltIds = [];
    for (const o of all) {
      if (this.objects.has(o.id)) {
        continue;
      }
      try {
        const b = buildObject(doc, o.id, this.resources, { acceleratePicking: true });
        this.objects.set(o.id, b);
        this.building.add(b.root);
        this.rebuiltIds.push(o.id);
      } catch (error) {
        this.options.status('geometry.failed', { reason: String(error) });
      }
    }
    this.previous = doc;
    for (const [id, angle] of this.liveAngles) {
      this.setDoorPose(id, angle);
    }
    const pool = this.resources;
    void pool
      .ready()
      .then(() => {
        if (!this.disposed && pool === this.resources) {
          this.invalidate();
        }
      })
      .catch((e) => {
        if (!this.disposed && pool === this.resources) {
          this.options.status('resource.failed', { reason: String(e) });
        }
      });
    this.selectionKey = '';
    void this.applyEnvironment(doc);
    if (this.renderState.mode === 'pathtrace') {
      this.markPathDirty();
    }
    this.setSession();
  }
  setSession() {
    if (this.disposed) {
      return;
    }
    const s = this.options.getSession(),
      doc = this.options.getDocument();
    if (s.tool !== this.activeTool || s.levelId !== this.activeLevel) {
      this.cancel(false);
      this.activeTool = s.tool;
      this.activeLevel = s.levelId;
      this.tools.handle({ type: 'activate', tool: s.tool });
    }
    this.tools.handle({
      type: 'camera',
      active: s.cameraMode !== 'edit' || this.cameraPointers.size > 0,
    });
    this.grid.position.y = (doc.levels.find((l) => l.id === s.levelId)?.elevation ?? 0) - 0.005;
    this.controls.mouseButtons.LEFT =
      s.cameraMode === 'rotate'
        ? THREE.MOUSE.ROTATE
        : s.cameraMode === 'pan'
          ? THREE.MOUSE.PAN
          : (null as unknown as THREE.MOUSE);
    const dataById = new Map(objectsOf(doc).map((o) => [o.id, o]));
    for (const [id, b] of this.objects) {
      const ghost = !s.wholeBuilding && dataById.get(id)?.levelId !== s.levelId;
      b.root.visible = !s.hiddenIds.includes(id);
      b.root.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) {
          return;
        }
        if (!o.userData.displayMaterials) {
          const formal = Array.isArray(o.material) ? o.material : [o.material];
          o.userData.formalMaterials = formal;
          o.userData.displayMaterials = formal.map((m) => m.clone());
          o.material = Array.isArray(o.material)
            ? o.userData.displayMaterials
            : o.userData.displayMaterials[0];
        }
        const formal = o.userData.formalMaterials as THREE.Material[];
        (o.userData.displayMaterials as THREE.Material[]).forEach((m, i) => {
          const transparent = ghost || formal[i]!.transparent,
            depthWrite = !ghost && formal[i]!.depthWrite;
          if (m.transparent !== transparent || m.depthWrite !== depthWrite) {
            m.transparent = transparent;
            m.depthWrite = depthWrite;
            m.needsUpdate = true;
          }
          m.opacity = ghost ? 0.25 : formal[i]!.opacity;
        });
      });
    }
    this.selection();
    this.invalidate();
  }
  private selection() {
    const s = this.options.getSession(),
      key = JSON.stringify([
        this.previous.id,
        this.previous.revision,
        s.selectedId,
        s.surface,
        s.tool,
        s.levelId,
        s.wholeBuilding,
        s.hiddenIds,
      ]);
    if (key === this.selectionKey) {
      return;
    }
    this.selectionKey = key;
    disposeHelpers(this.handles);
    disposeHelpers(this.surfaceHighlight);
    disposeHelpers(this.hingeHighlight);
    this.outline.visible = false;
    const b = s.selectedId ? this.objects.get(s.selectedId) : undefined;
    if (!b || !b.root.visible) {
      return;
    }
    const data = objectsOf(this.previous).find((o) => o.id === s.selectedId);
    if (!data) {
      return;
    }
    b.root.updateWorldMatrix(true, true);
    this.outline.box.setFromObject(b.root);
    this.outline.visible = true;
    b.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !o.geometry.index) {
        return;
      }
      const roles = o.userData.surfaceRoles as string[] | undefined;
      if (!roles) {
        return;
      }
      const indices: number[] = [];
      for (const g of o.geometry.groups) {
        const role = roles[g.materialIndex ?? 0];
        if (
          role === s.surface ||
          ('start' in data &&
            s.surface === 'edge' &&
            ['edge', 'top', 'bottom', 'reveal'].includes(role ?? ''))
        ) {
          for (let i = g.start; i < g.start + g.count; i++) {
            indices.push(o.geometry.index!.getX(i));
          }
        }
      }
      if (!indices.length) {
        return;
      }
      const subset = new THREE.BufferGeometry();
      subset.setAttribute('position', o.geometry.getAttribute('position'));
      subset.setIndex(indices);
      const edges = new THREE.EdgesGeometry(subset, 1);
      subset.dispose();
      const boundary = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: this.theme.selection, depthTest: false }),
      );
      boundary.matrixAutoUpdate = false;
      boundary.matrix.copy(o.matrixWorld);
      boundary.userData.source = o;
      boundary.renderOrder = 20;
      this.surfaceHighlight.add(boundary);
    });
    if ('kind' in data && data.kind === 'door') {
      const pivot = b.root.getObjectByName(`HingePivot_${data.id}`);
      if (pivot) {
        const p = pivot.getWorldPosition(new THREE.Vector3());
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(0.09, 12, 8),
          new THREE.MeshBasicMaterial({ color: this.theme.selection, depthTest: false }),
        );
        marker.position.copy(p);
        marker.renderOrder = 21;
        const geometry = new THREE.BufferGeometry().setFromPoints([
          p,
          p.clone().add(new THREE.Vector3(0, data.height, 0)),
        ]);
        const axis = new THREE.Line(
          geometry,
          new THREE.LineBasicMaterial({ color: this.theme.selection, depthTest: false }),
        );
        axis.renderOrder = 21;
        this.hingeHighlight.add(marker, axis);
      }
    }
    if (s.tool !== 'select' || s.wholeBuilding) {
      return;
    }
    const handle = (p: Vec2, y: number, props: Record<string, unknown>) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 12, 8),
        new THREE.MeshBasicMaterial({ color: this.theme.selection, depthTest: false }),
      );
      mesh.position.set(p.x, y, p.z);
      mesh.renderOrder = 22;
      Object.assign(mesh.userData, props);
      this.handles.add(mesh);
    };
    if ('start' in data) {
      const y = (this.previous.levels.find((l) => l.id === data.levelId)?.elevation ?? 0) + 0.15;
      for (const endpoint of ['start', 'end'] as const) {
        handle(data[endpoint], y, { endpoint });
      }
    } else if ('polygon' in data) {
      data.polygon.forEach((p, corner) => handle(p, data.elevation + 0.06, { corner }));
    }
  }
  // Input can follow a camera or object edit before the scheduled render. Picking and
  // projection must use current matrices rather than relying on renderer side effects.
  private coordinates(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    );
    this.camera.updateMatrixWorld(true);
    this.ray.setFromCamera(this.pointer, this.camera);
  }
  private ground(e: PointerEvent, elevation?: number): Vec2 | null {
    this.coordinates(e);
    const s = this.options.getSession(),
      doc = this.options.getDocument(),
      y =
        elevation ??
        this.drag?.elevation ??
        doc.levels.find((l) => l.id === s.levelId)?.elevation ??
        0;
    this.plane.set(new THREE.Vector3(0, 1, 0), -y);
    const hit = this.ray.ray.intersectPlane(this.plane, new THREE.Vector3());
    if (!hit) {
      return null;
    }
    const hidden = new Set(s.hiddenIds),
      visible = hidden.size
        ? {
            ...doc,
            walls: doc.walls.filter((w) => !hidden.has(w.id)),
            slabs: doc.slabs.filter((b) => !hidden.has(b.id)),
          }
        : doc;
    const p = snapPoint({ x: hit.x, z: hit.z }, visible, s.levelId, {
      excludeId: this.drag?.id,
    }).point;
    this.snapMark.position.set(p.x, y + 0.04, p.z);
    this.snapMark.visible = true;
    return p;
  }
  private pick(e: PointerEvent) {
    this.coordinates(e);
    const s = this.options.getSession(),
      doc = this.options.getDocument(),
      dataById = new Map(objectsOf(doc).map((o) => [o.id, o]));
    const candidates = [...this.objects]
      .filter(
        ([id, b]) =>
          b.root.visible && !s.hiddenIds.includes(id) && dataById.get(id)?.levelId === s.levelId,
      )
      .map(([, b]) => b.root);
    for (const candidate of candidates) {
      candidate.updateWorldMatrix(true, true);
    }
    const hit = this.ray.intersectObjects(candidates, true)[0];
    if (!hit) {
      return null;
    }
    let o: THREE.Object3D | null = hit.object;
    while (o && !o.userData.objectId) {
      o = o.parent;
    }
    const id = o?.userData.objectId as string | undefined;
    if (!id) {
      return null;
    }
    let role = 'A';
    if (hit.object instanceof THREE.Mesh && hit.face) {
      const roles = hit.object.userData.surfaceRoles as string[] | undefined;
      role = roles?.[hit.face.materialIndex] ?? ['A', 'B', 'edge'][hit.face.materialIndex] ?? 'A';
    }
    if ('start' in dataById.get(id)! && ['top', 'bottom', 'reveal'].includes(role)) {
      role = 'edge';
    }
    return { id, point: hit.point, role };
  }
  private down = (e: PointerEvent) => {
    this.controls.mouseButtons.RIGHT = e.shiftKey ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    const s = this.options.getSession();
    if (e.button !== 0 || s.cameraMode !== 'edit') {
      this.cameraPointers.add(e.pointerId);
      this.tools.handle({ type: 'camera', active: true });
      return;
    }
    if (s.wholeBuilding) {
      return;
    }
    this.renderer.domElement.focus();
    const p = this.ground(e);
    if (!p) {
      return;
    }
    const hit = this.pick(e),
      doc = this.options.getDocument();
    if (s.tool === 'select' || s.tool === 'material') {
      this.handles.updateWorldMatrix(true, true);
      const handleHit = this.ray.intersectObjects(this.handles.children)[0];
      if (handleHit && s.selectedId && s.tool === 'select') {
        const data = objectsOf(doc).find((o) => o.id === s.selectedId);
        if (data) {
          this.beginDrag(
            e,
            data,
            handleHit.object.userData.endpoint,
            handleHit.object.userData.corner,
          );
        }
        return;
      }
      this.options.select(hit?.id ?? null, hit?.role);
      if (s.tool === 'select' && hit) {
        const data = objectsOf(doc).find((o) => o.id === hit.id);
        if (data) {
          this.beginDrag(e, data);
        }
      }
      return;
    }
    if (s.tool === 'wall' || s.tool === 'slab') {
      const intent = this.tools.handle({ type: 'click', point: p });
      if (!intent) {
        if (this.tools.getState().kind === 'start') {
          this.options.status('hint.end');
        }
        this.invalidate();
        return;
      }
      if (intent.type === 'create-wall' || intent.type === 'create-slab') {
        const data =
          intent.type === 'create-wall'
            ? createWall(s.levelId, intent.start, intent.end)
            : createSlab(
                s.levelId,
                intent.start,
                intent.end,
                s.slabPurpose === 'roof'
                  ? s.roofElevation
                  : doc.levels.find((l) => l.id === s.levelId)!.elevation,
                s.slabPurpose,
              );
        this.clearPreviewTransaction();
        if (!this.options.command(addCommand(data))) {
          this.tools.reject(intent);
        } else {
          this.preview.visible = false;
          this.previewObjectId = null;
        }
      }
      this.invalidate();
      return;
    }
    if ((s.tool === 'door' || s.tool === 'window') && hit) {
      const wall = doc.walls.find((w) => w.id === hit.id);
      if (!wall) {
        return;
      }
      const opening = this.openingAt(wall, s.tool, hit.point),
        result = this.checkPreview(addCommand(opening));
      this.tools.handle({
        type: 'click',
        point: p,
        host: { wallId: wall.id, offset: opening.offset, valid: result.ok },
      });
      this.clearPreviewTransaction();
      if (this.options.command(addCommand(opening))) {
        this.options.select(opening.id);
        this.preview.visible = false;
        this.previewObjectId = null;
      }
    }
  };
  private beginDrag(
    e: PointerEvent,
    data: ObjectData,
    endpoint?: 'start' | 'end',
    corner?: number,
  ) {
    const doc = this.options.getDocument(),
      elevation =
        'polygon' in data
          ? data.elevation
          : doc.levels.find((l) => l.id === data.levelId)!.elevation,
      start = this.ground(e, elevation);
    if (!start) {
      return;
    }
    this.clearPreviewTransaction();
    this.drag = {
      id: data.id,
      start,
      initial: data,
      draft: data,
      endpoint,
      corner,
      elevation,
      projectId: doc.id,
      revision: doc.revision,
    };
    this.pointerId = e.pointerId;
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.controls.enabled = false;
  }
  private openingAt(wall: Wall, kind: 'door' | 'window', p: { x: number; z: number }) {
    const len = wallLength(wall),
      distance =
        ((p.x - wall.start.x) * (wall.end.x - wall.start.x) +
          (p.z - wall.start.z) * (wall.end.z - wall.start.z)) /
        len;
    const o = createOpening(wall, kind, distance - (kind === 'door' ? 0.45 : 0.6));
    o.offset = Math.round(o.offset * 10) / 10;
    return o;
  }
  private move = (e: PointerEvent) => {
    const s = this.options.getSession();
    if (
      s.cameraMode !== 'edit' ||
      s.wholeBuilding ||
      this.cameraPointers.size ||
      (e.buttons & 2) !== 0
    ) {
      return;
    }
    const p = this.ground(e);
    if (!p) {
      return;
    }
    if (this.drag) {
      if (e.pointerId !== this.pointerId) {
        return;
      }
      const d = this.drag,
        dx = p.x - d.start.x,
        dz = p.z - d.start.z;
      if ('start' in d.initial) {
        const w = d.initial;
        if (d.endpoint) {
          const other = d.endpoint === 'start' ? w.end : w.start,
            end =
              Math.abs(w.end.x - w.start.x) > 0.001
                ? { x: p.x, z: other.z }
                : { x: other.x, z: p.z };
          d.draft = { ...w, [d.endpoint]: end };
        } else {
          d.draft = {
            ...w,
            start: { x: w.start.x + dx, z: w.start.z + dz },
            end: { x: w.end.x + dx, z: w.end.z + dz },
          };
        }
      } else if ('polygon' in d.initial) {
        const b = d.initial;
        d.draft = {
          ...b,
          polygon:
            d.corner === undefined
              ? b.polygon.map((v) => ({ x: v.x + dx, z: v.z + dz }))
              : rectanglePolygon(
                  { x: b.polygon[d.corner]!.x + dx, z: b.polygon[d.corner]!.z + dz },
                  b.polygon[(d.corner + 2) % 4]!,
                ),
        };
      } else {
        const o = d.initial,
          w = this.options.getDocument().walls.find((w) => w.id === o.wallId);
        if (!w) {
          return;
        }
        const len = wallLength(w);
        d.draft = {
          ...o,
          offset:
            Math.round(
              (o.offset + (dx * (w.end.x - w.start.x) + dz * (w.end.z - w.start.z)) / len) * 10,
            ) / 10,
        };
      }
      this.showDraft(d.draft, updateCommand(d.draft));
      this.invalidate();
      return;
    }
    this.tools.handle({ type: 'move', point: p });
    const state = this.tools.getState();
    if (state.kind === 'preview') {
      const doc = this.options.getDocument(),
        data =
          state.tool === 'wall'
            ? createWall(s.levelId, state.start, state.end)
            : createSlab(
                s.levelId,
                state.start,
                state.end,
                s.slabPurpose === 'roof'
                  ? s.roofElevation
                  : doc.levels.find((l) => l.id === s.levelId)!.elevation,
                s.slabPurpose,
              );
      data.id = this.previewObjectId ??= data.id;
      this.showDraft(data, addCommand(data));
    } else if (s.tool === 'door' || s.tool === 'window') {
      const hit = this.pick(e),
        wall = this.options.getDocument().walls.find((w) => w.id === hit?.id);
      if (hit && wall) {
        const opening = this.openingAt(wall, s.tool, hit.point);
        opening.id = this.previewObjectId ??= opening.id;
        const result = this.showDraft(opening, addCommand(opening));
        this.tools.handle({
          type: 'move',
          point: p,
          host: { wallId: wall.id, offset: opening.offset, valid: result.ok },
        });
      } else {
        this.preview.visible = false;
        this.clearPreviewTransaction();
      }
    }
    this.invalidate();
  };
  private checkPreview(command: Command): PreviewResult {
    const revision = this.options.getDocument().revision;
    if (!this.drag && this.previewRevision !== revision) {
      this.clearPreviewTransaction();
    }
    if (!this.previewToken) {
      this.previewToken = this.options.beginPreview();
      this.previewRevision = revision;
    }
    return this.options.preview(this.previewToken, command);
  }
  private showDraft(data: ObjectData, command: Command) {
    const doc = this.options.getDocument(),
      level = doc.levels.find((l) => l.id === data.levelId)!,
      result = this.checkPreview(command);
    this.previewValid = result.ok;
    const error = result.ok ? '' : result.error.code;
    if (error && error !== this.previewError) {
      const params = Object.fromEntries(
        Object.entries(result.ok ? {} : (result.error.params ?? {})).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.join(', ') : value,
        ]),
      );
      this.options.status(error, params);
    }
    this.previewError = error;
    (this.preview.material as THREE.MeshBasicMaterial).color.set(
      result.ok ? this.theme.preview : this.theme.invalid,
    );
    if ('start' in data) {
      const len = wallLength(data);
      this.preview.scale.set(len, data.height, data.thickness);
      this.preview.position.set(
        (data.start.x + data.end.x) / 2,
        level.elevation + data.height / 2,
        (data.start.z + data.end.z) / 2,
      );
      this.preview.rotation.y = -Math.atan2(data.end.z - data.start.z, data.end.x - data.start.x);
      const signature = `${doc.revision}:${len.toFixed(2)}`;
      if (
        result.ok &&
        signature !== this.lengthSignature &&
        performance.now() - this.lastStatus > 100
      ) {
        this.options.status('hint.length', { length: len.toFixed(2) });
        this.lastStatus = performance.now();
        this.lengthSignature = signature;
      }
    } else if ('polygon' in data) {
      const xs = data.polygon.map((p) => p.x),
        zs = data.polygon.map((p) => p.z),
        x0 = Math.min(...xs),
        x1 = Math.max(...xs),
        z0 = Math.min(...zs),
        z1 = Math.max(...zs);
      this.preview.scale.set(x1 - x0, data.thickness, z1 - z0);
      this.preview.position.set((x0 + x1) / 2, data.elevation - data.thickness / 2, (z0 + z1) / 2);
      this.preview.rotation.y = 0;
    } else {
      const w = doc.walls.find((w) => w.id === data.wallId);
      if (!w) {
        this.preview.visible = false;
        return result;
      }
      const len = wallLength(w),
        t = (data.offset + data.width / 2) / len;
      this.preview.scale.set(data.width, data.height, w.thickness + 0.04);
      this.preview.position.set(
        w.start.x + (w.end.x - w.start.x) * t,
        level.elevation + data.sill + data.height / 2,
        w.start.z + (w.end.z - w.start.z) * t,
      );
      this.preview.rotation.y = -Math.atan2(w.end.z - w.start.z, w.end.x - w.start.x);
    }
    this.preview.visible = true;
    return result;
  }
  private up = (e: PointerEvent) => {
    this.cameraPointers.delete(e.pointerId);
    this.tools.handle({
      type: 'camera',
      active: this.options.getSession().cameraMode !== 'edit' || this.cameraPointers.size > 0,
    });
    if (!this.drag || e.pointerId !== this.pointerId) {
      return;
    }
    const d = this.drag,
      doc = this.options.getDocument();
    this.drag = null;
    this.releasePointer();
    this.preview.visible = false;
    this.controls.enabled = true;
    this.clearPreviewTransaction();
    if (JSON.stringify(d.initial) !== JSON.stringify(d.draft)) {
      if (doc.id !== d.projectId || doc.revision !== d.revision) {
        this.options.status('transaction.stale');
      } else {
        this.options.command(updateCommand(d.draft));
      }
    }
    this.invalidate();
  };
  private pointerCancelled = (e: PointerEvent) => {
    this.cameraPointers.delete(e.pointerId);
    this.cancel(false);
  };
  private lost = (e: PointerEvent) => {
    this.cameraPointers.delete(e.pointerId);
    if (this.drag) {
      this.cancel(false);
    } else {
      this.tools.handle({
        type: 'camera',
        active: this.options.getSession().cameraMode !== 'edit' || this.cameraPointers.size > 0,
      });
    }
  };
  private releasePointer() {
    const id = this.pointerId;
    this.pointerId = null;
    if (id !== null && this.renderer.domElement.hasPointerCapture(id)) {
      this.renderer.domElement.releasePointerCapture(id);
    }
  }
  private clearPreviewTransaction() {
    if (this.previewToken) {
      this.options.cancelPreview(this.previewToken);
    }
    this.previewToken = null;
    this.previewRevision = -1;
    this.lengthSignature = '';
    this.previewError = '';
  }
  cancel = (exitTool: boolean | Event = true) => {
    const idle = this.tools.getState().kind === 'idle';
    this.drag = null;
    this.releasePointer();
    this.clearPreviewTransaction();
    this.previewObjectId = null;
    this.tools.handle({ type: 'cancel' });
    this.cameraPointers.clear();
    this.tools.handle({ type: 'camera', active: this.options.getSession().cameraMode !== 'edit' });
    this.controls.enabled = true;
    this.preview.visible = false;
    this.snapMark.visible = false;
    if (idle && exitTool === true && this.options.activateTool) {
      this.options.activateTool('select');
    } else if (this.tools.getState().tool !== this.options.getSession().tool) {
      this.tools.handle({ type: 'activate', tool: this.options.getSession().tool });
    }
    this.invalidate();
  };
  focus(scope: 'selected' | 'level' | 'all' | 'top' = 'all') {
    const box = new THREE.Box3(),
      s = this.options.getSession(),
      dataById = new Map(objectsOf(this.previous).map((o) => [o.id, o]));
    for (const [id, b] of this.objects) {
      if (
        !b.root.visible ||
        (scope === 'selected' && id !== s.selectedId) ||
        (scope === 'level' && dataById.get(id)?.levelId !== s.levelId)
      ) {
        continue;
      }
      box.expandByObject(b.root);
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
  animateDoor(id: string, to: number) {
    const door = this.previous.openings.find((o) => o.id === id && o.kind === 'door');
    if (!door) {
      return;
    }
    const time = performance.now(),
      current = this.animations.get(id);
    this.animations.set(id, {
      id,
      from: current ? this.sampledAngle(current, time) : (this.liveAngles.get(id) ?? door.angle),
      to,
      start: time,
      duration: Math.max(1, door.duration * 1000),
    });
    this.invalidate();
  }
  private setDoorPose(id: string, angle: number) {
    const o = this.previous.openings.find((o) => o.id === id),
      root = this.objects.get(id)?.root;
    if (!o || !root) {
      return;
    }
    const pivot = root.getObjectByName(`HingePivot_${id}`);
    if (pivot) {
      pivot.rotation.y = doorRadians(
        o,
        this.previous.walls.find((w) => w.id === o.wallId),
        angle,
      );
    }
    if (this.options.getSession().selectedId === id) {
      root.updateWorldMatrix(true, true);
      for (const boundary of this.surfaceHighlight.children) {
        const source = boundary.userData.source as THREE.Object3D | undefined;
        if (source) {
          boundary.matrix.copy(source.matrixWorld);
        }
      }
      this.outline.box.setFromObject(root);
    }
  }
  snapshot(): ProjectDocument {
    const doc = this.options.getDocument();
    if (!this.animations.size && !this.liveAngles.size) {
      return doc;
    }
    const time = performance.now();
    return {
      ...doc,
      openings: doc.openings.map((o) => {
        const a = this.animations.get(o.id),
          angle = a ? this.sampledAngle(a, time) : this.liveAngles.get(o.id);
        return angle === undefined ? o : { ...o, angle };
      }),
    };
  }
  diagnostics() {
    let pathAuxiliary = 0,
      pathMeshes = 0,
      pathDisplayOverrides = 0;
    this.pathScene?.traverse((object) => {
      if (
        object instanceof THREE.GridHelper ||
        object instanceof THREE.Box3Helper ||
        object === this.auxiliary ||
        object === this.preview ||
        object === this.snapMark
      ) {
        pathAuxiliary++;
      }
      if (object instanceof THREE.Mesh) {
        pathMeshes++;
        if (object.userData.displayMaterials) {
          pathDisplayOverrides++;
        }
      }
    });
    return {
      frameCount: this.frameCount,
      objects: this.objects.size,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      pendingFrame: this.raf !== null,
      rendererId: this.renderer.domElement.dataset.runtimeId,
      lifecycle: { ...lifecycle, active: lifecycle.created - lifecycle.disposed },
      eventListeners: this.unsubscribers.length + this.canvasUnsubscribers.length,
      resources: this.resources.stats,
      rebuiltIds: [...this.rebuiltIds],
      handles: this.handles.children.length,
      surfaceHighlights: this.surfaceHighlight.children.length,
      hingeMarkers: this.hingeHighlight.children.length,
      preview: {
        visible: this.preview.visible,
        valid: this.previewValid,
        error: this.previewError,
        dragging: !!this.drag,
        state: this.tools.getState(),
      },
      animations: [...this.animations.keys()],
      render: this.renderState,
      actualBackend:
        this.renderer instanceof THREE.WebGLRenderer
          ? 'webgl'
          : (this.renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
            ? 'webgpu'
            : 'webgl-fallback',
      pathTracing: {
        stats: this.path?.getStats() ?? null,
        cleanBuildingChildren: this.pathBuilding?.root.children.length ?? 0,
        cleanBuilding: !!this.pathBuilding,
        resources: this.pathBuilding?.resources.stats ?? null,
        cleanGeometryObjects: this.pathBuilding ? objectsOf(this.previous).length : 0,
        auxiliaryObjects: pathAuxiliary,
        meshes: pathMeshes,
        displayMaterialOverrides: pathDisplayOverrides,
        sceneId: this.pathScene?.uuid ?? null,
        activeSession: this.path ? 1 : 0,
      },
      environment: {
        resourceId: this.previous.environment?.resourceId ?? null,
        textureId: this.environmentTexture?.uuid ?? null,
        textureName: this.environmentTexture?.name ?? null,
        width: (this.environmentTexture?.image as { width?: number } | undefined)?.width ?? 0,
        height: (this.environmentTexture?.image as { height?: number } | undefined)?.height ?? 0,
        intensity: this.scene.environmentIntensity,
        rotation: this.scene.environmentRotation.y,
        background: this.scene.background === this.environmentTexture && !!this.environmentTexture,
      },
      bvh: bvhDiagnostics(),
      sceneId: this.scene.uuid,
      cameraId: this.camera.uuid,
      camera: { position: this.camera.position.toArray(), target: this.controls.target.toArray() },
    };
  }
  worldToClient(p: { x: number; y: number; z: number }) {
    this.camera.updateMatrixWorld(true);
    const v = new THREE.Vector3(p.x, p.y, p.z).project(this.camera),
      r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) * r.width) / 2, y: r.top + ((1 - v.y) * r.height) / 2 };
  }
  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    lifecycle.disposed++;
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
    }
    this.raf = null;
    this.observer.disconnect();
    this.unsubscribers.forEach((f) => f());
    this.unsubscribers = [];
    this.canvasUnsubscribers.forEach((f) => f());
    this.canvasUnsubscribers = [];
    this.controls.dispose();
    this.clearPreviewTransaction();
    this.animations.clear();
    this.liveAngles.clear();
    this.objects.forEach((b) => b.dispose());
    this.objects.clear();
    this.building.clear();
    this.resources.dispose();
    disposeHelpers(this.auxiliary);
    this.backendRequest++;
    this.environmentRequest++;
    this.stopPathResources();
    this.rendererCallbacksCleanup?.();
    this.rendererCallbacksCleanup = null;
    this.environmentTexture?.dispose();
    this.environmentTexture = null;
    void disposeSceneRenderer(this.renderer);
    this.renderer.domElement.remove();
    this.scene.clear();
  }
}
