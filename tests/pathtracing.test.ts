import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  BufferGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Texture,
  WebGLRenderer,
  WebGLRenderTarget,
  HalfFloatType,
  UnsignedByteType,
} from 'three';
import type { Camera } from 'three';
import type { SceneRenderer } from '../packages/three-runtime/src/renderer';
import { PathTraceSession, type PathTraceStats } from '../packages/three-runtime/src/pathtracing';

const instances = vi.hoisted(() => ({ gl: [] as unknown[], gpu: [] as unknown[] }));
type Counts = { min: number; max: number; avg: number; samplesPerSecond: number };

function tracedMaterial() {
  const material = new ShaderMaterial();
  for (const key of [
    'bvh',
    'attributesArray',
    'materialIndexAttribute',
    'materials',
    'envMapInfo',
    'stratifiedTexture',
    'stratifiedOffsetTexture',
  ]) {
    material.uniforms[key] = { value: { dispose: vi.fn() } };
  }
  material.uniforms.lights = { value: { tex: { dispose: vi.fn() } } };
  vi.spyOn(material, 'dispose');
  return material;
}

function ownedGPUTexture() {
  const texture = new Texture();
  vi.spyOn(texture, 'dispose');
  return texture;
}
function ownedGPUQuad() {
  const material = new ShaderMaterial();
  vi.spyOn(material, 'dispose');
  return { material };
}
function ownedGPUAtlas(halfFloat = false) {
  // These targets have never been renderer-bound. Their real public dispose event does not
  // dispose the sampled texture; that exact ownership gap is exercised at the driver boundary.
  const target = new WebGLRenderTarget(1, 1, {
    type: halfFloat ? HalfFloatType : UnsignedByteType,
  });
  vi.spyOn(target, 'dispose');
  vi.spyOn(target.texture, 'dispose');
  return target;
}

class FakeWebGLTracer {
  samples = 0;
  pausePathTracing = false;
  renderDelay = 100;
  fadeDuration = 500;
  dynamicLowRes = false;
  minSamples = 5;
  synchronizeRenderSize = true;
  rasterizeScene = true;
  scene?: Scene;
  camera?: Camera;
  _pathTracer = { material: tracedMaterial(), _blendQuad: { material: { dispose: vi.fn() } } };
  _lowResPathTracer = {
    material: tracedMaterial(),
    _blendQuad: { material: { dispose: vi.fn() } },
    dispose: vi.fn(),
  };
  _generator = { geometry: new BufferGeometry() };
  _internalBackground = { dispose: vi.fn() };
  _colorBackground?: Texture;
  readonly atlas = Object.assign(new WebGLRenderTarget(), {
    fsQuad: { material: { dispose: vi.fn() } },
  });
  readonly primaryTarget = new WebGLRenderTarget();
  readonly _quad = { geometry: new BufferGeometry(), material: new ShaderMaterial() };
  dispose = vi.fn(() => {
    this._quad.geometry.dispose();
    this._quad.material.dispose();
    this.primaryTarget.dispose();
  });
  reset = vi.fn(() => {
    this.samples = 0;
  });
  updateCamera = vi.fn(() => this.reset());
  updateMaterials = vi.fn(() => this.reset());
  updateLights = vi.fn(() => this.reset());
  updateEnvironment = vi.fn(() => this.reset());
  setCamera = vi.fn((camera: Camera) => {
    this.camera = camera;
    this.reset();
  });
  renderSample = vi.fn(() => {
    if (!this.pausePathTracing) {
      this.samples++;
    }
  });
  setScene = vi.fn((scene: Scene, camera: Camera) => {
    this.scene = scene;
    this.camera = camera;
    this._pathTracer.material.uniforms.backgroundMap = { value: scene.background };
    if (scene.background && 'isColor' in scene.background) {
      this._colorBackground ??= new Texture();
      this._pathTracer.material.uniforms.backgroundMap.value = this._colorBackground;
    }
    const previous = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.atlas);
    this.renderer.setRenderTarget(previous);
    this.reset();
  });
  constructor(private readonly renderer: WebGLRenderer) {
    instances.gl.push(this);
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.primaryTarget);
    renderer.setRenderTarget(previous);
  }
}

