import { beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DataTexture,
  DataUtils,
  FloatType,
  HalfFloatType,
  LinearFilter,
  NearestFilter,
  Object3D,
  RGBAFormat,
  WebGPUCoordinateSystem,
} from 'three';
import { WGSLNodeBuilder } from 'three/webgpu';
import type ComputeNode from 'three/src/nodes/gpgpu/ComputeNode.js';
import { createDefaultEnvironmentTexture } from '../packages/three-runtime/src/environment';

interface EnvironmentInfo {
  map: DataTexture;
  sampleColor: unknown;
  sampleDir: unknown;
  getDirPdf: unknown;
  updateFrom(texture: DataTexture): void;
  dispose(): void;
}
interface PublishedComputeKernel {
  kernel: ComputeNode;
}
interface BuiltShader {
  compute: ComputeNode | null;
  computeShader: string;
  build(): void;
  getBindings(): {
    bindings: {
      name: string;
      isSampler?: boolean;
      isSampledTexture?: boolean;
      texture?: DataTexture;
    }[];
  }[];
}
type TaggedShader = (parts: TemplateStringsArray, ...values: unknown[]) => () => unknown;

let EnvironmentInfo: new () => EnvironmentInfo;
let ComputeKernel: new (
  node: unknown,
  options: { workgroupSize: number[] },
) => PublishedComputeKernel;
let wgslTagFn: TaggedShader;

beforeAll(async () => {
  // These published JS subpaths have no .d.ts. The narrow interfaces describe only the used API.
  const environmentPath = 'three-gpu-pathtracer/src/webgpu/EquirectHdrInfoNode.js',
    computePath = 'three-gpu-pathtracer/src/webgpu/compute/ComputeKernel.js',
    bvhPath = 'three-mesh-bvh/webgpu';
  const modules = await Promise.all([
    import(environmentPath),
    import(computePath),
    import(bvhPath),
  ]);
  EnvironmentInfo = modules[0].EquirectHdrInfoNode;
  ComputeKernel = modules[1].ComputeKernel;
  wgslTagFn = modules[2].wgslTagFn;
});

function buildEnvironmentShader(source?: DataTexture) {
  const info = new EnvironmentInfo();
  if (source) {
    info.updateFrom(source);
  }
  const shader = wgslTagFn`
    fn samplerRegression() -> void {
      let direction = vec3f(0.0, 1.0, 0.0);
      let color = ${info.sampleColor}(direction);
      let sampled = ${info.sampleDir}(vec2f(0.3, 0.7));
      let pdf = ${info.getDirPdf}(direction);
    }
  `;
  const kernel = new ComputeKernel(shader(), { workgroupSize: [1, 1, 1] });
  // Actual WGSLNodeBuilder and published ComputeKernel run every setup/analyze/generate stage.
  // Only device feature queries and texture sample metadata are supplied; no shader/binding mock.
  const renderer = {
    coordinateSystem: WebGPUCoordinateSystem,
    debug: { diagnostics: { keywords: false } },
    contextNode: { isContextNode: true, getFlowContextData: () => ({}) },
    hasFeature: () => false,
    hasCompatibility: () => false,
    backend: { utils: { getTextureSampleData: () => ({ primarySamples: 1 }) } },
  };
  const builder = new WGSLNodeBuilder(
    new Object3D(),
    renderer as unknown as ConstructorParameters<typeof WGSLNodeBuilder>[1],
  ) as unknown as BuiltShader;
  builder.compute = kernel.kernel;
  builder.build();
  const code = builder.computeShader;
  const bindings = builder.getBindings().flatMap((group) => group.bindings);
  const sampleCalls = [
    ...code.matchAll(/textureSampleLevel\(\s*(\w+)\s*,\s*(\w+_sampler)\s*,/g),
  ].map((match) => ({ texture: match[1]!, sampler: match[2]! }));
  const declarations = new Set(
    [...code.matchAll(/var\s+(\w+_sampler)\s*:\s*sampler\s*;/g)].map((match) => match[1]!),
  );
  const isSampler = (binding: (typeof bindings)[number]) =>
    !!binding.isSampler && !binding.isSampledTexture;
  const samplerBindings = new Set(bindings.filter(isSampler).map((b) => b.name));
  const missingDeclarations = [...new Set(sampleCalls.map((call) => call.sampler))].filter(
    (name) => !declarations.has(name),
  );
  const missingBindings = [...new Set(sampleCalls.map((call) => call.sampler))].filter(
    (name) => !samplerBindings.has(name),
  );
  const mapBinding = bindings.find(
    (binding) => binding.isSampledTexture && binding.texture === info.map,
  );
  const result = {
    code,
    sampleCalls,
    missingDeclarations,
    missingBindings,
    mapUniform: mapBinding?.name,
    mapType: info.map.type,
    mapMinFilter: info.map.minFilter,
    mapMagFilter: info.map.magFilter,
    bindings: bindings.map((binding) => ({ name: binding.name, sampler: isSampler(binding) })),
  };
  info.dispose();
  return result;
}

function floatPanorama(linear: boolean) {
  const texture = new DataTexture(
    new Float32Array([2, 1, 0.5, 1, 1, 2, 0.5, 1]),
    2,
    1,
    RGBAFormat,
    FloatType,
  );
  if (linear) {
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
  }
  return texture;
}

function saveEvidence(name: string, result: ReturnType<typeof buildEnvironmentShader>) {
  const directory = resolve('.test-artifacts/webgpu-sampler');
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, `${name}.wgsl`), result.code);
  const { code: _code, ...metadata } = result;
  writeFileSync(resolve(directory, `${name}.json`), JSON.stringify(metadata, null, 2));
}

