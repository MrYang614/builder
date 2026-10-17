import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { Mesh, Raycaster, Vector3, type Intersection } from 'three';
import {
  createEmptyProject,
  createOpening,
  createWall,
  validateDocument,
} from '@building/editor-core';
import { buildObject } from '@building/three-runtime/scene';
import { acquireMeshBvh, bvhDiagnostics } from '@building/three-runtime/bvh';

interface Probe {
  name: string;
  raycaster: Raycaster;
}

const warmupIterations = 10;
const measuredIterations = 100;
const openingCount = 96;
const doc = createEmptyProject('CPU BVH picking benchmark');
doc.id = 'bvh_benchmark';
doc.levels[0]!.height = 5.2;
const wall = createWall('level_1', { x: 0, z: 0 }, { x: openingCount * 1.6 + 0.5, z: 0 });
wall.id = 'bvh_benchmark_wall';
wall.height = 5;
doc.walls.push(wall);
for (let index = 0; index < openingCount; index++) {
  const opening = createOpening(wall, 'window', 0.4 + index * 1.6);
  opening.id = `benchmark_window_${index}`;
  opening.width = 0.9;
  opening.height = 0.9;
  opening.sill = 0.6 + (index % 5) * 0.6;
  doc.openings.push(opening);
}
const validation = validateDocument(doc);
assert.ok(validation.ok, JSON.stringify(validation));
const sceneBuildStart = performance.now();
const built = buildObject(doc, wall.id);
const sceneBuildMs = performance.now() - sceneBuildStart;
const mesh = built.root.getObjectByName(`Surface_${wall.id}`) as Mesh;
assert.ok(mesh instanceof Mesh);
mesh.updateWorldMatrix(true, true);
const initialIndex = mesh.geometry.index!.array.slice();
const initialGroups = structuredClone(mesh.geometry.groups);
const nativeRaycast = mesh.raycast;
const probes: Probe[] = [];
const probe = (name: string, origin: number[], direction: number[]) => {
  const raycaster = new Raycaster(new Vector3(...origin), new Vector3(...direction).normalize());
  // Native Mesh.raycast ignores this flag and returns all hits; the editor then selects
  // the nearest. The opt-in BVH implementation has an actual closest-hit traversal.
  raycaster.firstHitOnly = true;
  probes.push({ name, raycaster });
};
for (let index = 0; index < openingCount; index += 4) {
  const opening = doc.openings[index]!;
  probe(`hole_${index}`, [opening.offset + 0.37, opening.sill + 0.31, 2], [0, 0, -1]);
  probe(`A_${index}`, [opening.offset + 1.14, opening.sill + 0.31, 2], [0, 0, -1]);
  probe(`B_${index}`, [opening.offset + 1.14, opening.sill + 0.31, -2], [0, 0, 1]);
  probe(`reveal_${index}`, [opening.offset + 0.41, opening.sill + 0.31, 0], [1, 0, 0]);
}

function nearest(raycaster: Raycaster): Intersection | undefined {
  return raycaster.intersectObject(mesh, false)[0];
}
function compare(actual: Intersection | undefined, expected: Intersection | undefined) {
  assert.equal(!!actual, !!expected);
  if (!actual || !expected) {
    return;
  }
  assert.equal(actual.faceIndex, expected.faceIndex);
  assert.equal(actual.face?.materialIndex, expected.face?.materialIndex);
  assert.equal(actual.face?.a, expected.face?.a);
  assert.equal(actual.face?.b, expected.face?.b);
  assert.equal(actual.face?.c, expected.face?.c);
  assert.ok(Math.abs(actual.distance - expected.distance) < 1e-7);
  assert.ok(actual.point.distanceTo(expected.point) < 1e-7);
  assert.ok(actual.uv!.distanceTo(expected.uv!) < 1e-7);
  assert.ok(actual.normal!.distanceTo(expected.normal!) < 1e-7);
}
function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((sum, value) => sum + value, 0);
  return {
    iterations: sorted.length,
    totalMs: sum,
    meanMs: sum / sorted.length,
    p50Ms: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    minMs: sorted[0],
    maxMs: sorted.at(-1),
  };
}

