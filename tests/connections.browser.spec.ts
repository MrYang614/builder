import { test, expect, type Page } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateBytes } from 'gltf-validator';
import type { ProjectDocument } from '@building/editor-core';
type Instrumented = {
  __editor: {
    document(): ProjectDocument;
    project(p: { x: number; y: number; z: number }): { x: number; y: number };
    diagnostics(): { pendingFrame: boolean; camera: { position: number[]; target: number[] } };
  };
};
const snapshot = (page: Page) =>
  page.evaluate(() => (window as unknown as Instrumented).__editor.document());
async function clickWorld(page: Page, x: number, z: number) {
  const p = await page.evaluate((p) => (window as unknown as Instrumented).__editor.project(p), {
    x,
    y: 0,
    z,
  });
  await page.mouse.click(p.x, p.y);
}
const cases = [
  {
    name: 'collinear',
    points: [
      [0, 0],
      [2, 0],
      [4, 0],
    ],
    split: false,
    rectangles: [[0, 4, -0.1, 0.1]],
    area: 25.12,
    volume: 2.24,
    bounds: { min: [0, 0, -0.1], max: [4, 2.8, 0.1] },
    rays: [{ origin: [-1, 1.37, 0], direction: [1, 0, 0], distances: [1, 5] }],
  },
  {
    name: 'L',
    points: [
      [0, 0],
      [2, 0],
      [2, 2],
    ],
    split: false,
    rectangles: [
      [0, 2.1, -0.1, 0.1],
      [1.9, 2.1, -0.1, 2],
    ],
    area: 25.12,
    volume: 2.24,
    bounds: { min: [0, 0, -0.1], max: [2.1, 2.8, 2] },
    rays: [
      { origin: [-1, 1.37, 0], direction: [1, 0, 0], distances: [1, 3.1] },
      { origin: [2, 1.37, -1], direction: [0, 0, 1], distances: [0.9, 3] },
    ],
  },
  {
    name: 'T',
    points: [
      [-2, 0],
      [2, 0],
      [0, 0],
      [0, 2],
    ],
    split: true,
    rectangles: [
      [-2, 2, -0.1, 0.1],
      [-0.1, 0.1, -0.1, 2],
    ],
    area: 36.52,
    volume: 3.304,
    bounds: { min: [-2, 0, -0.1], max: [2, 2.8, 2] },
    rays: [
      { origin: [-3, 1.37, 0], direction: [1, 0, 0], distances: [1, 5] },
      { origin: [0, 1.37, -1], direction: [0, 0, 1], distances: [0.9, 3] },
      { origin: [1, 1.37, 3], direction: [0, 0, -1], distances: [2.9, 3.1] },
    ],
  },
];

