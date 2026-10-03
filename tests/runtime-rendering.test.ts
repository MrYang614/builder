import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as THREE from 'three';
import type { EnvironmentResource, ProjectDocument } from '@building/editor-core';
import { defaultEnvironmentSettings, getEnvironmentSettings } from '@building/editor-core';
import { initialRenderState } from '../packages/three-runtime/src/renderer';
import type { RenderState, RendererBackend } from '../packages/three-runtime/src/renderer';
import type { PathTraceStats } from '../packages/three-runtime/src/pathtracing';
import { createDefaultEnvironmentTexture } from '../packages/three-runtime/src/environment';

interface BorrowedPath {
  start(scene: THREE.Scene, camera: THREE.Camera): Promise<void>;
  pause(paused: boolean): void;
  dispose(): void;
  updateCamera(camera: THREE.Camera): void;
  renderSample(): Promise<boolean>;
  present(): void;
  getStats(): PathTraceStats;
}
interface FakeCanvas {
  tabIndex: number;
  dataset: Record<string, string>;
  setAttribute: ReturnType<typeof vi.fn>;
  getAttribute: ReturnType<typeof vi.fn>;
  replaceWith: ReturnType<typeof vi.fn>;
  toBlob: ReturnType<typeof vi.fn>;
}
interface FakeRenderer {
  domElement: FakeCanvas;
  render: ReturnType<typeof vi.fn>;
  setPixelRatio: ReturnType<typeof vi.fn>;
  setClearColor: ReturnType<typeof vi.fn>;
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
    status: ReturnType<typeof vi.fn>;
    renderState: ReturnType<typeof vi.fn>;
    getDocument(): ProjectDocument;
  };
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  currentRenderer: FakeRenderer;
  renderer: FakeRenderer;
  theme: { background: string };
  controls: { disconnect: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn> };
  cancel: ReturnType<typeof vi.fn>;
  bindCanvas: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
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
  applyEnvironment(document: ProjectDocument): Promise<void>;
  capturePNG(): Promise<ArrayBuffer>;
  pathCameraSignature(): string;
  frame(time: number): Promise<void>;
  stopPathResources(): void;
  setPathTracing(enabled: boolean): Promise<void>;
  setRendererBackend(backend: RendererBackend): Promise<boolean>;
  bindRendererCallbacks(renderer: FakeRenderer): void;
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

/**
 * Runs unchanged methods and field initializers from the production TypeScript source.
 * Only the DOM/GPU-allocating constructor body is removed by an AST transform. Decoding,
 * renderer allocation and RAF are owned fakes; these tests make no browser or GPU claim.
 */
function compileRuntime(): new () => RuntimeHarness {
  const source = readFileSync('packages/three-runtime/src/runtime.ts', 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    transformers: {
      before: [
        (context) => {
          const visitor: ts.Visitor = (node) => {
            if (ts.isClassDeclaration(node) && node.name?.text === 'ThreeRuntime') {
              const members = node.members.map((member) =>
                ts.isConstructorDeclaration(member)
                  ? context.factory.updateConstructorDeclaration(
                      member,
                      member.modifiers,
                      member.parameters,
                      context.factory.createBlock([]),
                    )
                  : member,
              );
              return context.factory.updateClassDeclaration(
                node,
                node.modifiers,
                node.name,
                node.typeParameters,
                node.heritageClauses,
                members,
              );
            }
            return ts.visitEachChild(node, visitor, context);
          };
          return (file) => ts.visitNode(file, visitor) as ts.SourceFile;
        },
      ],
    },
  }).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(
    output,
    {
      exports,
      module: { exports },
      setTimeout,
      clearTimeout,
      requestAnimationFrame: requestFrame,
      cancelAnimationFrame: vi.fn(),
      console,
      crypto,
      devicePixelRatio: 1,
      require: (id: string) => {
        if (id === 'three') {
          return THREE;
        }
        if (id === '@building/editor-core') {
          return { ToolStateMachine: class {} };
        }
        if (id === './renderer') {
          return {
            initialRenderState,
            createSceneRenderer: createRenderer,
            disposeSceneRenderer: releaseRenderer,
          };
        }
        if (id === './environment') {
          return { loadEnvironmentTexture: loadTexture, createDefaultEnvironmentTexture };
        }
        if (id === './scene') {
          return { buildBuilding };
        }
        if (id === './pathtracing') {
          return { PathTraceSession: { create: createPath } };
        }
        return {};
      },
    },
    { filename: 'production-runtime.ts' },
  );
  return exports.ThreeRuntime as new () => RuntimeHarness;
}

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
  const Runtime = compileRuntime();
  const value = new Runtime();
  value.previous = project();
  value.options = {
    status: vi.fn(),
    renderState: vi.fn(),
    getDocument: () => value.previous,
  };
  value.preview = { visible: false };
  value.currentRenderer = fakeRenderer();
  value.theme = { background: 'semantic-viewport-test-color' };
  value.controls = { disconnect: vi.fn(), connect: vi.fn() };
  value.cancel = vi.fn();
  value.bindCanvas = vi.fn();
  value.resize = vi.fn();
  value.scene.add(new THREE.DirectionalLight(), new THREE.HemisphereLight());
  return value;
}
function fakeRenderer(nativeGPU = false): FakeRenderer {
  const renderer = {
    render: vi.fn(),
    setPixelRatio: vi.fn(),
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
    },
  } as FakeRenderer;
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
function retainedPath(value: RuntimeHarness, state: Partial<PathTraceStats> = {}) {
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
    pause: vi.fn(),
    dispose: vi.fn(),
    updateCamera: vi.fn((_camera: THREE.Camera) => {
      stats = { ...stats, samples: 0, minSamples: 0, maxSamples: 0, complete: false };
    }),
    renderSample: vi.fn(async () => false),
    present: vi.fn(),
    getStats: vi.fn(() => stats),
  };
  value.path = path;
  value.pathPaused = stats.paused;
  value.pathCameraKey = value.pathCameraSignature();
  value.renderState = { ...value.renderState, mode: 'pathtrace', samples: 16 };
  return path;
}

beforeEach(() => {
  vi.useFakeTimers();
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
});

describe('production runtime rendering methods with owned fakes (no GPU claim)', () => {
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
      const originalError = gpu.onError as ReturnType<typeof vi.fn>;
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
    const originalError = gpu.onError as ReturnType<typeof vi.fn>;
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
          pause: vi.fn(),
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
    const originalError = gpu.onError as ReturnType<typeof vi.fn>;
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
    const originalError = gpu.onError as ReturnType<typeof vi.fn>;
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
    const originalError = gpu.onError as ReturnType<typeof vi.fn>;
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
    const originalError = gpu.onError as ReturnType<typeof vi.fn>;
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
    expect(requestFrame).toHaveBeenCalledTimes(1);
    await value.frame(1151);
    expect(path.present).toHaveBeenCalledTimes(1);
    expect(requestFrame).toHaveBeenCalledTimes(1);
    await expect(value.capturePNG()).rejects.toThrow('render.notReady');
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
