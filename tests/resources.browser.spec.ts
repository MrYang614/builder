import { evidencePath } from './evidence-path';
import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

test('decoded and GPU-rendered image versions release CPU cache on repeated import/clear/delete and same-ID replacement', async ({
  page,
}) => {
  await page.goto('/');
  const source = `/@fs/${resolve('.').replaceAll('\\', '/')}`;
  const result = await page.evaluate(async (source) => {
    const core = await import(`${source}/packages/editor-core/src/index.ts`),
      { ResourcePool } = await import(`${source}/packages/three-runtime/src/materials.ts`);
    const threeUrl = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((name) => /\/three\.js(?:\?|$)/.test(name)),
      THREE = await import(threeUrl!);
    const document = core.createEmptyProject('Resource lifecycle verification'),
      editor = new core.EditorCore(document);
    const wall = core.createWall('level_1', { x: 0, z: 0 }, { x: 2, z: 0 });
    if (!editor.execute({ type: 'add-wall', wall }).ok) {
      throw new Error('Fixture wall rejected');
    }
    const pool = new ResourcePool(editor.getSnapshot()),
      renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(64, 64, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene(),
      camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 2;
    scene.add(new THREE.AmbientLight(0xffffff, 3));
    const binding = { ...core.defaultSurface(), color: '#ffffff' },
      solid = pool.acquire(binding),
      geometry = new THREE.PlaneGeometry(2, 2),
      mesh = new THREE.Mesh(geometry, solid.material);
    scene.add(mesh);
    const pixel = () => {
      renderer.render(scene, camera);
      const colour = new Uint8Array(4),
        gl = renderer.getContext();
      gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, colour);
      return [...colour];
    };
    const image = (id: string, colour: string) => {
      const canvas = globalThis.document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = colour;
      ctx.fillRect(0, 0, 64, 64);
      return { id, name: `${id}.png`, mime: 'image/png', dataUrl: canvas.toDataURL('image/png') };
    };
    const command = (command: import('@building/editor-core').Command) => {
      const result = editor.execute(command);
      if (!result.ok) {
        throw new Error(result.error.code);
      }
      pool.setDocument(editor.getSnapshot());
    };
    const before = pixel(),
      baseline = renderer.info.memory.textures,
      cycles = [];
    for (let index = 0; index < 20; index++) {
      const resource = image(`image_cycle_${index}`, '#e02010');
      command({
        type: 'batch',
        commands: [
          { type: 'add-resource', resource },
          {
            type: 'set-material',
            objectId: wall.id,
            side: 'A',
            binding: { ...binding, resourceId: resource.id },
          },
        ],
      });
      const lease = pool.acquire({ ...binding, resourceId: resource.id });
      await pool.ready();
      mesh.material = lease.material;
      const coloured = pixel(),
        active = {
          cached: pool.cachedResources,
          ...pool.stats,
          gpu: renderer.info.memory.textures,
        };
      // Clear material references through core before deleting the formal image resource.
      command({
        type: 'batch',
        commands: [
          { type: 'set-material', objectId: wall.id, side: 'A', binding },
          { type: 'delete-resource', id: resource.id },
        ],
      });
      mesh.material = solid.material;
      lease.release();
      const cleared = pixel();
      cycles.push({
        active,
        coloured,
        cleared,
        cached: pool.cachedResources,
        resources: editor.getSnapshot().resources.length,
        pool: pool.stats,
        gpu: renderer.info.memory.textures,
      });
    }
    const old = image('same_resource_id', '#e02010'),
      replacement = image('same_resource_id', '#1050e0');
    command({
      type: 'batch',
      commands: [
        { type: 'add-resource', resource: old },
        {
          type: 'set-material',
          objectId: wall.id,
          side: 'A',
          binding: { ...binding, resourceId: old.id },
        },
      ],
    });
    const oldLease = pool.acquire({ ...binding, resourceId: old.id });
    await pool.ready();
    mesh.material = oldLease.material;
    const oldPixel = pixel();
    command({
      type: 'batch',
      commands: [
        { type: 'set-material', objectId: wall.id, side: 'A', binding },
        { type: 'delete-resource', id: old.id },
        { type: 'add-resource', resource: replacement },
        {
          type: 'set-material',
          objectId: wall.id,
          side: 'A',
          binding: { ...binding, resourceId: replacement.id },
        },
      ],
    });
    const replacementPruned = pool.cachedResources,
      oldDisposed = { value: 0 };
    oldLease.material.map.addEventListener('dispose', () => oldDisposed.value++);
    const newLease = pool.acquire({ ...binding, resourceId: replacement.id });
    await pool.ready();
    mesh.material = newLease.material;
    const newPixel = pixel(),
      versionsDistinct = oldLease.material.map !== newLease.material.map,
      overlapStats = pool.stats;
    oldLease.release();
    const releaseOldStats = pool.stats;
    command({
      type: 'batch',
      commands: [
        { type: 'set-material', objectId: wall.id, side: 'A', binding },
        { type: 'delete-resource', id: replacement.id },
      ],
    });
    mesh.material = solid.material;
    newLease.release();
    pixel();
    const final = {
      cached: pool.cachedResources,
      ...pool.stats,
      gpu: renderer.info.memory.textures,
    };
    solid.release();
    pool.dispose();
    geometry.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    return {
      baseline,
      before,
      cycles,
      oldPixel,
      newPixel,
      replacementPruned,
      versionsDistinct,
      overlapStats,
      releaseOldStats,
      oldTextureDisposeCount: oldDisposed.value,
      final,
      disposed: { cached: pool.cachedResources, ...pool.stats },
    };
  }, source);
  expect(result.cycles).toHaveLength(20);
  for (const cycle of result.cycles) {
    expect(cycle.active.cached).toBe(1);
    expect(cycle.active.textures).toBe(1);
    expect(cycle.active.gpu).toBe(result.baseline + 1);
    expect(cycle.coloured[0]).toBeGreaterThan(cycle.coloured[2]!);
    expect(cycle.cleared).toEqual(result.before);
    expect(cycle.cached).toBe(0);
    expect(cycle.resources).toBe(0);
    expect(cycle.pool).toEqual({ materials: 1, textures: 0, references: 1 });
    expect(cycle.gpu).toBe(result.baseline);
  }
  expect(result.replacementPruned).toBe(0);
  expect(result.versionsDistinct).toBe(true);
  expect(result.oldPixel[0]).toBeGreaterThan(result.oldPixel[2]!);
  expect(result.newPixel[2]).toBeGreaterThan(result.newPixel[0]!);
  expect(result.overlapStats).toEqual({ materials: 3, textures: 2, references: 3 });
  expect(result.releaseOldStats).toEqual({ materials: 2, textures: 1, references: 2 });
  expect(result.oldTextureDisposeCount).toBe(1);
  expect(result.final).toEqual({
    cached: 0,
    materials: 1,
    textures: 0,
    references: 1,
    gpu: result.baseline,
  });
  expect(result.disposed).toEqual({ cached: 0, materials: 0, textures: 0, references: 0 });
  await mkdir(evidencePath('theme-toggle/evidence'), { recursive: true });
  await writeFile(
    evidencePath('theme-toggle/evidence/resource-cache-validation.json'),
    JSON.stringify(
      {
        platform:
          'Windows Chromium WebGL isolated material-pool integration; actual PNG decoding/GPU drawing, not native Tauri/file chooser acceptance',
        cycles: 20,
        removalPrunesCpuCache: true,
        sameIdReplacementPrunesCpuCache: true,
        oldGpuLeaseSurvivesUntilRelease: true,
        newImageDisplayed: true,
        report: result,
      },
      null,
      2,
    ),
  );
});