for (const fixture of cases) {
  test(`actual mouse ${fixture.name} joined walls export a closed exterior union and render from multiple rotated views`, async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window as unknown as Instrumented).__editor);
    await page.getByRole('radio', { name: '墙体', exact: true }).click();
    for (let index = 0; index < fixture.points.length; index++) {
      if (fixture.split && index === 2) {
        await page.keyboard.press('Escape');
      }
      await clickWorld(page, fixture.points[index]![0]!, fixture.points[index]![1]!);
    }
    await page.keyboard.press('Escape');
    await page.getByRole('radio', { name: '选择', exact: true }).click();
    const doc = await snapshot(page);
    expect(doc.walls).toHaveLength(2);
    expect(doc.openings).toEqual([]);
    expect(doc.walls.every((wall) => wall.thickness === 0.2 && wall.height === 2.8)).toBe(true);
    await page.getByRole('button', { name: '查看整栋', exact: true }).click();
    await mkdir('test-results/theme-toggle/evidence/screenshots', { recursive: true });
    const screenshots: string[] = [],
      cameraPositions: number[][] = [];
    for (let angle = 0; angle < 3; angle++) {
      if (angle) {
        const rect = await page.locator('canvas').boundingBox();
        if (!rect) {
          throw new Error('Actual viewport canvas missing');
        }
        await page.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
        await page.mouse.down({ button: 'right' });
        await page.mouse.move(
          rect.x + rect.width * 0.5 + (angle === 1 ? 110 : -180),
          rect.y + rect.height * 0.5 + (angle === 1 ? 35 : -20),
          { steps: 12 },
        );
        await page.mouse.up({ button: 'right' });
      }
      await page.waitForFunction(
        () => !(window as unknown as Instrumented).__editor.diagnostics().pendingFrame,
      );
      const path = `test-results/theme-toggle/evidence/screenshots/connections-${fixture.name}-${angle}.png`;
      await page.screenshot({ path });
      screenshots.push(path);
      cameraPositions.push(
        await page.evaluate(
          () => (window as unknown as Instrumented).__editor.diagnostics().camera.position,
        ),
      );
    }
    expect(cameraPositions[1]).not.toEqual(cameraPositions[0]);
    expect(cameraPositions[2]).not.toEqual(cameraPositions[1]);
    expect(await snapshot(page)).toEqual(doc);
    const wait = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出 GLB', exact: true }).click();
    const download = await wait,
      file = resolve(testInfo.outputDir, `actual-${fixture.name}-walls.glb`);
    await download.saveAs(file);
    const bytes = await readFile(file),
      validation = await validateBytes(bytes, { uri: `actual-${fixture.name}-walls.glb` });
    expect(validation.issues.numErrors).toBe(0);
    expect(validation.issues.numWarnings).toBe(0);
    const loader = `/@fs/${resolve('node_modules/three/examples/jsm/loaders/GLTFLoader.js').replaceAll('\\', '/')}`;
    const geometry = await page.evaluate(
      async ({ loader, bytes, fixture }) => {
        const url = performance
            .getEntriesByType('resource')
            .map((entry) => entry.name)
            .find((name) => /\/three\.js(?:\?|$)/.test(name)),
          THREE = await import(url!),
          { GLTFLoader } = await import(loader),
          loaded = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
        loaded.scene.updateMatrixWorld(true);
        type Point = [number, number, number];
        type Triangle = [Point, Point, Point];
        type Point2 = [number, number];
        const triangles: Triangle[] = [],
          edges = new Map<string, number>(),
          uniqueTriangles = new Set<string>();
        let duplicateTriangles = 0,
          area = 0,
          volume = 0,
          degenerate = 0;
        const internalFaces: number[] = [],
          planes = new Map<string, { index: number; points: Point2[] }[]>();
        loaded.scene.traverse((object: import('three').Object3D) => {
          if (!(object as import('three').Mesh).isMesh) {
            return;
          }
          const mesh = object as import('three').Mesh,
            position = mesh.geometry.getAttribute('position'),
            indices = mesh.geometry.getIndex(),
            count = indices?.count ?? position.count;
          for (let index = 0; index < count; index += 3) {
            const triangle = [0, 1, 2].map((offset) =>
              new THREE.Vector3()
                .fromBufferAttribute(
                  position,
                  indices ? indices.getX(index + offset) : index + offset,
                )
                .applyMatrix4(mesh.matrixWorld)
                .toArray(),
            ) as Triangle;
            triangles.push(triangle);
          }
        });
        const vector = (point: Point) => new THREE.Vector3(...point),
          key = (point: Point) =>
            point.map((value) => String(Object.is(value, -0) ? 0 : value)).join(',');
        const inside = (point: Point) =>
          point[1] > 0 &&
          point[1] < 2.8 &&
          fixture.rectangles.some(
            ([x0, x1, z0, z1]) =>
              point[0] > x0! && point[0] < x1! && point[2] > z0! && point[2] < z1!,
          );
        triangles.forEach((triangle, index) => {
          const [a, b, c] = triangle,
            normal = vector(b)
              .sub(vector(a))
              .cross(vector(c).sub(vector(a))),
            triangleArea = normal.length() / 2;
          if (triangleArea < 1e-10) {
            degenerate++;
          }
          area += triangleArea;
          volume += vector(a).dot(vector(b).cross(vector(c))) / 6;
          normal.normalize();
          const vertices = triangle.map(key),
            triangleKey = [...vertices].sort().join('|');
          if (uniqueTriangles.has(triangleKey)) {
            duplicateTriangles++;
          }
          uniqueTriangles.add(triangleKey);
          for (let edge = 0; edge < 3; edge++) {
            const edgeKey = [vertices[edge], vertices[(edge + 1) % 3]].sort().join('|');
            edges.set(edgeKey, (edges.get(edgeKey) ?? 0) + 1);
          }
          const centroid = vector(a)
              .add(vector(b))
              .add(vector(c))
              .multiplyScalar(1 / 3),
            inward = centroid.clone().addScaledVector(normal, -1e-4).toArray() as Point,
            outward = centroid.clone().addScaledVector(normal, 1e-4).toArray() as Point;
          if (!inside(inward) || inside(outward)) {
            internalFaces.push(index);
          }
          const axis = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)].indexOf(
              Math.max(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)),
            ),
            axes = [0, 1, 2].filter((value) => value !== axis),
            planeKey = `${axis}:${String(a[axis])}`;
          const bucket = planes.get(planeKey) ?? [];
          bucket.push({
            index,
            points: triangle.map((point) => [point[axes[0]!]!, point[axes[1]!]!] as Point2),
          });
          planes.set(planeKey, bucket);
        });
        const cross = (a: Point2, b: Point2) => a[0] * b[1] - a[1] * b[0],
          subtract = (a: Point2, b: Point2): Point2 => [a[0] - b[0], a[1] - b[1]],
          signedArea = (polygon: Point2[]) =>
            polygon.reduce(
              (sum, point, index) => sum + cross(point, polygon[(index + 1) % polygon.length]!),
              0,
            ) / 2;
        function overlapArea(subject: Point2[], clip: Point2[]) {
          let polygon = subject.map((point) => [...point] as Point2);
          const orientation = Math.sign(signedArea(clip));
          for (let edgeIndex = 0; edgeIndex < 3 && polygon.length; edgeIndex++) {
            const a = clip[edgeIndex]!,
              b = clip[(edgeIndex + 1) % 3]!,
              edge = subtract(b, a),
              input = polygon;
            polygon = [];
            const isInside = (point: Point2) =>
              cross(edge, subtract(point, a)) * orientation >= -1e-10;
            const intersection = (previous: Point2, current: Point2): Point2 => {
              const segment = subtract(current, previous),
                denominator = cross(segment, edge),
                t = cross(subtract(a, previous), edge) / denominator;
              return [previous[0] + segment[0] * t, previous[1] + segment[1] * t];
            };
            for (let index = 0; index < input.length; index++) {
              const current = input[index]!,
                previous = input[(index + input.length - 1) % input.length]!,
                currentInside = isInside(current),
                previousInside = isInside(previous);
              if (currentInside) {
                if (!previousInside) {
                  polygon.push(intersection(previous, current));
                }
                polygon.push(current);
              } else if (previousInside) {
                polygon.push(intersection(previous, current));
              }
            }
          }
          return polygon.length >= 3 ? Math.abs(signedArea(polygon)) : 0;
        }
        const coplanarOverlaps: { triangles: number[]; area: number }[] = [];
        for (const bucket of planes.values()) {
          for (let a = 0; a < bucket.length; a++) {
            for (let b = a + 1; b < bucket.length; b++) {
              const overlap = overlapArea(bucket[a]!.points, bucket[b]!.points);
              if (overlap > 1e-8) {
                coplanarOverlaps.push({
                  triangles: [bucket[a]!.index, bucket[b]!.index],
                  area: overlap,
                });
              }
            }
          }
        }
        const rays = fixture.rays.map((test) => {
          const ray = new THREE.Ray(vector(test.origin as Point), vector(test.direction as Point)),
            distances: number[] = [];
          for (const triangle of triangles) {
            const hit = ray.intersectTriangle(...triangle.map(vector), false, new THREE.Vector3());
            if (hit) {
              distances.push(hit.distanceTo(ray.origin));
            }
          }
          distances.sort((a, b) => a - b);
          return {
            origin: test.origin,
            direction: test.direction,
            expected: test.distances,
            actual: distances.filter(
              (distance, index) => index === 0 || Math.abs(distance - distances[index - 1]!) > 1e-5,
            ),
          };
        });
        const box = new THREE.Box3().setFromObject(loaded.scene),
          bounds = { min: box.min.toArray(), max: box.max.toArray() },
          nonmanifoldEdges = [...edges].filter(([, count]) => count !== 2);
        loaded.scene.traverse((object: import('three').Object3D) => {
          if ((object as import('three').Mesh).isMesh) {
            const mesh = object as import('three').Mesh;
            mesh.geometry.dispose();
            (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) =>
              material.dispose(),
            );
          }
        });
        return {
          triangles: triangles.length,
          area,
          volume,
          bounds,
          degenerate,
          duplicateTriangles,
          internalFaces,
          coplanarOverlaps,
          nonmanifoldEdges,
          rays,
        };
      },
      { loader, bytes: [...bytes], fixture },
    );
    expect(geometry.triangles).toBeGreaterThan(0);
    expect(geometry.degenerate).toBe(0);
    expect(geometry.duplicateTriangles).toBe(0);
    expect(geometry.internalFaces).toEqual([]);
    expect(geometry.coplanarOverlaps).toEqual([]);
    expect(geometry.nonmanifoldEdges).toEqual([]);
    expect(geometry.area).toBeCloseTo(fixture.area, 5);
    expect(geometry.volume).toBeCloseTo(fixture.volume, 5);
    for (const side of ['min', 'max'] as const) {
      fixture.bounds[side].forEach((value, index) =>
        expect(geometry.bounds[side][index]).toBeCloseTo(value, 6),
      );
    }
    for (const ray of geometry.rays) {
      expect(ray.actual).toHaveLength(ray.expected.length);
      ray.expected.forEach((distance, index) => expect(ray.actual[index]).toBeCloseTo(distance, 5));
    }
    expect(await snapshot(page)).toEqual(doc);
    await mkdir('test-results/theme-toggle/evidence', { recursive: true });
    await writeFile(
      `test-results/theme-toggle/evidence/connections-${fixture.name}-validation.json`,
      JSON.stringify(
        {
          acceptance: 'A02',
          platform: 'Windows Chromium SwiftShader browser; native L test is separately recorded',
          path: 'Actual wall tool pointer clicks → actual camera right-button rotation → actual GLB download → independent GLTFLoader surface inspection',
          walls: doc.walls.map(({ id, start, end, height, thickness }) => ({
            id,
            start,
            end,
            height,
            thickness,
          })),
          validator: {
            errors: validation.issues.numErrors,
            warnings: validation.issues.numWarnings,
          },
          geometry,
          expected: { area: fixture.area, volume: fixture.volume, bounds: fixture.bounds },
          screenshots,
          cameraPositions,
          objectiveConclusion:
            'Exact exported welded-edge incidence is two; every face separates analytical union interior from exterior; no duplicate or overlapping coplanar triangles; expected union bounds, area, volume and ray entry/exit distances match. These fixture solids have no geometric cracks, internal end covers or coincident faces causing Z-fighting.',
          visualScope:
            'Actual renderer screenshots at three real rotated camera views retained for human review; this does not certify every camera/device combination.',
        },
        null,
        2,
      ),
    );
  });
}