const ownershipBefore = bvhDiagnostics();
const expected = probes.map(({ raycaster }) => nearest(raycaster));
const constructionStart = performance.now();
const lease = acquireMeshBvh(mesh);
const bvhBuildMs = performance.now() - constructionStart;
const acceleratedRaycast = mesh.raycast;
const constructed = bvhDiagnostics();
const nativeSamples: number[] = [];
const bvhSamples: number[] = [];
const cpuMicroseconds = {
  native: { user: 0, system: 0 },
  bvh: { user: 0, system: 0 },
};
let checksum = 0;
let equivalent = 0;
const batch = () => {
  for (const { raycaster } of probes) {
    checksum += nearest(raycaster)?.distance ?? 0;
  }
};
try {
  assert.deepEqual(mesh.geometry.index!.array, initialIndex);
  assert.deepEqual(mesh.geometry.groups, initialGroups);
  for (let index = 0; index < probes.length; index++) {
    compare(nearest(probes[index]!.raycaster), expected[index]);
    equivalent++;
  }
  // Warm both actual implementations, then alternate measured order to reduce drift.
  for (let iteration = 0; iteration < warmupIterations; iteration++) {
    mesh.raycast = nativeRaycast;
    batch();
    mesh.raycast = acceleratedRaycast;
    batch();
  }
  for (let iteration = 0; iteration < measuredIterations; iteration++) {
    const modes = iteration % 2 ? ['bvh', 'native'] : ['native', 'bvh'];
    for (const mode of modes) {
      mesh.raycast = mode === 'native' ? nativeRaycast : acceleratedRaycast;
      const cpuStart = process.cpuUsage();
      const start = performance.now();
      batch();
      const elapsed = performance.now() - start;
      const cpuElapsed = process.cpuUsage(cpuStart);
      const cpu = cpuMicroseconds[mode as 'native' | 'bvh'];
      cpu.user += cpuElapsed.user;
      cpu.system += cpuElapsed.system;
      (mode === 'native' ? nativeSamples : bvhSamples).push(elapsed);
    }
  }
} finally {
  mesh.raycast = acceleratedRaycast;
  lease.release();
  built.dispose();
}
const ownershipAfter = bvhDiagnostics();
assert.equal(ownershipAfter.geometries, ownershipBefore.geometries);
assert.equal(ownershipAfter.meshes, ownershipBefore.meshes);
assert.equal(ownershipAfter.references, ownershipBefore.references);
assert.equal(ownershipAfter.constructed - ownershipBefore.constructed, 1);
assert.equal(ownershipAfter.disposed - ownershipBefore.disposed, 1);
const native = stats(nativeSamples);
const bvh = stats(bvhSamples);
const report = {
  measuredAt: new Date().toISOString(),
  command: 'npm run bench:bvh',
  scope:
    'Node CPU-only actual editable wall geometry and Three Raycaster; no DOM, Canvas, GPU FPS, native Tauri or input-latency claim',
  environment: {
    node: process.version,
    os: platform(),
    release: release(),
    arch: arch(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
  },
  libraries: { three: '0.186.1', threeMeshBvh: '0.9.15' },
  fixture: {
    walls: 1,
    realWindowHoles: openingCount,
    wallLengthMetres: wall.end.x,
    wallHeightMetres: wall.height,
    triangles: initialIndex.length / 3,
    materialGroups: initialGroups.length,
    raysPerIteration: probes.length,
    hitRays: expected.filter(Boolean).length,
    missRays: expected.filter((hit) => !hit).length,
  },
  setup: { sceneBuildMs, bvhBuildMs, indirect: true },
  measurement: {
    warmupIterationsPerMethod: warmupIterations,
    measuredIterationsPerMethod: measuredIterations,
    raysPerMethod: measuredIterations * probes.length,
    measurementOrder: 'alternating native→BVH then BVH→native',
    native,
    bvh,
    processCpuMicroseconds: cpuMicroseconds,
    observedMeanRatioNativeToBvh: native.meanMs / bvh.meanMs,
    checksum,
  },
  correctness: {
    equivalentNearestHits: equivalent,
    originalIndexAndGroupsUnchanged: true,
    nativeClosestSelection: 'Three native Mesh.raycast plus Raycaster distance sorting',
    bvhClosestSelection: 'instance-only acceleratedRaycast with firstHitOnly true',
    compared: [
      'presence',
      'distance',
      'world point',
      'UV',
      'normal',
      'faceIndex',
      'materialIndex',
      'triangle vertices',
    ],
  },
  ownership: { before: ownershipBefore, constructed, after: ownershipAfter },
  limitations: [
    'This deliberately stresses one wall with many real openings; it does not measure multi-object broad-phase traversal or ordinary low-triangle walls.',
    'Construction cost is reported separately, rather than hidden inside a speedup claim.',
    'Per-batch durations use performance.now. Separate process CPU counters can be coarse, particularly on Windows, and include process-wide activity.',
    'This is an observed CPU measurement, not a formal performance pass; no minimum target or reference hardware has been approved.',
    'Mesh.raycast is switched only on the benchmark-owned instance. No Three prototype or global raycaster is modified.',
  ],
};
mkdirSync('.test-artifacts/benchmarks', { recursive: true });
writeFileSync('.test-artifacts/benchmarks/bvh.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