describe('published WebGPU environment WGSL sampler bindings without a GPU', () => {
  it('the actual runtime default factory compiles all environment samplers without float32-filterable', () => {
    const source = createDefaultEnvironmentTexture();
    expect(source.type).toBe(HalfFloatType);
    expect(source.minFilter).toBe(LinearFilter);
    expect(source.magFilter).toBe(LinearFilter);
    const result = buildEnvironmentShader(source);
    source.dispose();
    saveEvidence('runtime-default-factory', result);
    expect(result.mapType).toBe(HalfFloatType);
    expect(result.missingDeclarations).toEqual([]);
    expect(result.missingBindings).toEqual([]);
    expect(result.bindings.filter((binding) => binding.sampler)).toHaveLength(3);
  });

  it('reproduces the undefined map sampler from default Nearest/Nearest FloatType input', () => {
    const source = floatPanorama(false);
    expect(source.minFilter).toBe(NearestFilter);
    expect(source.magFilter).toBe(NearestFilter);
    const result = buildEnvironmentShader(source);
    source.dispose();
    saveEvidence('nearest-float-input', result);
    // The library converts data to half float but preserves filters, so conversion alone is insufficient.
    expect(result.mapType).toBe(HalfFloatType);
    expect(result.mapMinFilter).toBe(NearestFilter);
    expect(result.mapMagFilter).toBe(NearestFilter);
    expect(result.mapUniform).toBeDefined();
    expect(result.code).toMatch(/textureSampleLevel\([^\n]+,\s*uv,\s*0\s*\)\.rgb/);
    expect(result.missingDeclarations).toEqual([`${result.mapUniform}_sampler`]);
    expect(result.missingBindings).toEqual(result.missingDeclarations);
    expect(result.sampleCalls.length).toBeGreaterThanOrEqual(5);
  });

  it('emits every required sampler declaration and real binding after Linear filtering and half-float preprocessing', () => {
    const source = floatPanorama(true);
    const result = buildEnvironmentShader(source);
    source.dispose();
    saveEvidence('linear-float-input', result);
    expect(result.mapType).toBe(HalfFloatType);
    expect(result.mapMinFilter).toBe(LinearFilter);
    expect(result.mapMagFilter).toBe(LinearFilter);
    expect(result.missingDeclarations).toEqual([]);
    expect(result.missingBindings).toEqual([]);
    expect(result.bindings.filter((binding) => binding.sampler)).toHaveLength(3);
    expect(result.code).toContain('@compute @workgroup_size( 1, 1, 1 )');
  });

  it('half-float input alone still reproduces the omission when both filters stay Nearest', () => {
    const source = new DataTexture(
      new Uint16Array([1, 1, 1, 1].map((value) => DataUtils.toHalfFloat(value))),
      1,
      1,
      RGBAFormat,
      HalfFloatType,
    );
    const result = buildEnvironmentShader(source);
    source.dispose();
    saveEvidence('nearest-half-input', result);
    expect(result.mapType).toBe(HalfFloatType);
    expect(result.missingDeclarations).toEqual([`${result.mapUniform}_sampler`]);
    expect(result.missingBindings).toEqual(result.missingDeclarations);
  });

  it('the published node default uses Linear/HalfFloat and generates complete sampler bindings', () => {
    const result = buildEnvironmentShader();
    saveEvidence('published-default', result);
    expect(result.mapType).toBe(HalfFloatType);
    expect(result.mapMinFilter).toBe(LinearFilter);
    expect(result.mapMagFilter).toBe(LinearFilter);
    expect(result.missingDeclarations).toEqual([]);
    expect(result.missingBindings).toEqual([]);
    expect(result.bindings.filter((binding) => binding.sampler)).toHaveLength(3);
  });
});
