import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, arch, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { EditorCore } from '@building/editor-core';
import { fixedProject } from './benchmark-fixture';
import { buildGeometry, prepareGeometry } from '@building/building-geometry';

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    samples: sorted.length,
    minMs: sorted[0],
    meanMs: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p50Ms: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    maxMs: sorted.at(-1),
  };
}

const generationStart = performance.now(),
  fixture = fixedProject(),
  generationMs = performance.now() - generationStart;
const coreStart = performance.now(),
  core = new EditorCore(fixture),
  initialCoreMs = performance.now() - coreStart;
const initialGeometryStart = performance.now(),
  fullGeometry = buildGeometry(core.getSnapshot()),
  initialGeometryMs = performance.now() - initialGeometryStart;
const vertexCount = [...fullGeometry.values()].reduce(
  (sum, geometry) => sum + geometry.positions.length / 3,
  0,
);
const triangleCount = [...fullGeometry.values()].reduce(
  (sum, geometry) => sum + geometry.indices.length / 3,
  0,
);
const commandSamples: number[] = [],
  geometrySamples: number[] = [],
  combinedSamples: number[] = [],
  affectedCounts: number[] = [];
for (let index = 0; index < 60; index += 1) {
  const start = performance.now();
  const result = core.execute({
    type: 'update-wall',
    id: 'benchmark_wall_0',
    patch: { height: 2.85 + (index % 4) * 0.02 },
  });
  if (!result.ok) {
    throw new Error(JSON.stringify(result.error));
  }
  const committed = performance.now(),
    solver = prepareGeometry(core.getSnapshot());
  for (const wallId of result.changeSet.wallIds) {
    if (core.getSnapshot().walls.some((wall) => wall.id === wallId)) {
      solver.wall(wallId);
    }
  }
  const finished = performance.now();
  if (index >= 10) {
    commandSamples.push(committed - start);
    geometrySamples.push(finished - committed);
    combinedSamples.push(finished - start);
    affectedCounts.push(result.changeSet.wallIds.length);
  }
}
const report = {
  measuredAt: new Date().toISOString(),
  scope:
    'Node.js CPU-only; no Renderer, GPU FPS, Tauri WebView, disk IO or interaction input latency measured',
  environment: {
    os: platform(),
    release: release(),
    arch: arch(),
    node: process.version,
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    totalMemoryBytes: totalmem(),
  },
  fixture: {
    levels: fixture.levels.length,
    walls: fixture.walls.length,
    openings: fixture.openings.length,
    slabs: fixture.slabs.length,
    images: fixture.resources.length,
    imageWidth: 2048,
    imageHeight: 2048,
    uniqueImageContents: new Set(fixture.resources.map((resource) => resource.dataUrl)).size,
    encodedImageBytes: fixture.resources.reduce(
      (sum, resource) => sum + Buffer.from(resource.dataUrl.split(',')[1]!, 'base64').length,
      0,
    ),
    imageDecodedRGBBytes: fixture.resources.length * 2048 * 2048 * 3,
    geometryVertexCount: vertexCount,
    geometryTriangleCount: triangleCount,
  },
  setup: {
    proceduralPngGenerationMs: generationMs,
    initialCoreValidationAndSnapshotMs: initialCoreMs,
    fullGeometryMs: initialGeometryMs,
  },
  measurement: {
    warmupIterations: 10,
    measuredIterations: 50,
    change: 'one wall height edit, command validation and dependency-aware geometry rebuild',
    coreCommit: stats(commandSamples),
    topologyAndAffectedGeometry: stats(geometrySamples),
    combined: stats(combinedSamples),
    affectedWallCounts: [...new Set(affectedCounts)],
  },
  memory: {
    processHeapUsedBytes: process.memoryUsage().heapUsed,
    processRssBytes: process.memoryUsage().rss,
  },
  limitations: [
    'Formal FPS / pointer P95 thresholds await Q5 reference hardware.',
    'This result cannot be claimed as Windows Tauri or macOS acceptance.',
    'PNG resources are validated/retained but not decoded into GPU textures in this process.',
    'Per-cycle WebGL resource stability and disk faults require their separate integration/E2E tests.',
  ],
};
mkdirSync('.test-artifacts/benchmarks', { recursive: true });
writeFileSync('.test-artifacts/benchmarks/core.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