class FakeWebGPUTracer {
  pause = false;
  maxSamples = 0;
  renderDelay = 500;
  fadeDuration = 500;
  dynamicLowRes = true;
  minSamples = 1;
  synchronizeRenderSize = true;
  counts: Counts = { min: 0, max: 0, avg: 0, samplesPerSecond: 0 };
  // The pinned public disposer owns its internal buffers/targets, but omits these LUT and
  // quad materials. Concrete Three resources expose real dispose events at this mock boundary.
  material?: { turquinTexture?: Texture } = { turquinTexture: ownedGPUTexture() };
  _blitQuad?: { material: ShaderMaterial } = ownedGPUQuad();
  _atlasDebugQuad?: { material: ShaderMaterial } = ownedGPUQuad();
  _sampleDensityQuad?: { material: ShaderMaterial } = ownedGPUQuad();
  _debugBoundsQuad?: { material: ShaderMaterial } = ownedGPUQuad();
  _bvhData?: { textureAtlas: WebGLRenderTarget } = { textureAtlas: ownedGPUAtlas() };
  _pathTracer?: { lightsInfo: { iesAtlas: WebGLRenderTarget } } = {
    lightsInfo: { iesAtlas: ownedGPUAtlas(true) },
  };
  random = { blueNoise: new Texture() };
  loadCounts = (): Promise<Counts> => Promise.resolve({ ...this.counts });
  constructor() {
    instances.gpu.push(this);
  }
  dispose = vi.fn(() => {
    this._bvhData?.textureAtlas.dispose();
    this._pathTracer?.lightsInfo.iesAtlas.dispose();
  });
  reset = vi.fn(() => {
    this.counts = { min: 0, max: 0, avg: 0, samplesPerSecond: 0 };
  });
  setScene = vi.fn((_scene: Scene, _camera: Camera) => this.reset());
  setCamera = vi.fn((_camera: Camera) => this.reset());
  updateCamera = vi.fn(() => this.reset());
  updateMaterials = vi.fn(() => this.reset());
  updateLights = vi.fn(() => this.reset());
  updateEnvironment = vi.fn(() => this.reset());
  getSampleCountsAsync = vi.fn(() => this.loadCounts());
  renderSample = vi.fn(() => {
    if (!this.pause) {
      const samples = Math.min(this.counts.avg + 1, this.maxSamples);
      this.counts = { min: samples, max: samples, avg: samples, samplesPerSecond: samples };
    }
  });
}

vi.mock('three-gpu-pathtracer', () => ({ WebGLPathTracer: FakeWebGLTracer }));
vi.mock('three-gpu-pathtracer/webgpu', () => ({ WebGPUPathTracer: FakeWebGPUTracer }));

function webGLRenderer(current: WebGLRenderTarget | null = null): WebGLRenderer {
  const renderer = Object.create(WebGLRenderer.prototype) as WebGLRenderer;
  renderer.getRenderTarget = () => current;
  renderer.setRenderTarget = (target) => {
    current = target as WebGLRenderTarget | null;
  };
  return renderer;
}
function webGPURenderer(native = true): SceneRenderer {
  return {
    isWebGPURenderer: true,
    backend: { isWebGPUBackend: native },
    init: vi.fn(async () => {}),
  } as unknown as SceneRenderer;
}
const latestGL = () => instances.gl.at(-1) as FakeWebGLTracer;
const latestGPU = () => instances.gpu.at(-1) as FakeWebGPUTracer;
const sessions: PathTraceSession[] = [];
async function start(
  renderer: SceneRenderer,
  maxSamples = 128,
  onStats?: (stats: PathTraceStats) => void,
) {
  const session = await PathTraceSession.create(renderer, { maxSamples, onStats });
  sessions.push(session);
  await session.start(new Scene(), new PerspectiveCamera());
  return session;
}

beforeEach(() => {
  instances.gl.length = 0;
  instances.gpu.length = 0;
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  sessions.splice(0).forEach((session) => session.dispose());
  vi.useRealTimers();
});

