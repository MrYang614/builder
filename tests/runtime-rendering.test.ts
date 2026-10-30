import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as THREE from 'three';
import type { EnvironmentResource, ProjectDocument } from '@building/editor-core';
import { defaultEnvironmentSettings, getEnvironmentSettings } from '@building/editor-core';
import { RuntimeRendering } from '../packages/three-runtime/src/runtime-rendering';
import type { RenderState, RendererBackend } from '../packages/three-runtime/src/renderer';
import type { PathTraceStats } from '../packages/three-runtime/src/pathtracing';
import type { RasterPostProcessor } from '../packages/three-runtime/src/postprocessing';

type TestCallback = ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;

interface BorrowedPath {
  start(scene: THREE.Scene, camera: THREE.Camera): Promise<void>;
  setMaxSamples(samples: number): void;
  pause(paused: boolean): void;
  reset(): void;
  dispose(): void;
  updateCamera(camera: THREE.Camera): void;
  renderSample(): Promise<boolean>;
  present(): void;
  getStats(): PathTraceStats;
}
interface FakeCanvas {
  tabIndex: number;
  dataset: Record<string, string>;
  setAttribute: TestCallback;
  getAttribute: TestCallback;
  replaceWith: TestCallback;
  toBlob: TestCallback;
  remove: TestCallback;
}
interface FakeRenderer {
  domElement: FakeCanvas;
  render: TestCallback;
  setPixelRatio: TestCallback;
  getPixelRatio(): number;
  setSize: TestCallback;
  setClearColor: TestCallback;
  outputColorSpace: string;
  toneMapping: number;
  toneMappingExposure: number;
  coordinateSystem: THREE.CoordinateSystem;
  onDeviceLost?: () => void;
  onError: (info: RendererErrorInfo) => void;
}
type RendererErrorInfo = { message: string; api: string; type: string } | string;
interface RuntimeHarness {
  previous: ProjectDocument;
  options: {
    status: TestCallback;
    renderState: TestCallback;
    getDocument(): ProjectDocument;
  };
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  currentRenderer: FakeRenderer;
  renderer: FakeRenderer;
  theme: { background: string };
  controls: { disconnect: TestCallback; connect: TestCallback };
  cancel: TestCallback;
  bindCanvas: TestCallback;
  resize: TestCallback;
  resizeBuffers(width: number, height: number, pixelRatio: number): void;
  renderState: RenderState;
  path: BorrowedPath | null;
  pathBuilding: { dispose(): void } | null;
  pathScene: THREE.Scene | null;
  pathDefaultEnvironment: THREE.Texture | null;
  rendererCallbacksCleanup: (() => void) | null;
  pathPaused: boolean;
  pathDirty: boolean;
  pathCameraKey: string;
  pathTimer: ReturnType<typeof setTimeout> | number | null;
  frameCount: number;
  frameInProgress: boolean;
  preview: { visible: boolean };
  lastInteraction: number;
  environmentKey: string;
  environmentTextureKey: string;
  environmentTexture: THREE.Texture | null;
  disposed: boolean;
  postProcessing: RasterPostProcessor | null;
  applyEnvironment(document: ProjectDocument): Promise<void>;
  capturePNG(): Promise<ArrayBuffer>;
  pathCameraSignature(): string;
  frame(time: number): Promise<void>;
  frameRendered: TestCallback;
  stopPathResources(): void;
  setPathTracing(enabled: boolean): Promise<void>;
  setPathSamples(samples: number): void;
  setActive(active: boolean): void;
  setRasterOnly(active: boolean): void;
  markPathDirty(): void;
  setRendererBackend(backend: RendererBackend): Promise<boolean>;
  bindRendererCallbacks(renderer: FakeRenderer): void;
  dispose(): void;
}

const loadTexture = vi.fn<(resource: EnvironmentResource) => Promise<THREE.Texture>>();
const requestFrame = vi.fn((_callback: FrameRequestCallback) => 1);
const createRenderer = vi.fn<(backend: RendererBackend) => Promise<FakeRenderer>>();
const releaseRenderer = vi.fn<(renderer: FakeRenderer) => Promise<void>>();
const createPath = vi.fn<(renderer: FakeRenderer) => Promise<BorrowedPath>>();
const buildBuilding = vi.fn<
  (document: ProjectDocument) => {
    root: THREE.Group;
    resources: { ready(): Promise<void> };
    dispose(): void;
  }
>();

vi.mock('../packages/three-runtime/src/renderer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../packages/three-runtime/src/renderer')>()),
  createWebGLRenderer: () => fakeRenderer(),
  createSceneRenderer: (backend: RendererBackend) => createRenderer(backend),
  disposeSceneRenderer: (renderer: FakeRenderer) => releaseRenderer(renderer),
}));
vi.mock('../packages/three-runtime/src/postprocessing', () => ({
  createRasterPostProcessing: () => null,
}));
vi.mock('../packages/three-runtime/src/environment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../packages/three-runtime/src/environment')>()),
  loadEnvironmentTexture: (resource: EnvironmentResource) => loadTexture(resource),
}));
vi.mock('../packages/three-runtime/src/scene', () => ({
  buildBuilding: (document: ProjectDocument) => buildBuilding(document),
}));
vi.mock('../packages/three-runtime/src/pathtracing', () => ({
  PathTraceSession: { create: (...args: unknown[]) => Reflect.apply(createPath, undefined, args) },
}));