describe('PathTraceSession controller (mocked GPU drivers; no hardware claim)', () => {
  test('an event failure in the first public presentation quad still releases its material and remaining derived resources', async () => {
    const session = await start(webGLRenderer());
    const tracer = latestGL();
    const primary = new Error('presentation quad geometry cleanup failure');
    tracer._quad.geometry.addEventListener('dispose', () => {
      throw primary;
    });
    const materialDispose = vi.spyOn(tracer._quad.material, 'dispose');
    const geometryDispose = vi.spyOn(tracer._generator.geometry, 'dispose');
    expect(() => session.dispose()).toThrow(primary);
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(tracer._pathTracer.material.dispose).toHaveBeenCalledOnce();
    expect(tracer._lowResPathTracer.material.dispose).toHaveBeenCalledOnce();
    expect(() => session.dispose()).not.toThrow();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  test.each([false, true])(
    'WebGPU supplemental release attempts every allocation after a native LUT event fails (primary failure: %s)',
    async (primaryFailure) => {
      const session = await start(webGPURenderer());
      const tracer = latestGPU();
      const lut = tracer.material!.turquinTexture!;
      const remaining = [
        tracer._blitQuad!.material,
        tracer._atlasDebugQuad!.material,
        tracer._sampleDensityQuad!.material,
        tracer._debugBoundsQuad!.material,
        tracer._bvhData!.textureAtlas.texture,
        tracer._pathTracer!.lightsInfo.iesAtlas.texture,
      ];
      lut.addEventListener('dispose', () => {
        throw new Error('native LUT cleanup failure');
      });
      const primary = new Error('public tracer cleanup primary failure');
      if (primaryFailure) {
        tracer.dispose.mockImplementation(() => {
          throw primary;
        });
      }
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        expect(() => session.dispose()).toThrow(primaryFailure ? primary : AggregateError);
        expect(lut.dispose).toHaveBeenCalledOnce();
        remaining.forEach((resource) => expect(resource.dispose).toHaveBeenCalledOnce());
        expect(() => session.dispose()).not.toThrow();
        expect(warning).toHaveBeenCalledTimes(primaryFailure ? 1 : 0);
      } finally {
        warning.mockRestore();
      }
      tracer.random.blueNoise.dispose();
    },
  );

  test('WebGL cleanup preserves a public tracer failure while releasing all supplemental allocations after an atlas event fails', async () => {
    const session = await start(webGLRenderer());
    const tracer = latestGL();
    const primary = new Error('public tracer cleanup primary failure');
    tracer.dispose.mockImplementation(() => {
      tracer.primaryTarget.dispose();
      throw primary;
    });
    tracer.atlas.addEventListener('dispose', () => {
      throw new Error('native atlas cleanup failure');
    });
    const atlasDispose = vi.spyOn(tracer.atlas, 'dispose');
    const geometryDispose = vi.spyOn(tracer._generator.geometry, 'dispose');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(() => session.dispose()).toThrow(primary);
      expect(atlasDispose).toHaveBeenCalledOnce();
      expect(geometryDispose).toHaveBeenCalledOnce();
      expect(tracer._pathTracer.material.dispose).toHaveBeenCalledOnce();
      expect(tracer._lowResPathTracer.material.dispose).toHaveBeenCalledOnce();
      expect(tracer._pathTracer._blendQuad.material.dispose).toHaveBeenCalledOnce();
      expect(tracer._lowResPathTracer._blendQuad.material.dispose).toHaveBeenCalledOnce();
      expect(tracer._internalBackground.dispose).toHaveBeenCalledOnce();
      expect(warning).toHaveBeenCalledOnce();
      expect(() => session.dispose()).not.toThrow();
    } finally {
      warning.mockRestore();
    }
  });

  test('legacy WebGL samples stop at the measured target and present/pause do not accumulate', async () => {
    const session = await start(webGLRenderer(), 2),
      tracer = latestGL();
    expect(await session.renderSample()).toBe(true);
    expect(await session.renderSample()).toBe(false);
    expect(session.getStats()).toMatchObject({
      backend: 'webgl',
      samples: 2,
      minSamples: 2,
      complete: true,
    });
    expect(await session.renderSample()).toBe(false);
    expect(tracer.samples).toBe(2);
    session.present();
    expect(tracer.samples).toBe(2);
    session.setMaxSamples(3);
    session.pause();
    expect(await session.renderSample()).toBe(false);
    session.present();
    expect(tracer.pausePathTracing).toBe(true);
    session.pause(false);
    expect(await session.renderSample()).toBe(false);
    expect(session.getStats().samples).toBe(3);
  });

  test('WebGPU rejects the WebGL fallback instead of claiming native compute', async () => {
    await expect(PathTraceSession.create(webGPURenderer(false))).rejects.toThrow(
      'render.webgpuUnsupported',
    );
    expect(instances.gpu).toHaveLength(0);
  });

  test('WebGPU accumulation and asynchronous GPU counts have a 4 Hz measurement ceiling', async () => {
    const session = await start(webGPURenderer(), 2),
      tracer = latestGPU();
    expect(tracer.minSamples).toBe(0);
    expect(tracer.dynamicLowRes).toBe(false);
    expect(await session.renderSample()).toBe(true);
    for (let frame = 0; frame < 10; frame++) {
      expect(await session.renderSample()).toBe(true);
    }
    expect(tracer.getSampleCountsAsync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(250);
    expect(await session.renderSample()).toBe(false);
    expect(session.getStats()).toMatchObject({ samples: 2, complete: true });
    const before = { ...tracer.counts };
    session.present();
    expect(tracer.counts).toEqual(before);
    expect(tracer.pause).toBe(false);
    expect(tracer.getSampleCountsAsync).toHaveBeenCalledTimes(2);
  });

  test('a pending count read after camera reset or disposal cannot restore stale convergence', async () => {
    const session = await start(webGPURenderer()),
      tracer = latestGPU();
    let resolve!: (counts: Counts) => void;
    tracer.loadCounts = () =>
      new Promise((done) => {
        resolve = done;
      });
    const frame = session.renderSample();
    expect(session.renderSample()).toBe(frame);
    session.updateCamera(new PerspectiveCamera());
    resolve({ min: 200, max: 200, avg: 200, samplesPerSecond: 1000 });
    expect(await frame).toBe(true);
    expect(session.getStats()).toMatchObject({ samples: 0, complete: false });
    await vi.advanceTimersByTimeAsync(250);
    const disposedFrame = session.renderSample();
    session.dispose();
    resolve({ min: 200, max: 200, avg: 200, samplesPerSecond: 1000 });
    expect(await disposedFrame).toBe(false);
    expect(session.getStats()).toMatchObject({ ready: false, samples: 0 });
    expect(tracer.dispose).toHaveBeenCalledTimes(1);
  });

  test('late scene start completion cannot reactivate a disposed session', async () => {
    const session = await PathTraceSession.create(webGPURenderer());
    const opening = session.start(new Scene(), new PerspectiveCamera());
    session.dispose();
    await opening;
    expect(session.getStats().ready).toBe(false);
    expect(await session.renderSample()).toBe(false);
    await expect(session.start(new Scene(), new PerspectiveCamera())).rejects.toThrow(
      'render.pathtraceDisposed',
    );
  });

  test('stats callbacks coalesce to 4 Hz including completed frames and stop after disposal', async () => {
    const publications: { time: number; stats: PathTraceStats }[] = [];
    const session = await start(webGLRenderer(), 1, (stats) =>
      publications.push({ time: performance.now(), stats }),
    );
    expect(publications).toHaveLength(1);
    expect(await session.renderSample()).toBe(false);
    session.pause();
    expect(publications).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(250);
    expect(publications).toHaveLength(2);
    expect(publications[1]!.stats).toMatchObject({ paused: true, complete: true, samples: 1 });
    expect(publications[1]!.time - publications[0]!.time).toBeGreaterThanOrEqual(250);
    session.reset();
    session.dispose();
    await vi.advanceTimersByTimeAsync(1000);
    expect(publications).toHaveLength(2);
  });

  test('material, environment, lights, camera and size updates invalidate only accumulated samples', async () => {
    const renderer = webGLRenderer(),
      session = await start(renderer),
      tracer = latestGL();
    for (const operation of [
      () => session.updateMaterials(),
      () => session.updateLights(),
      () => session.updateEnvironment(),
      () => session.updateCamera(),
      () => session.resize(),
    ]) {
      await session.renderSample();
      expect(session.getStats().samples).toBe(1);
      operation();
      expect(session.getStats()).toMatchObject({ ready: true, samples: 0, complete: false });
    }
    expect(instances.gl).toHaveLength(1);
    expect(tracer.setScene).toHaveBeenCalledTimes(1);
    for (const target of [0, -1, NaN, Infinity, 1.5]) {
      expect(() => session.setMaxSamples(target)).toThrow('render.invalidSamples');
    }
  });

  test('supplemental legacy cleanup releases derived targets and shaders once, preserves borrowed scene/resources and restores renderer methods', async () => {
    const externalTarget = new WebGLRenderTarget(),
      renderer = webGLRenderer(externalTarget);
    const originalBinding = renderer.setRenderTarget;
    const session = await PathTraceSession.create(renderer);
    sessions.push(session);
    const scene = new Scene(),
      environment = new Texture(),
      material = new MeshStandardMaterial();
    scene.background = environment;
    scene.environment = environment;
    const object = new Mesh(new BufferGeometry(), material);
    scene.add(object);
    const environmentDispose = vi.spyOn(environment, 'dispose'),
      materialDispose = vi.spyOn(material, 'dispose');
    const externalDispose = vi.spyOn(externalTarget, 'dispose');
    await session.start(scene, new PerspectiveCamera());
    const tracer = latestGL(),
      atlasDispose = vi.spyOn(tracer.atlas, 'dispose'),
      geometryDispose = vi.spyOn(tracer._generator.geometry, 'dispose');
    expect(renderer.setRenderTarget).toBe(originalBinding);
    expect(renderer.getRenderTarget()).toBe(externalTarget);
    await session.renderSample();
    session.dispose();
    session.dispose();
    expect(tracer.dispose).toHaveBeenCalledTimes(1);
    expect(tracer._lowResPathTracer.dispose).toHaveBeenCalledTimes(1);
    expect(atlasDispose).toHaveBeenCalledTimes(1);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(tracer.atlas.fsQuad.material.dispose).toHaveBeenCalledTimes(1);
    expect(tracer._pathTracer.material.dispose).toHaveBeenCalledTimes(1);
    expect(tracer._lowResPathTracer.material.dispose).toHaveBeenCalledTimes(1);
    expect(environmentDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    expect(externalDispose).not.toHaveBeenCalled();
    expect(scene.children).toEqual([object]);
    expect(scene.environment).toBe(environment);
    expect(renderer.setRenderTarget).toBe(originalBinding);
  });

  test('a solid scene background releases its owned gradient map exactly once on every session', async () => {
    const renderer = webGLRenderer();
    const { Color } = await import('three');
    const scene = new Scene();
    scene.background = new Color(0.12, 0.12, 0.12);
    const borrowedEnvironment = new Texture();
    scene.environment = borrowedEnvironment;
    const borrowedDispose = vi.spyOn(borrowedEnvironment, 'dispose');
    for (let cycle = 0; cycle < 3; cycle++) {
      const session = await PathTraceSession.create(renderer);
      sessions.push(session);
      await session.start(scene, new PerspectiveCamera());
      const gradient = latestGL()._colorBackground;
      expect(gradient).toBeInstanceOf(Texture);
      const dispose = vi.spyOn(gradient!, 'dispose');
      await session.renderSample();
      session.dispose();
      session.dispose();
      expect(dispose).toHaveBeenCalledTimes(1);
    }
    expect(borrowedDispose).not.toHaveBeenCalled();
    expect(scene.environment).toBe(borrowedEnvironment);
  });

  test('WebGPU supplemental ownership releases LUT, empty atlas textures and quad materials once over three sessions without touching borrowed scene or shared noise', async () => {
    const geometry = new BufferGeometry(),
      material = new MeshStandardMaterial(),
      image = new Texture(),
      environment = new Texture(),
      background = new Texture(),
      blueNoise = new Texture();
    material.map = image;
    const object = new Mesh(geometry, material),
      scene = new Scene(),
      camera = new PerspectiveCamera();
    scene.add(object);
    scene.environment = environment;
    scene.background = background;
    const borrowed = [geometry, material, image, environment, background, blueNoise];
    const borrowedDisposals = borrowed.map((resource) => vi.spyOn(resource, 'dispose'));
    const resources = new Set<Texture | ShaderMaterial>();
    for (let cycle = 0; cycle < 3; cycle++) {
      const session = await PathTraceSession.create(webGPURenderer());
      sessions.push(session);
      const tracer = latestGPU();
      tracer.random.blueNoise = blueNoise;
      const owned = [
        tracer.material!.turquinTexture!,
        tracer._blitQuad!.material,
        tracer._atlasDebugQuad!.material,
        tracer._sampleDensityQuad!.material,
        tracer._debugBoundsQuad!.material,
        tracer._bvhData!.textureAtlas.texture,
        tracer._pathTracer!.lightsInfo.iesAtlas.texture,
      ];
      for (const resource of owned) {
        expect(resources.has(resource)).toBe(false);
        resources.add(resource);
      }
      await session.start(scene, camera);
      await session.renderSample();
      session.dispose();
      session.dispose();
      expect(tracer.dispose).toHaveBeenCalledTimes(1);
      expect(tracer._bvhData!.textureAtlas.dispose).toHaveBeenCalledTimes(1);
      expect(tracer._pathTracer!.lightsInfo.iesAtlas.dispose).toHaveBeenCalledTimes(1);
      owned.forEach((resource) => expect(resource.dispose).toHaveBeenCalledTimes(1));
      expect(session.getStats().ready).toBe(false);
      expect(await session.renderSample()).toBe(false);
      borrowedDisposals.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
      expect(scene.children).toEqual([object]);
      expect(object.geometry).toBe(geometry);
      expect(object.material).toBe(material);
      expect(material.map).toBe(image);
      expect(scene.environment).toBe(environment);
      expect(scene.background).toBe(background);
      expect(tracer.random.blueNoise).toBe(blueNoise);
    }
    expect(resources.size).toBe(21);
    borrowed.forEach((resource) => resource.dispose());
  });

  test('WebGPU fields sharing owned quad materials and atlas textures release each once alongside the LUT', async () => {
    const session = await start(webGPURenderer()),
      tracer = latestGPU(),
      shared = tracer._blitQuad!.material,
      lut = tracer.material!.turquinTexture!,
      sharedAtlasTexture = tracer._bvhData!.textureAtlas.texture;
    // The mock fixture owner releases superseded resources before installing shared fields.
    tracer._atlasDebugQuad!.material.dispose();
    tracer._sampleDensityQuad!.material.dispose();
    tracer._debugBoundsQuad!.material.dispose();
    tracer._atlasDebugQuad = { material: shared };
    tracer._sampleDensityQuad = { material: shared };
    tracer._debugBoundsQuad = { material: shared };
    tracer._pathTracer!.lightsInfo.iesAtlas.texture.dispose();
    tracer._pathTracer!.lightsInfo.iesAtlas.texture = sharedAtlasTexture;
    session.dispose();
    session.dispose();
    expect(tracer.dispose).toHaveBeenCalledTimes(1);
    expect(shared.dispose).toHaveBeenCalledTimes(1);
    expect(lut.dispose).toHaveBeenCalledTimes(1);
    expect(sharedAtlasTexture.dispose).toHaveBeenCalledTimes(1);
  });

  test('WebGPU public disposal failure still releases captured owned resources and cannot repeat cleanup', async () => {
    const session = await start(webGPURenderer()),
      tracer = latestGPU();
    const owned = [
      tracer.material!.turquinTexture!,
      tracer._blitQuad!.material,
      tracer._atlasDebugQuad!.material,
      tracer._sampleDensityQuad!.material,
      tracer._debugBoundsQuad!.material,
      tracer._bvhData!.textureAtlas.texture,
      tracer._pathTracer!.lightsInfo.iesAtlas.texture,
    ];
    const borrowedNoiseDispose = vi.spyOn(tracer.random.blueNoise, 'dispose');
    const failure = new Error('Published public disposer failed after releasing internal targets');
    tracer.dispose.mockImplementationOnce(() => {
      // Real public disposal may clear fields before failing. Ownership must have been
      // captured beforehand, and the thrown failure must remain visible to the caller.
      tracer.material = undefined;
      tracer._blitQuad = undefined;
      tracer._atlasDebugQuad = undefined;
      tracer._sampleDensityQuad = undefined;
      tracer._debugBoundsQuad = undefined;
      tracer._bvhData = undefined;
      tracer._pathTracer = undefined;
      throw failure;
    });
    expect(() => session.dispose()).toThrow(failure);
    owned.forEach((resource) => expect(resource.dispose).toHaveBeenCalledTimes(1));
    expect(session.getStats().ready).toBe(false);
    expect(await session.renderSample()).toBe(false);
    expect(() => session.dispose()).not.toThrow();
    expect(tracer.dispose).toHaveBeenCalledTimes(1);
    owned.forEach((resource) => expect(resource.dispose).toHaveBeenCalledTimes(1));
    expect(borrowedNoiseDispose).not.toHaveBeenCalled();
    tracer.random.blueNoise.dispose();
  });
});