function project(resource?: EnvironmentResource): ProjectDocument {
  return {
    schemaVersion: 1,
    id: 'rendering-test',
    name: 'Lifecycle regression fixture',
    revision: 1,
    levels: [],
    walls: [],
    slabs: [],
    openings: [],
    resources: [],
    continuity: [],
    environment: { ...defaultEnvironmentSettings(), resourceId: resource?.id },
    environmentResources: resource ? [resource] : [],
  };
}
const panorama = (id: string): EnvironmentResource => ({
  id,
  name: `${id}.hdr`,
  mime: 'image/vnd.radiance',
  dataUrl: `data:image/vnd.radiance;base64,${id}`,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function runtime() {
  const value = {} as RuntimeHarness;
  value.previous = project();
  value.options = {
    status: vi.fn(),
    renderState: vi.fn(),
    getDocument: () => value.previous,
  };
  value.preview = { visible: false };
  value.theme = { background: 'semantic-viewport-test-color' };
  value.controls = { disconnect: vi.fn(), connect: vi.fn() };
  value.cancel = vi.fn();
  value.bindCanvas = vi.fn();
  value.frameRendered = vi.fn();
  value.resize = vi.fn();
  value.scene = new THREE.Scene();
  value.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 1500);
  value.scene.add(new THREE.DirectionalLight(), new THREE.HemisphereLight());
  const owner = new RuntimeRendering(value.scene, value.camera, {
    background: () => value.theme.background,
    document: () => value.previous,
    snapshot: () => value.previous,
    interactive: () => value.preview.visible,
    advanceAnimations: () => false,
    cancelEditing: () => value.cancel(),
    disconnectControls: () => value.controls.disconnect(),
    connectControls: (canvas) => value.controls.connect(canvas),
    bindCanvas: () => value.bindCanvas(),
    resizeViewport: () => value.resize(),
    frameRendered: (time) => value.frameRendered(time),
    status: (code, params) => value.options.status(code, params),
    renderState: (state) => value.options.renderState(state),
  });
  // Tests observe the actual owners and inject owned allocation fakes at their resource boundary.
  // These aliases preserve the existing lifecycle assertions without production test-only APIs.
  const renderer = owner as unknown as Record<string, unknown>;
  const path = Reflect.get(owner, 'path') as Record<string, unknown>;
  const environment = Reflect.get(owner, 'environment') as Record<string, unknown>;
  const scheduler = Reflect.get(owner, 'scheduler') as Record<string, unknown>;
  const properties = (target: Record<string, unknown>, keys: string[]) => {
    for (const key of keys) {
      Object.defineProperty(value, key, {
        get: () => target[key],
        set: (next: unknown) => {
          target[key] = next;
        },
      });
    }
  };
  properties(renderer, [
    'currentRenderer',
    'renderState',
    'rendererCallbacksCleanup',
    'postProcessing',
    'lastInteraction',
  ]);
  properties(path, [
    'path',
    'pathBuilding',
    'pathScene',
    'pathDefaultEnvironment',
    'pathPaused',
    'pathDirty',
    'pathCameraKey',
    'pathTimer',
  ]);
  properties(environment, ['environmentKey', 'environmentTextureKey', 'environmentTexture']);
  properties(scheduler, ['frameCount', 'frameInProgress']);
  Object.defineProperty(value, 'renderer', { get: () => owner.renderer });
  Object.defineProperty(value, 'disposed', {
    get: () => renderer.disposed,
    set: (next: boolean) => {
      renderer.disposed = next;
      path.disposed = next;
      environment.disposed = next;
      scheduler.disposed = next;
    },
  });
  value.applyEnvironment = (doc) =>
    Reflect.apply(environment.apply as (doc: ProjectDocument) => Promise<void>, environment, [doc]);
  value.pathCameraSignature = () => Reflect.apply(path.cameraSignature as () => string, path, []);
  value.frame = (time) =>
    Reflect.apply(scheduler.frame as (time: number) => Promise<void>, scheduler, [time]);
  value.stopPathResources = () => Reflect.apply(path.stop as () => void, path, []);
  value.capturePNG = () => owner.capturePNG();
  value.setPathTracing = (enabled) => owner.setPathTracing(enabled);
  value.setPathSamples = (samples) => owner.setPathSamples(samples);
  value.setActive = (active) => owner.setActive(active);
  value.setRasterOnly = (active) => owner.setRasterOnly(active);
  value.resizeBuffers = (width, height, pixelRatio) => owner.resize(width, height, pixelRatio);
  value.markPathDirty = () => Reflect.apply(path.markDirty as () => void, path, []);
  value.setRendererBackend = (backend) => owner.setRendererBackend(backend);
  value.dispose = () => owner.dispose();
  value.bindRendererCallbacks = (next) =>
    Reflect.apply(renderer.bindRendererCallbacks as (next: FakeRenderer) => void, renderer, [next]);
  return value;
}
function fakeRenderer(nativeGPU = false): FakeRenderer {
  let pixelRatio = 1;
  const renderer = {
    render: vi.fn(),
    setPixelRatio: vi.fn((value: number) => {
      pixelRatio = value;
    }),
    getPixelRatio: () => pixelRatio,
    setSize: vi.fn(),
    setClearColor: vi.fn(),
    outputColorSpace: THREE.SRGBColorSpace,
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
    coordinateSystem: nativeGPU ? THREE.WebGPUCoordinateSystem : THREE.WebGLCoordinateSystem,
    onError: vi.fn(),
    onDeviceLost: vi.fn(),
    domElement: {
      tabIndex: 0,
      dataset: {},
      setAttribute: vi.fn(),
      getAttribute: vi.fn(() => '3D viewport'),
      replaceWith: vi.fn(),
      toBlob: vi.fn((callback: BlobCallback) => callback(new Blob(['encoded PNG fixture']))),
      remove: vi.fn(),
    },
  } as unknown as FakeRenderer;
  if (!nativeGPU) {
    // Own data properties shadow WebGLRenderer's GPU-dependent color-space accessor.
    Object.setPrototypeOf(renderer, THREE.WebGLRenderer.prototype);
  }
  return renderer;
}
async function apply(value: RuntimeHarness, document: ProjectDocument) {
  value.previous = document;
  await value.applyEnvironment(document);
}
function allocatedPath(state: Partial<PathTraceStats> = {}) {
  let stats: PathTraceStats = {
    backend: 'webgl',
    samples: 16,
    minSamples: 16,
    maxSamples: 16,
    targetSamples: 16,
    paused: false,
    complete: true,
    ready: true,
    ...state,
  };
  const path = {
    start: vi.fn(async (_scene: THREE.Scene, _camera: THREE.Camera) => {}),
    setMaxSamples: vi.fn((samples: number) => {
      stats = { ...stats, targetSamples: samples };
    }),
    pause: vi.fn(),
    reset: vi.fn(() => {
      stats = { ...stats, samples: 0, minSamples: 0, maxSamples: 0, complete: false };
    }),
    dispose: vi.fn(),
    updateCamera: vi.fn((_camera: THREE.Camera) => {
      stats = { ...stats, samples: 0, minSamples: 0, maxSamples: 0, complete: false };
    }),
    renderSample: vi.fn(async () => false),
    present: vi.fn(),
    getStats: vi.fn(() => stats),
  };
  return path;
}
function retainedPath(value: RuntimeHarness, state: Partial<PathTraceStats> = {}) {
  const path = allocatedPath(state);
  value.path = path;
  value.pathPaused = path.getStats().paused;
  value.pathCameraKey = value.pathCameraSignature();
  value.renderState = { ...value.renderState, mode: 'pathtrace', samples: 16 };
  return path;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', requestFrame);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('devicePixelRatio', 1);
  loadTexture.mockReset();
  requestFrame.mockClear();
  createRenderer.mockReset();
  releaseRenderer.mockReset().mockResolvedValue(undefined);
  createPath.mockReset();
  buildBuilding.mockReset();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('production render owners with owned allocation fakes (no GPU claim)', () => {
  test('phase notification starts its hold after an expensive raster frame, not at the RAF timestamp', async () => {
    const value = runtime();
    const now = vi.spyOn(performance, 'now').mockReturnValue(10);
    value.currentRenderer.render.mockImplementation(() => {
      now.mockReturnValue(810);
    });
    await value.frame(10);
    expect(value.frameRendered).toHaveBeenCalledWith(810);
    now.mockRestore();
  });

  test('view morphs retain paused tracer resources and policy while presenting only raster frames', async () => {
    const value = runtime();
    const retained = retainedPath(value, { paused: true });
    value.renderState = { ...value.renderState, pathStatus: 'paused' };
    const original = value.camera.position.clone();
    value.setRasterOnly(true);
    value.camera.position.x += 3;
    await value.frame(1000);
    expect(value.currentRenderer.render).toHaveBeenCalledOnce();
    expect(retained.updateCamera).not.toHaveBeenCalled();
    expect(retained.present).not.toHaveBeenCalled();
    expect(retained.renderSample).not.toHaveBeenCalled();
    expect(value.renderState.mode).toBe('pathtrace');
    expect(value.renderState.pathStatus).toBe('paused');
    await expect(value.capturePNG()).rejects.toThrow('render.notReady');
    value.camera.position.copy(original);
    value.setRasterOnly(false);
    await value.frame(1500);
    expect(retained.present).toHaveBeenCalledOnce();
    expect(retained.updateCamera).not.toHaveBeenCalled();
    expect(retained.dispose).not.toHaveBeenCalled();
    expect(retained.getStats().samples).toBe(16);
  });

  test('settled morph camera resets paused samples and presents a raster fallback with no extra RAF', async () => {
    const value = runtime();
    const retained = retainedPath(value, { paused: true });
    value.setRasterOnly(true);
    value.camera.position.x += 3;
    await value.frame(1000);
    value.setRasterOnly(false);
    requestFrame.mockClear();
    await value.frame(1500);
    expect(retained.updateCamera).toHaveBeenCalledOnce();
    expect(retained.getStats().samples).toBe(0);
    expect(retained.present).not.toHaveBeenCalled();
    expect(retained.renderSample).not.toHaveBeenCalled();
    expect(value.currentRenderer.render).toHaveBeenCalledTimes(2);
    expect(requestFrame).not.toHaveBeenCalled();
  });

  test('same-size activation preserves the canvas, post buffers and paused trace samples', async () => {
    const value = runtime();
    value.resizeBuffers(800, 600, 1);
    await value.frame(0);
    const retained = retainedPath(value, { paused: true });
    const setSize = vi.fn();
    value.postProcessing = {
      state: { ...value.renderState.postProcessing, history: 'stable' },
      render: vi.fn(() => false),
      update: vi.fn(),
      setSize,
      invalidateHistory: vi.fn(),
      dispose: vi.fn(),
    };
    value.currentRenderer.setSize.mockClear();
    value.setActive(false);
    value.setActive(true);
    value.resizeBuffers(800, 600, 1);
    value.resizeBuffers(800, 600, 1);
    expect(value.currentRenderer.setSize).not.toHaveBeenCalled();
    expect(setSize).not.toHaveBeenCalled();
    expect(retained.reset).not.toHaveBeenCalled();
    expect(retained.getStats().samples).toBe(16);
    await value.frame(1000);
    expect(retained.present).toHaveBeenCalledOnce();
    expect(retained.renderSample).not.toHaveBeenCalled();
    value.dispose();
  });

  test.each(['size', 'dpi'] as const)(
    'a changed %s clears accumulation once and uses raster for a paused zero-sample trace',
    async (change) => {
      const value = runtime();
      value.resizeBuffers(800, 600, 1);
      const retained = retainedPath(value, { paused: true });
      const width = change === 'size' ? 1000 : 800;
      const ratio = change === 'dpi' ? 2 : 1;
      value.currentRenderer.setSize.mockClear();
      value.resizeBuffers(width, 600, ratio);
      value.resizeBuffers(width, 600, ratio);
      expect(value.currentRenderer.setSize).toHaveBeenCalledExactlyOnceWith(width, 600, false);
      expect(value.currentRenderer.getPixelRatio()).toBe(ratio);
      expect(retained.reset).toHaveBeenCalledOnce();
      requestFrame.mockClear();
      await value.frame(1000);
      expect(value.currentRenderer.render).toHaveBeenCalledExactlyOnceWith(
        value.scene,
        value.camera,
      );
      expect(retained.present).not.toHaveBeenCalled();
      expect(retained.renderSample).not.toHaveBeenCalled();
      expect(requestFrame).not.toHaveBeenCalled();
      expect(value.frameCount).toBe(1);
      value.dispose();
    },
  );

  test('a replacement renderer still allocates matching-size buffers instead of using its predecessor cache', async () => {
    const value = runtime();
    value.resizeBuffers(800, 600, 1);
    const next = fakeRenderer();
    createRenderer.mockResolvedValue(next);
    value.resize.mockImplementation(() => value.resizeBuffers(800, 600, 1));
    expect(await value.setRendererBackend('webgpu')).toBe(true);
    expect(next.setSize).toHaveBeenCalledExactlyOnceWith(800, 600, false);
    value.resizeBuffers(800, 600, 1);
    expect(next.setSize).toHaveBeenCalledOnce();
    value.dispose();
  });

  test('a resized unpaused tracer presents raster before awaiting the next expensive sample', async () => {
    const value = runtime();
    value.resizeBuffers(800, 600, 1);
    await value.frame(0);
    const path = retainedPath(value, { paused: false, complete: false });
    const sample = deferred<boolean>();
    path.renderSample.mockReturnValue(sample.promise);
    value.currentRenderer.render.mockClear();
    value.resizeBuffers(1000, 600, 1);
    requestFrame.mockClear();
    await value.frame(1000);
    expect(value.currentRenderer.render).toHaveBeenCalledExactlyOnceWith(value.scene, value.camera);
    expect(path.renderSample).not.toHaveBeenCalled();
    expect(path.present).not.toHaveBeenCalled();
    expect(requestFrame).toHaveBeenCalledOnce();
    const sampling = value.frame(1016);
    expect(path.renderSample).toHaveBeenCalledOnce();
    expect(value.frameInProgress).toBe(true);
    expect(value.currentRenderer.render).toHaveBeenCalledOnce();
    sample.resolve(false);
    await sampling;
    expect(value.frameInProgress).toBe(false);
    expect(requestFrame).toHaveBeenCalledOnce();
    value.dispose();
  });
  test('hidden formal updates defer path rebuilds and GPU frames until reactivation', async () => {
    const value = runtime();
    const renderer = value.renderer;
    const retained = retainedPath(value);
    value.setActive(false);
    value.markPathDirty();
    value.markPathDirty();
    await vi.advanceTimersByTimeAsync(1000);
    await value.frame(1000);
    expect(buildBuilding).not.toHaveBeenCalled();
    expect(renderer.render).not.toHaveBeenCalled();
    expect(retained.renderSample).not.toHaveBeenCalled();
    expect(retained.dispose).not.toHaveBeenCalled();
    expect(requestFrame).not.toHaveBeenCalled();
    await expect(value.capturePNG()).rejects.toThrow('render.notReady');
    const replacement = allocatedPath();
    buildBuilding.mockReturnValue({
      root: new THREE.Group(),
      resources: { ready: async () => {} },
      dispose: vi.fn(),
    });
    createPath.mockResolvedValue(replacement);
    value.setActive(true);
    await vi.advanceTimersByTimeAsync(200);
    expect(buildBuilding).toHaveBeenCalledExactlyOnceWith(value.previous);
    expect(value.renderer).toBe(renderer);
    expect(value.path).toBe(replacement);
    expect(retained.dispose).toHaveBeenCalledOnce();
    expect(requestFrame).toHaveBeenCalledOnce();
    value.dispose();
  });

  test('deactivating during clean-scene decoding releases stale allocations before creating a tracer', async () => {
    const value = runtime();
    const pending = deferred<void>();
    const dispose = vi.fn();
    buildBuilding.mockReturnValue({
      root: new THREE.Group(),
      resources: { ready: () => pending.promise },
      dispose,
    });
    const starting = value.setPathTracing(true);
    expect(buildBuilding).toHaveBeenCalledOnce();
    value.setActive(false);
    pending.resolve();
    await starting;
    expect(createPath).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
    expect(value.pathDirty).toBe(true);
    expect(value.path).toBeNull();
    expect(requestFrame).not.toHaveBeenCalled();
    value.dispose();
  });
  test.each(['stale', 'failed'] as const)(
    'a %s asynchronous path allocation releases every pending owner when its tracer cleanup fails',
    async (outcome) => {
      const value = runtime();
      const pending = deferred<void>();
      const primary = new Error('path initialization primary failure');
      const secondary = new Error('tracer cleanup secondary failure');
      const path = allocatedPath();
      path.start.mockImplementation(() => pending.promise);
      path.dispose.mockImplementation(() => {
        throw secondary;
      });
      const buildingDispose = vi.fn();
      buildBuilding.mockReturnValue({
        root: new THREE.Group(),
        resources: { ready: async () => {} },
        dispose: buildingDispose,
      });
      createPath.mockResolvedValue(path);
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const starting = value.setPathTracing(true);
        await vi.waitFor(() => expect(path.start).toHaveBeenCalledOnce());
        const scene = path.start.mock.calls[0][0];
        const releaseEnvironment = vi.spyOn(scene.environment!, 'dispose');
        if (outcome === 'stale') {
          await value.setPathTracing(false);
          pending.resolve();
        } else {
          pending.reject(primary);
        }
        await expect(starting).resolves.toBeUndefined();
        expect(path.dispose).toHaveBeenCalledOnce();
        expect(buildingDispose).toHaveBeenCalledOnce();
        expect(releaseEnvironment).toHaveBeenCalledOnce();
        expect(warning).toHaveBeenCalledOnce();
        expect(value.path).toBeNull();
        expect(value.pathBuilding).toBeNull();
        expect(value.pathDefaultEnvironment).toBeNull();
        if (outcome === 'failed') {
          expect(value.renderState).toMatchObject({
            mode: 'raster',
            pathStatus: 'error',
            error: 'render.pathFailed',
          });
          expect(value.options.status).toHaveBeenCalledWith('render.pathFailed', {
            reason: String(primary),
          });
        } else {
          expect(value.options.status).not.toHaveBeenCalledWith(
            'render.pathFailed',
            expect.anything(),
          );
        }
        value.dispose();
      } finally {
        warning.mockRestore();
      }
    },
  );

  test('a debounced path rebuild releases every predecessor and accepts the new owner after cleanup fails', async () => {
    const value = runtime();
    const previous = retainedPath(value);
    previous.dispose.mockImplementation(() => {
      throw new Error('previous tracer cleanup failure');
    });
    const previousBuildingDispose = vi.fn();
    value.pathBuilding = { dispose: previousBuildingDispose };
    const previousEnvironment = new THREE.Texture();
    const previousEnvironmentDispose = vi.spyOn(previousEnvironment, 'dispose');
    value.pathDefaultEnvironment = previousEnvironment;
    const accepted = allocatedPath({ samples: 0, minSamples: 0, maxSamples: 0, complete: false });
    const buildingDispose = vi.fn();
    buildBuilding.mockReturnValue({
      root: new THREE.Group(),
      resources: { ready: async () => {} },
      dispose: buildingDispose,
    });
    createPath.mockResolvedValue(accepted);
    value.markPathDirty();
    await vi.advanceTimersByTimeAsync(200);
    expect(previous.dispose).toHaveBeenCalledOnce();
    expect(previousBuildingDispose).toHaveBeenCalledOnce();
    expect(previousEnvironmentDispose).toHaveBeenCalledOnce();
    expect(value.path).toBe(accepted);
    expect(value.renderState).toMatchObject({
      mode: 'pathtrace',
      pathStatus: 'rendering',
      error: 'render.cleanupFailed',
    });
    expect(value.options.status).toHaveBeenCalledWith('render.cleanupFailed', {
      reason: 'AggregateError: runtime.cleanupFailed',
    });
    await value.setPathTracing(false);
    expect(accepted.dispose).toHaveBeenCalledOnce();
    expect(buildingDispose).toHaveBeenCalledOnce();
    value.dispose();
  });

  test('render owner disposal releases callbacks, panorama and renderer after post effects fail', async () => {
    const value = runtime();
    const gpu = fakeRenderer(true);
    const originalError = gpu.onError;
    const originalLost = gpu.onDeviceLost;
    createRenderer.mockResolvedValue(gpu);
    await value.setRendererBackend('webgpu');
    const environment = new THREE.Texture();
    const environmentDispose = vi.spyOn(environment, 'dispose');
    loadTexture.mockResolvedValue(environment);
    await apply(value, project(panorama('accepted')));
    const postDispose = vi.fn(() => {
      throw new Error('post effects cleanup failure');
    });
    value.postProcessing = {
      state: value.renderState.postProcessing,
      update: vi.fn(),
      setSize: vi.fn(),
      invalidateHistory: vi.fn(),
      render: vi.fn(() => false),
      dispose: postDispose,
    };
    releaseRenderer.mockClear();
    expect(() => value.dispose()).toThrow(AggregateError);
    expect(value.postProcessing).toBeNull();
    expect(value.rendererCallbacksCleanup).toBeNull();
    expect(environmentDispose).toHaveBeenCalledOnce();
    expect(releaseRenderer).toHaveBeenCalledExactlyOnceWith(gpu);
    expect(gpu.domElement.remove).toHaveBeenCalledOnce();
    expect(gpu.onError).toBe(originalError);
    expect(gpu.onDeviceLost).toBe(originalLost);
    expect(() => value.dispose()).not.toThrow();
    expect(postDispose).toHaveBeenCalledOnce();
  });

  test('asynchronous renderer teardown rejection is reported after public owner disposal', async () => {
    const value = runtime();
    const primary = new Error('renderer teardown failure');
    releaseRenderer.mockRejectedValue(primary);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      value.dispose();
      await Promise.resolve();
      expect(warning).toHaveBeenCalledExactlyOnceWith('Renderer resource cleanup failed.', primary);
      expect(value.renderer.domElement.remove).toHaveBeenCalledOnce();
    } finally {
      warning.mockRestore();
    }
  });

  test('sample target changes during backend initialization are applied to the accepted path session', async () => {
    const value = runtime();
    const pending = deferred<BorrowedPath>();
    const buildingDispose = vi.fn();
    buildBuilding.mockReturnValue({
      root: new THREE.Group(),
      resources: { ready: async () => {} },
      dispose: buildingDispose,
    });
    createPath.mockReturnValue(pending.promise);
    const starting = value.setPathTracing(true);
    await vi.waitFor(() => expect(createPath).toHaveBeenCalledOnce());
    expect(createPath).toHaveBeenCalledWith(value.renderer, { maxSamples: 128 });
    value.setPathSamples(32);
    const accepted = {
      start: vi.fn(async (_scene: THREE.Scene, _camera: THREE.Camera) => {}),
      setMaxSamples: vi.fn(),
      pause: vi.fn(),
      reset: vi.fn(),
      dispose: vi.fn(),
      updateCamera: vi.fn(),
      renderSample: vi.fn(async () => false),
      present: vi.fn(),
      getStats: vi.fn(() => ({
        backend: 'webgl' as const,
        samples: 0,
        minSamples: 0,
        maxSamples: 0,
        targetSamples: 32,
        paused: false,
        complete: false,
        ready: true,
      })),
    };
    pending.resolve(accepted);
    await starting;
    expect(accepted.setMaxSamples).toHaveBeenCalledExactlyOnceWith(32);
    expect(value.renderState).toMatchObject({ targetSamples: 32, pathStatus: 'rendering' });
    await value.setPathTracing(false);
    expect(accepted.dispose).toHaveBeenCalledOnce();
    expect(buildingDispose).toHaveBeenCalledOnce();
  });
  test('public dispose releases all accepted owners once and rejects late backend and panorama allocations', async () => {
    const value = runtime();
    const gpu = fakeRenderer(true);
    const originalError = gpu.onError;
    const originalLost = gpu.onDeviceLost;
    createRenderer.mockResolvedValueOnce(gpu);
    expect(await value.setRendererBackend('webgpu')).toBe(true);
    const acceptedEnvironment = new THREE.Texture();
    const releaseEnvironment = vi.spyOn(acceptedEnvironment, 'dispose');
    loadTexture.mockResolvedValueOnce(acceptedEnvironment);
    await apply(value, project(panorama('accepted')));
    const path = retainedPath(value, { backend: 'webgpu' });
    const releaseBuilding = vi.fn();
    value.pathBuilding = { dispose: releaseBuilding };
    value.pathScene = new THREE.Scene();
    const pathEnvironment = new THREE.Texture();
    const releasePathEnvironment = vi.spyOn(pathEnvironment, 'dispose');
    value.pathDefaultEnvironment = pathEnvironment;
    const releasePost = vi.fn();
    value.postProcessing = {
      state: value.renderState.postProcessing,
      update: vi.fn(),
      setSize: vi.fn(),
      invalidateHistory: vi.fn(),
      render: vi.fn(() => false),
      dispose: releasePost,
    };
    const pendingRenderer = deferred<FakeRenderer>();
    const pendingTexture = deferred<THREE.Texture>();
    createRenderer.mockReturnValueOnce(pendingRenderer.promise);
    loadTexture.mockReturnValueOnce(pendingTexture.promise);
    releaseRenderer.mockClear();
    const backendChange = value.setRendererBackend('webgl');
    const panoramaChange = apply(value, project(panorama('pending')));
    const before = value.renderState;
    const document = value.previous;
    const publications = value.options.renderState.mock.calls.length;
    const connections = value.controls.connect.mock.calls.length;
    const bindings = value.bindCanvas.mock.calls.length;

    value.dispose();
    value.dispose();

    expect(path.dispose).toHaveBeenCalledTimes(1);
    expect(releaseBuilding).toHaveBeenCalledTimes(1);
    expect(releasePathEnvironment).toHaveBeenCalledTimes(1);
    expect(releasePost).toHaveBeenCalledTimes(1);
    expect(releaseEnvironment).toHaveBeenCalledTimes(1);
    expect(releaseRenderer).toHaveBeenCalledExactlyOnceWith(gpu);
    expect(gpu.domElement.remove).toHaveBeenCalledTimes(1);
    expect(gpu.onError).toBe(originalError);
    expect(gpu.onDeviceLost).toBe(originalLost);
    expect(value.path).toBeNull();
    expect(value.pathBuilding).toBeNull();
    expect(value.pathDefaultEnvironment).toBeNull();
    expect(value.environmentTexture).toBeNull();
    expect(value.postProcessing).toBeNull();
    expect(value.rendererCallbacksCleanup).toBeNull();

    const lateRenderer = fakeRenderer();
    const lateTexture = new THREE.Texture();
    const releaseLateTexture = vi.spyOn(lateTexture, 'dispose');
    pendingRenderer.resolve(lateRenderer);
    pendingTexture.resolve(lateTexture);
    expect(await backendChange).toBe(false);
    await panoramaChange;

    expect(releaseRenderer.mock.calls.map(([renderer]) => renderer)).toEqual([gpu, lateRenderer]);
    expect(releaseLateTexture).toHaveBeenCalledTimes(1);
    expect(lateRenderer.domElement.replaceWith).not.toHaveBeenCalled();
    expect(value.controls.connect).toHaveBeenCalledTimes(connections);
    expect(value.bindCanvas).toHaveBeenCalledTimes(bindings);
    expect(value.options.renderState).toHaveBeenCalledTimes(publications);
    expect(value.renderState).toBe(before);
    expect(value.previous).toBe(document);
    expect(value.renderer).toBe(gpu);
  });

  test('public dispose during an awaited sample suppresses publication and RAF continuation', async () => {
    const value = runtime();
    const path = retainedPath(value, { complete: false });
    const pending = deferred<boolean>();
    path.renderSample.mockReturnValue(pending.promise);
    const running = value.frame(1000);
    expect(path.renderSample).toHaveBeenCalledTimes(1);
    expect(value.frameInProgress).toBe(true);
    const publications = value.options.renderState.mock.calls.length;
    value.dispose();
    value.dispose();
    pending.resolve(true);
    await running;
    expect(path.dispose).toHaveBeenCalledTimes(1);
    expect(releaseRenderer).toHaveBeenCalledExactlyOnceWith(value.renderer);
    expect(value.renderer.domElement.remove).toHaveBeenCalledTimes(1);
    expect(value.options.renderState).toHaveBeenCalledTimes(publications);
    expect(requestFrame).not.toHaveBeenCalled();
    expect(value.frameCount).toBe(0);
    expect(value.frameInProgress).toBe(false);
  });

  test('a sample rejection after public disposal cannot publish a path failure or restart raster rendering', async () => {
    const value = runtime();
    const path = retainedPath(value, { complete: false });
    const pending = deferred<boolean>();
    path.renderSample.mockReturnValue(pending.promise);
    const running = value.frame(1000);
    const before = value.renderState;
    const publications = value.options.renderState.mock.calls.length;
    value.dispose();
    pending.reject(new Error('GPU readback rejected after its session was disposed'));
    await running;
    expect(path.dispose).toHaveBeenCalledTimes(1);
    expect(value.options.status).not.toHaveBeenCalled();
    expect(value.options.renderState).toHaveBeenCalledTimes(publications);
    expect(value.renderState).toBe(before);
    expect(value.currentRenderer.render).not.toHaveBeenCalled();
    expect(requestFrame).not.toHaveBeenCalled();
    expect(value.frameCount).toBe(0);
    expect(value.frameInProgress).toBe(false);
  });

  test.each([
    {
      message: 'WGSL parsing: unresolved value nodeUniform16_sampler',
      api: 'WebGPU',
      type: 'GPUValidationError',
    },
    'WGSL parsing: unresolved value nodeUniform16_sampler',
  ] satisfies RendererErrorInfo[])(
    'current GPU error preserves its original report, releases owned path resources and keeps the formal scene',
    async (info) => {
      const value = runtime();
      const gpu = fakeRenderer(true);
      const originalError = gpu.onError as TestCallback;
      createRenderer.mockResolvedValue(gpu);
      expect(await value.setRendererBackend('webgpu')).toBe(true);
      const path = retainedPath(value, { backend: 'webgpu' });
      const buildingDispose = vi.fn();
      value.pathBuilding = { dispose: buildingDispose };
      value.pathScene = new THREE.Scene();
      const defaultEnvironment = new THREE.Texture();
      value.pathDefaultEnvironment = defaultEnvironment;
      const disposeDefault = vi.spyOn(defaultEnvironment, 'dispose');
      const borrowedEnvironment = new THREE.Texture();
      const disposeBorrowed = vi.spyOn(borrowedEnvironment, 'dispose');
      value.environmentTexture = borrowedEnvironment;
      value.scene.environment = borrowedEnvironment;
      const scene = value.scene;
      const camera = value.camera;
      const document = value.previous;
      requestFrame.mockClear();

      gpu.onError(info);

      expect(originalError).toHaveBeenCalledExactlyOnceWith(info);
      expect(originalError.mock.contexts[0]).toBe(gpu);
      expect(originalError.mock.invocationCallOrder[0]).toBeLessThan(
        path.dispose.mock.invocationCallOrder[0]!,
      );
      expect(path.dispose).toHaveBeenCalledTimes(1);
      expect(buildingDispose).toHaveBeenCalledTimes(1);
      expect(disposeDefault).toHaveBeenCalledTimes(1);
      expect(disposeBorrowed).not.toHaveBeenCalled();
      expect(value.path).toBeNull();
      expect(value.pathBuilding).toBeNull();
      expect(value.pathScene).toBeNull();
      expect(value.pathDefaultEnvironment).toBeNull();
      expect(value.renderState).toMatchObject({
        mode: 'raster',
        pathStatus: 'error',
        error: 'render.pathFailed',
      });
      const reason = typeof info === 'string' ? info : info.message;
      expect(value.options.status).toHaveBeenCalledExactlyOnceWith('render.pathFailed', { reason });
      expect(requestFrame).toHaveBeenCalledTimes(1);
      expect(value.renderer).toBe(gpu);
      expect(value.scene).toBe(scene);
      expect(value.camera).toBe(camera);
      expect(value.previous).toBe(document);
      expect(value.scene.environment).toBe(borrowedEnvironment);
    },
  );

  test('later invalid command-buffer errors are logged without replacing the first shader failure status', async () => {
    const value = runtime();
    const gpu = fakeRenderer(true);
    const originalError = gpu.onError as TestCallback;
    createRenderer.mockResolvedValue(gpu);
    expect(await value.setRendererBackend('webgpu')).toBe(true);
    const path = retainedPath(value, { backend: 'webgpu' });
    const first = {
      api: 'WebGPU',
      type: 'GPUValidationError',
      message: 'WGSL parsing: unresolved value nodeUniform16_sampler',
    };
    gpu.onError(first);
    const firstState = value.renderState;
    const publicationCount = value.options.renderState.mock.calls.length;
    const second = {
      api: 'WebGPU',
      type: 'GPUValidationError',
      message: 'Invalid CommandBuffer from computeGroup_2350 due to previous error',
    };
    gpu.onError(second);
    expect(originalError.mock.calls.map(([info]) => info)).toEqual([first, second]);
    expect(value.options.status).toHaveBeenCalledExactlyOnceWith('render.pathFailed', {
      reason: first.message,
    });
    expect(value.renderState).toBe(firstState);
    expect(value.options.renderState).toHaveBeenCalledTimes(publicationCount);
    expect(path.dispose).toHaveBeenCalledTimes(1);
  });

  test.each(['path', 'building', 'environment'] as const)(
    'a throwing %s disposer still releases the other owners, preserves the GPU reason and permits a fresh retry',
    async (failingOwner) => {
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const value = runtime();
        const gpu = fakeRenderer(true);
        createRenderer.mockResolvedValue(gpu);
        expect(await value.setRendererBackend('webgpu')).toBe(true);
        const path = retainedPath(value, { backend: 'webgpu' });
        const buildingDispose = vi.fn();
        value.pathBuilding = { dispose: buildingDispose };
        value.pathScene = new THREE.Scene();
        const defaultEnvironment = new THREE.Texture();
        value.pathDefaultEnvironment = defaultEnvironment;
        const disposeDefault = vi.spyOn(defaultEnvironment, 'dispose');
        const borrowedEnvironment = new THREE.Texture();
        const disposeBorrowed = vi.spyOn(borrowedEnvironment, 'dispose');
        value.environmentTexture = borrowedEnvironment;
        value.scene.environment = borrowedEnvironment;
        const pendingRebuild = vi.fn();
        value.pathTimer = setTimeout(pendingRebuild, 200);
        value.pathDirty = true;
        const document = value.previous;
        const scene = value.scene;
        const camera = value.camera;
        const failure = new Error(`${failingOwner} cleanup failed`);
        const disposers = {
          path: path.dispose,
          building: buildingDispose,
          environment: disposeDefault,
        };
        disposers[failingOwner].mockImplementationOnce(() => {
          // Owners must be detached before disposal can fail or dispatch another callback.
          expect(value.path).toBeNull();
          expect(value.pathBuilding).toBeNull();
          expect(value.pathScene).toBeNull();
          expect(value.pathDefaultEnvironment).toBeNull();
          expect(value.pathTimer).toBeNull();
          expect(value.pathDirty).toBe(false);
          expect(value.pathCameraKey).toBe('');
          throw failure;
        });
        const shaderError = {
          api: 'WebGPU',
          type: 'GPUValidationError',
          message: 'WGSL parsing: unresolved value nodeUniform16_sampler',
        };
        expect(() => gpu.onError(shaderError)).not.toThrow();
        expect(warning).toHaveBeenCalledExactlyOnceWith(
          'Path tracing resource cleanup failed.',
          failure,
        );
        expect(path.dispose).toHaveBeenCalledTimes(1);
        expect(buildingDispose).toHaveBeenCalledTimes(1);
        expect(disposeDefault).toHaveBeenCalledTimes(1);
        expect(disposeBorrowed).not.toHaveBeenCalled();
        expect(value.options.status.mock.calls).toEqual([
          ['render.cleanupFailed', { reason: String(failure) }],
          ['render.pathFailed', { reason: shaderError.message }],
        ]);
        expect(value.renderState).toMatchObject({
          mode: 'raster',
          pathStatus: 'error',
          error: 'render.pathFailed',
        });
        expect(value.path).toBeNull();
        expect(value.pathBuilding).toBeNull();
        expect(value.pathScene).toBeNull();
        expect(value.pathDefaultEnvironment).toBeNull();
        expect(value.scene).toBe(scene);
        expect(value.camera).toBe(camera);
        expect(value.previous).toBe(document);
        expect(value.scene.environment).toBe(borrowedEnvironment);
        await vi.advanceTimersByTimeAsync(250);
        expect(pendingRebuild).not.toHaveBeenCalled();

        // Retry runs the actual setPathTracing/rebuildPath methods with owned allocation fakes.
        value.environmentTexture = null;
        value.scene.environment = null;
        const freshBuilding = {
          root: new THREE.Group(),
          resources: { ready: vi.fn(async () => {}) },
          dispose: vi.fn(),
        };
        const retryPath = {
          start: vi.fn(async (_scene: THREE.Scene, _camera: THREE.Camera) => {}),
          setMaxSamples: vi.fn(),
          pause: vi.fn(),
          reset: vi.fn(),
          dispose: vi.fn(),
          updateCamera: vi.fn(),
          renderSample: vi.fn(async () => false),
          present: vi.fn(),
          getStats: vi.fn(() => ({
            backend: 'webgpu' as const,
            samples: 0,
            minSamples: 0,
            maxSamples: 0,
            targetSamples: 16,
            paused: false,
            complete: false,
            ready: true,
          })),
        };
        buildBuilding.mockReturnValue(freshBuilding);
        createPath.mockResolvedValue(retryPath);
        await value.setPathTracing(true);
        expect(buildBuilding).toHaveBeenCalledExactlyOnceWith(document);
        expect(createPath).toHaveBeenCalledWith(gpu, {
          maxSamples: value.renderState.targetSamples,
        });
        expect(value.path).toBe(retryPath);
        expect(value.pathBuilding).toBe(freshBuilding);
        expect(value.pathDefaultEnvironment).toBeInstanceOf(THREE.DataTexture);
        expect(retryPath.start).toHaveBeenCalledExactlyOnceWith(value.pathScene, camera);
        expect(value.renderState).toMatchObject({ mode: 'pathtrace', pathStatus: 'rendering' });
        expect(value.renderState.error).toBeUndefined();
        await value.frame(1000);
        expect(retryPath.renderSample).toHaveBeenCalledTimes(1);
        expect(path.dispose).toHaveBeenCalledTimes(1);
        expect(buildingDispose).toHaveBeenCalledTimes(1);
        expect(disposeDefault).toHaveBeenCalledTimes(1);
        expect(value.previous).toBe(document);
        const retryEnvironment = value.pathDefaultEnvironment!;
        const disposeRetryEnvironment = vi.spyOn(retryEnvironment, 'dispose');
        await value.setPathTracing(false);
        expect(retryPath.dispose).toHaveBeenCalledTimes(1);
        expect(freshBuilding.dispose).toHaveBeenCalledTimes(1);
        expect(disposeRetryEnvironment).toHaveBeenCalledTimes(1);
        expect(value.renderState).toMatchObject({ mode: 'raster', pathStatus: 'idle' });
        expect(warning).toHaveBeenCalledTimes(1);
      } finally {
        warning.mockRestore();
      }
    },
  );

  test('a rejected in-flight sample preserves the earlier GPU shader error and schedules only a raster redraw', async () => {
    const value = runtime();
    const gpu = fakeRenderer(true);
    const originalError = gpu.onError as TestCallback;
    createRenderer.mockResolvedValue(gpu);
    expect(await value.setRendererBackend('webgpu')).toBe(true);
    const path = retainedPath(value, { backend: 'webgpu', complete: false });
    const sample = deferred<boolean>();
    path.renderSample.mockReturnValue(sample.promise);
    const buildingDispose = vi.fn();
    value.pathBuilding = { dispose: buildingDispose };
    const defaultEnvironment = new THREE.Texture();
    value.pathDefaultEnvironment = defaultEnvironment;
    const disposeDefault = vi.spyOn(defaultEnvironment, 'dispose');
    value.options.renderState.mockClear();
    requestFrame.mockClear();

    const frame = value.frame(1000);
    expect(path.renderSample).toHaveBeenCalledTimes(1);
    expect(value.frameInProgress).toBe(true);
    const first = {
      api: 'WebGPU',
      type: 'GPUValidationError',
      message: 'WGSL parsing: unresolved value nodeUniform16_sampler',
    };
    gpu.onError(first);
    const firstState = value.renderState;
    sample.reject(new Error('readCounts failed after path tracing resources were disposed'));
    await frame;

    expect(originalError).toHaveBeenCalledExactlyOnceWith(first);
    expect(value.options.status).toHaveBeenCalledExactlyOnceWith('render.pathFailed', {
      reason: first.message,
    });
    expect(value.options.renderState).toHaveBeenCalledTimes(1);
    expect(value.renderState).toBe(firstState);
    expect(value.renderState).toMatchObject({
      mode: 'raster',
      pathStatus: 'error',
      error: 'render.pathFailed',
    });
    expect(path.dispose).toHaveBeenCalledTimes(1);
    expect(buildingDispose).toHaveBeenCalledTimes(1);
    expect(disposeDefault).toHaveBeenCalledTimes(1);
    expect(value.path).toBeNull();
    expect(value.pathBuilding).toBeNull();
    expect(value.pathDefaultEnvironment).toBeNull();
    expect(value.frameInProgress).toBe(false);
    expect(requestFrame).toHaveBeenCalledTimes(1);

    // The error requests one raster redraw; that frame must not resume sampling or RAF.
    await value.frame(1100);
    expect(gpu.render).toHaveBeenCalledExactlyOnceWith(value.scene, value.camera);
    expect(path.renderSample).toHaveBeenCalledTimes(1);
    expect(path.present).not.toHaveBeenCalled();
    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(value.options.status).toHaveBeenCalledTimes(1);
    expect(value.options.renderState).toHaveBeenCalledTimes(1);
    expect(path.dispose).toHaveBeenCalledTimes(1);
    expect(buildingDispose).toHaveBeenCalledTimes(1);
    expect(disposeDefault).toHaveBeenCalledTimes(1);
  });

  test('switching backend restores original handlers and ignores a previously captured GPU error callback', async () => {
    const value = runtime();
    const gpu = fakeRenderer(true);
    const originalError = gpu.onError as TestCallback;
    const originalLost = gpu.onDeviceLost;
    createRenderer.mockResolvedValueOnce(gpu).mockResolvedValueOnce(fakeRenderer());
    expect(await value.setRendererBackend('webgpu')).toBe(true);
    const callback = gpu.onError;
    expect(callback).not.toBe(originalError);
    expect(gpu.onDeviceLost).not.toBe(originalLost);
    expect(await value.setRendererBackend('webgl')).toBe(true);
    expect(gpu.onError).toBe(originalError);
    expect(gpu.onDeviceLost).toBe(originalLost);
    const path = retainedPath(value);
    const before = value.renderState;
    const publicationCount = value.options.renderState.mock.calls.length;
    value.options.status.mockClear();
    const stale = { api: 'WebGPU', type: 'GPUValidationError', message: 'old device validation' };
    callback(stale);
    expect(originalError).toHaveBeenCalledExactlyOnceWith(stale);
    expect(path.dispose).not.toHaveBeenCalled();
    expect(value.renderState).toBe(before);
    expect(value.options.renderState).toHaveBeenCalledTimes(publicationCount);
    expect(value.options.status).not.toHaveBeenCalled();
  });

  test('disposed runtime ignores late GPU error callbacks and callback cleanup restores both original handlers', async () => {
    const value = runtime();
    const gpu = fakeRenderer(true);
    const originalError = gpu.onError as TestCallback;
    const originalLost = gpu.onDeviceLost;
    createRenderer.mockResolvedValue(gpu);
    expect(await value.setRendererBackend('webgpu')).toBe(true);
    const callback = gpu.onError;
    const path = retainedPath(value, { backend: 'webgpu' });
    const before = value.renderState;
    const publicationCount = value.options.renderState.mock.calls.length;
    value.options.status.mockClear();
    value.disposed = true;
    expect(value.rendererCallbacksCleanup).toBeTypeOf('function');
    value.rendererCallbacksCleanup!();
    expect(gpu.onError).toBe(originalError);
    expect(gpu.onDeviceLost).toBe(originalLost);
    const stale = 'GPU validation event delivered after disposal';
    callback(stale);
    expect(originalError).toHaveBeenCalledExactlyOnceWith(stale);
    expect(value.renderState).toBe(before);
    expect(value.options.renderState).toHaveBeenCalledTimes(publicationCount);
    expect(value.options.status).not.toHaveBeenCalled();
    expect(path.dispose).not.toHaveBeenCalled();
  });

  test('a GPU error during ordinary raster editing remains a backend log and does not invent a path failure', async () => {
    const value = runtime();
    const gpu = fakeRenderer(true);
    const originalError = gpu.onError as TestCallback;
    createRenderer.mockResolvedValue(gpu);
    expect(await value.setRendererBackend('webgpu')).toBe(true);
    const before = value.renderState;
    const report = { api: 'WebGPU', type: 'GPUValidationError', message: 'raster diagnostic' };
    gpu.onError(report);
    expect(originalError).toHaveBeenCalledExactlyOnceWith(report);
    expect(value.renderState).toBe(before);
    expect(value.options.status).not.toHaveBeenCalled();
  });

  test('failure releasing an old renderer after commit still returns the actual successful backend', async () => {
    const value = runtime();
    const old = value.currentRenderer;
    const next = fakeRenderer(true);
    createRenderer.mockResolvedValue(next);
    releaseRenderer.mockRejectedValueOnce(new Error('old renderer teardown failed'));
    const scene = value.scene;
    const camera = value.camera;
    const document = value.previous;
    expect(await value.setRendererBackend('webgpu')).toBe(true);
    expect(value.renderer).toBe(next);
    expect(old.domElement.replaceWith).toHaveBeenCalledExactlyOnceWith(next.domElement);
    expect(value.renderState).toMatchObject({
      backend: 'webgpu',
      switching: false,
      error: 'render.cleanupFailed',
    });
    expect(value.scene).toBe(scene);
    expect(value.camera).toBe(camera);
    expect(value.previous).toBe(document);
    expect(releaseRenderer).toHaveBeenCalledExactlyOnceWith(old);
  });

  test('a late backend initialization is released once and cannot replace a newer request', async () => {
    const value = runtime();
    const first = deferred<FakeRenderer>();
    const second = deferred<FakeRenderer>();
    createRenderer.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const old = value.renderer;
    const requestGPU = value.setRendererBackend('webgpu');
    const requestGL = value.setRendererBackend('webgl');
    const latest = fakeRenderer();
    second.resolve(latest);
    expect(await requestGL).toBe(true);
    const stale = fakeRenderer(true);
    first.resolve(stale);
    expect(await requestGPU).toBe(false);
    expect(value.renderer).toBe(latest);
    expect(value.renderState).toMatchObject({
      backend: 'webgl',
      switching: false,
      error: undefined,
    });
    expect(old.domElement.replaceWith).toHaveBeenCalledExactlyOnceWith(latest.domElement);
    expect(releaseRenderer.mock.calls.map(([renderer]) => renderer)).toEqual([old, stale]);
    expect(stale.domElement.replaceWith).not.toHaveBeenCalled();
  });

  test('a renderer initialized after runtime disposal is released without changing the retained canvas or state', async () => {
    const value = runtime();
    const pending = deferred<FakeRenderer>();
    createRenderer.mockReturnValue(pending.promise);
    const old = value.renderer;
    const opening = value.setRendererBackend('webgpu');
    const publicationCount = value.options.renderState.mock.calls.length;
    value.disposed = true;
    const next = fakeRenderer(true);
    pending.resolve(next);
    expect(await opening).toBe(false);
    expect(releaseRenderer).toHaveBeenCalledExactlyOnceWith(next);
    expect(value.renderer).toBe(old);
    expect(old.domElement.replaceWith).not.toHaveBeenCalled();
    expect(value.options.renderState).toHaveBeenCalledTimes(publicationCount);
  });

  test('an older successful switch awaiting disposal cannot publish a stale success after a newer backend commits', async () => {
    const value = runtime();
    const releasingOld = deferred<void>();
    const gpu = fakeRenderer(true);
    const gl = fakeRenderer();
    createRenderer.mockResolvedValueOnce(gpu).mockResolvedValueOnce(gl);
    releaseRenderer.mockReturnValueOnce(releasingOld.promise);
    const openingGPU = value.setRendererBackend('webgpu');
    await vi.waitFor(() => expect(value.renderer).toBe(gpu));
    expect(await value.setRendererBackend('webgl')).toBe(true);
    releasingOld.resolve(undefined);
    expect(await openingGPU).toBe(false);
    expect(value.renderer).toBe(gl);
    expect(value.renderState).toMatchObject({ backend: 'webgl', switching: false });
  });

  test('device-loss callbacks only request fallback for the currently owned renderer', async () => {
    const value = runtime();
    const gpu = fakeRenderer(true);
    createRenderer.mockResolvedValueOnce(gpu);
    expect(await value.setRendererBackend('webgpu')).toBe(true);
    const callback = gpu.onDeviceLost;
    expect(callback).toBeTypeOf('function');
    const gl = fakeRenderer();
    createRenderer.mockResolvedValueOnce(gl);
    callback!();
    await vi.waitFor(() => expect(value.renderer).toBe(gl));
    expect(createRenderer.mock.calls.map(([backend]) => backend)).toEqual(['webgpu', 'webgl']);
    createRenderer.mockClear();
    value.options.status.mockClear();
    callback!();
    expect(createRenderer).not.toHaveBeenCalled();
    expect(value.options.status).not.toHaveBeenCalled();
    expect(value.renderer).toBe(gl);
  });

  test('a failed panorama replacement stops old path tracing, then clear releases the retained texture', async () => {
    const value = runtime();
    const oldTexture = new THREE.Texture();
    const dispose = vi.spyOn(oldTexture, 'dispose');
    loadTexture.mockResolvedValueOnce(oldTexture);
    await apply(value, project(panorama('valid')));
    const path = retainedPath(value);
    loadTexture.mockRejectedValueOnce(new Error('corrupted new panorama'));
    await apply(value, project(panorama('corrupted')));
    expect(path.dispose).toHaveBeenCalledTimes(1);
    expect(value.path).toBeNull();
    expect(value.renderState).toMatchObject({
      mode: 'raster',
      pathStatus: 'error',
      environmentLoading: false,
      error: 'render.environmentFailed',
    });
    expect(dispose).not.toHaveBeenCalled();
    expect(value.environmentKey).toBe(value.environmentTextureKey);
    await apply(value, project());
    expect(value.scene.environment).toBeNull();
    expect(value.environmentTexture).toBeNull();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(value.scene.children.every((light) => light.visible)).toBe(true);
    expect(loadTexture).toHaveBeenCalledTimes(2);
  });

  test('rapid panorama replacement disposes the stale decoded result without replacing the newer texture', async () => {
    const value = runtime();
    const first = deferred<THREE.Texture>();
    const second = deferred<THREE.Texture>();
    loadTexture.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const loadingFirst = apply(value, project(panorama('first')));
    const loadingSecond = apply(value, project(panorama('second')));
    const textureFirst = new THREE.Texture();
    const textureSecond = new THREE.Texture();
    const disposeFirst = vi.spyOn(textureFirst, 'dispose');
    const disposeSecond = vi.spyOn(textureSecond, 'dispose');
    second.resolve(textureSecond);
    await loadingSecond;
    first.resolve(textureFirst);
    await loadingFirst;
    expect(value.scene.environment).toBe(textureSecond);
    expect(value.environmentTexture).toBe(textureSecond);
    expect(value.environmentTextureKey).toContain('second:');
    expect(disposeFirst).toHaveBeenCalledTimes(1);
    expect(disposeSecond).not.toHaveBeenCalled();
    expect(value.renderState.environmentLoading).toBe(false);
  });

  test('parameter edits during decoding use the latest committed values without duplicating the load', async () => {
    const value = runtime();
    const pending = deferred<THREE.Texture>();
    loadTexture.mockReturnValue(pending.promise);
    const document = project(panorama('studio'));
    const loading = apply(value, document);
    const updated = structuredClone(document);
    updated.environment = {
      ...updated.environment!,
      intensity: 2.7,
      rotation: 123,
      background: true,
    };
    await apply(value, updated);
    const texture = new THREE.Texture();
    pending.resolve(texture);
    await loading;
    expect(loadTexture).toHaveBeenCalledTimes(1);
    expect(value.scene.environment).toBe(texture);
    expect(value.scene.background).toBe(texture);
    expect(value.scene.environmentIntensity).toBe(2.7);
    expect(value.scene.environmentRotation.y).toBeCloseTo(THREE.MathUtils.degToRad(123));
    expect(value.previous.environment).toEqual(updated.environment);
  });

  test('clearing while a panorama is pending rejects its late result and restores default lights', async () => {
    const value = runtime();
    const pending = deferred<THREE.Texture>();
    loadTexture.mockReturnValue(pending.promise);
    const loading = apply(value, project(panorama('pending')));
    await apply(value, project());
    const texture = new THREE.Texture();
    const dispose = vi.spyOn(texture, 'dispose');
    pending.resolve(texture);
    await loading;
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(value.scene.environment).toBeNull();
    expect(value.environmentTexture).toBeNull();
    expect(value.renderState.environmentLoading).toBe(false);
    expect(value.scene.children.every((light) => light.visible)).toBe(true);
  });

  test('PNG capture immediately rejects stale camera accumulation before presenting or encoding', async () => {
    const value = runtime();
    const path = retainedPath(value);
    value.camera.position.x += 1;
    await expect(value.capturePNG()).rejects.toThrow('render.notReady');
    expect(path.updateCamera).toHaveBeenCalledExactlyOnceWith(value.camera);
    expect(path.present).not.toHaveBeenCalled();
    expect(value.currentRenderer.domElement.toBlob).not.toHaveBeenCalled();
    expect(path.getStats().samples).toBe(0);
    await expect(value.capturePNG()).rejects.toThrow('render.notReady');
    expect(path.updateCamera).toHaveBeenCalledTimes(1);
  });

  test.each(['paused', 'complete'] as const)(
    '%s idle frames present retained accumulation without taking samples or sustaining RAF',
    async (mode) => {
      const value = runtime();
      const path = retainedPath(value, {
        paused: mode === 'paused',
        complete: mode === 'complete',
      });
      await value.frame(1000);
      expect(path.present).toHaveBeenCalledTimes(1);
      expect(path.renderSample).not.toHaveBeenCalled();
      expect(value.currentRenderer.render).not.toHaveBeenCalled();
      expect(requestFrame).not.toHaveBeenCalled();
      expect(value.frameInProgress).toBe(false);
      expect(value.frameCount).toBe(1);
      expect(value.renderState.pathStatus).toBe(mode);
    },
  );

  test('a camera projection change resets paused accumulation even before the interaction settling interval', async () => {
    const value = runtime();
    const path = retainedPath(value, { paused: true, complete: false });
    value.camera.fov = 30;
    value.camera.updateProjectionMatrix();
    value.lastInteraction = 1000;
    await value.frame(1000);
    expect(path.updateCamera).toHaveBeenCalledExactlyOnceWith(value.camera);
    expect(path.renderSample).not.toHaveBeenCalled();
    expect(value.currentRenderer.render).toHaveBeenCalledTimes(1);
    expect(requestFrame).not.toHaveBeenCalled();
    await value.frame(1151);
    expect(path.present).not.toHaveBeenCalled();
    expect(value.currentRenderer.render).toHaveBeenCalledTimes(2);
    expect(requestFrame).not.toHaveBeenCalled();
    await expect(value.capturePNG()).rejects.toThrow('render.notReady');
  });

  test('a stationary editing preview does not sustain temporal RAF; refinement resumes after it clears', async () => {
    const value = runtime();
    const render = vi.fn(() => true);
    const invalidateHistory = vi.fn();
    value.postProcessing = {
      state: { gtao: true, taa: true, available: true, history: 'accumulating' },
      update: vi.fn(),
      setSize: vi.fn(),
      invalidateHistory,
      render,
      dispose: vi.fn(),
    };
    value.preview.visible = true;
    await value.frame(1000);
    expect(render).toHaveBeenCalledTimes(1);
    expect(invalidateHistory).toHaveBeenCalledTimes(1);
    expect(requestFrame).not.toHaveBeenCalled();
    value.preview.visible = false;
    await value.frame(1100);
    expect(render).toHaveBeenCalledTimes(2);
    expect(requestFrame).toHaveBeenCalledTimes(1);
  });

  test('an asynchronously accepted panorama invalidates temporal history after the prior view has settled', async () => {
    const value = runtime();
    const invalidateHistory = vi.fn();
    value.postProcessing = {
      state: { ...value.renderState.postProcessing, history: 'stable' },
      render: vi.fn(() => false),
      update: vi.fn(),
      setSize: vi.fn(),
      invalidateHistory,
      dispose: vi.fn(),
    };
    const delayed = deferred<THREE.Texture>();
    loadTexture.mockReturnValueOnce(delayed.promise);
    const document = project(panorama('late-panorama'));
    value.previous = document;
    const accepting = value.applyEnvironment(document);
    expect(invalidateHistory).not.toHaveBeenCalled();
    const original = new THREE.Texture();
    delayed.resolve(original);
    await accepting;
    expect(value.scene.environment).toBe(original);
    expect(invalidateHistory).toHaveBeenCalledOnce();
    value.dispose();
  });

  test('old version-one documents keep absent environment fields and defaults do not mutate the project', () => {
    const document = project();
    delete document.environment;
    delete document.environmentResources;
    const before = structuredClone(document);
    expect(getEnvironmentSettings(document)).toEqual({
      intensity: 1,
      rotation: 0,
      background: false,
    });
    const first = defaultEnvironmentSettings();
    first.intensity = 9;
    expect(defaultEnvironmentSettings().intensity).toBe(1);
    expect(document).toEqual(before);
    expect('environment' in document).toBe(false);
    expect('environmentResources' in document).toBe(false);
  });
});
