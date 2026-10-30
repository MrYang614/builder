import { describe, expect, test } from 'vitest';
import { Vector3 } from 'three';
import {
  EditorCore,
  createEmptyProject,
  createOpening,
  createWall,
  type Vec2,
} from '@building/editor-core';
import {
  buildPlanWallFootprints,
  derivePlanOpening,
  type PlanEdge,
} from '@building/building-geometry';
import { buildObject } from '@building/three-runtime/scene';

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const perimeter = (edges: PlanEdge[]) =>
  edges.reduce((total, edge) => total + distance(edge.start, edge.end), 0);

function corner() {
  const document = createEmptyProject();
  const horizontal = createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 0 });
  horizontal.id = 'wall_a';
  const vertical = createWall('level_1', { x: 4, z: 0 }, { x: 4, z: 3 });
  vertical.id = 'wall_b';
  document.walls.push(horizontal, vertical);
  return document;
}

describe('shared SVG plan footprint geometry', () => {
  test('a standalone wall has physical thickness and both end caps', () => {
    const document = corner();
    document.walls.pop();
    const [footprint] = buildPlanWallFootprints(document, 'level_1');
    expect(footprint.polygon).toEqual([
      { x: 0, z: -0.1 },
      { x: 4, z: -0.1 },
      { x: 4, z: 0.1 },
      { x: 0, z: 0.1 },
    ]);
    expect(footprint.edges).toHaveLength(4);
    expect(perimeter(footprint.edges)).toBeCloseTo(8.4, 10);
  });

  test('collinear joins omit their internal caps', () => {
    const document = corner();
    document.walls[1].end = { x: 7, z: 0 };
    const result = buildPlanWallFootprints(document, 'level_1');
    expect(result.flatMap((wall) => wall.edges)).toHaveLength(6);
    expect(perimeter(result.flatMap((wall) => wall.edges))).toBeCloseTo(14.4, 10);
    expect(
      result.flatMap((wall) => wall.edges).some((edge) => edge.start.x === 4 && edge.end.x === 4),
    ).toBe(false);
  });

  test('L joints share true extended corners with no interior strokes', () => {
    const document = corner();
    const [horizontal, vertical] = buildPlanWallFootprints(document, 'level_1');
    expect(horizontal.polygon[1]).toEqual({ x: 4.1, z: -0.1 });
    expect(horizontal.edges).toEqual([
      { start: { x: 0, z: -0.1 }, end: { x: 4.1, z: -0.1 } },
      { start: { x: 0, z: 0.1 }, end: { x: 3.9, z: 0.1 } },
      { start: { x: 0, z: -0.1 }, end: { x: 0, z: 0.1 } },
    ]);
    expect(vertical.edges).toEqual([
      { start: { x: 3.9, z: 3 }, end: { x: 4.1, z: 3 } },
      { start: { x: 3.9, z: 0.1 }, end: { x: 3.9, z: 3 } },
      { start: { x: 4.1, z: -0.1 }, end: { x: 4.1, z: 3 } },
    ]);
    expect(perimeter([...horizontal.edges, ...vertical.edges])).toBeCloseTo(14.4, 10);
  });

  test('T branches trim the trunk boundary while preserving free ends', () => {
    const document = corner();
    document.walls[1].start = { x: 2, z: 0 };
    document.walls[1].end = { x: 2, z: 3 };
    const [horizontal, vertical] = buildPlanWallFootprints(document, 'level_1');
    expect(horizontal.edges).toContainEqual({
      start: { x: 0, z: 0.1 },
      end: { x: 1.9, z: 0.1 },
    });
    expect(horizontal.edges).toContainEqual({
      start: { x: 2.1, z: 0.1 },
      end: { x: 4, z: 0.1 },
    });
    expect(vertical.edges).toHaveLength(3);
    expect(perimeter([...horizontal.edges, ...vertical.edges])).toBeCloseTo(14.2, 10);
  });

  test('footprints ignore holes, other floors and material changes without mutating the revision', () => {
    const document = corner();
    const expected = buildPlanWallFootprints(document, 'level_1');
    document.levels.push({ id: 'level_2', name: '2', elevation: 3, height: 3 });
    document.walls.push(createWall('level_2', { x: 0, z: 0 }, { x: 0, z: 4 }));
    document.openings.push(createOpening(document.walls[0], 'window', 1));
    document.walls[0].materials.A.tileWidth = 0.725;
    const core = new EditorCore(document);
    const before = core.getSnapshot();
    expect(buildPlanWallFootprints(before, 'level_1')).toEqual(expected);
    expect(buildPlanWallFootprints(before, 'missing')).toEqual([]);
    expect(core.getSnapshot()).toBe(before);
    expect(core.getHistoryState().undoCount).toBe(0);
  });

  test('connected changes and undo regenerate the same footprint from formal parameters', () => {
    const core = new EditorCore(corner());
    const before = buildPlanWallFootprints(core.getSnapshot(), 'level_1');
    expect(
      core.execute({ type: 'update-wall', id: 'wall_a', patch: { end: { x: 5, z: 0 } } }).ok,
    ).toBe(true);
    const changed = buildPlanWallFootprints(core.getSnapshot(), 'level_1');
    expect(changed[0].polygon[1].x).toBe(5.1);
    expect(changed[1].polygon[0].x).toBe(4.9);
    core.undo();
    expect(buildPlanWallFootprints(core.getSnapshot(), 'level_1')).toEqual(before);
  });
});

describe('opening symbols and shared 3D door parameters', () => {
  test('gap polygon uses exact physical host offset and thickness', () => {
    const document = corner();
    const wall = document.walls[1];
    const opening = createOpening(wall, 'window', 0.4);
    opening.width = 1.25;
    expect(derivePlanOpening(wall, opening)).toMatchObject({
      start: { x: 4, z: 0.4 },
      end: { x: 4, z: 1.65 },
      polygon: [
        { x: 4.1, z: 0.4 },
        { x: 4.1, z: 1.65 },
        { x: 3.9, z: 1.65 },
        { x: 3.9, z: 0.4 },
      ],
    });
  });

  test('hinge and current leaf tip match real 3D meshes for every host/hinge/direction orientation', () => {
    for (const end of [
      { x: 5, z: 0 },
      { x: -5, z: 0 },
      { x: 0, z: 5 },
      { x: 0, z: -5 },
    ]) {
      for (const hinge of ['left', 'right'] as const) {
        for (const direction of [-1, 1] as const) {
          for (const surfaceOrientation of [-1, 1] as const) {
            const document = createEmptyProject();
            const wall = createWall('level_1', { x: 0, z: 0 }, end);
            wall.surfaceOrientation = surfaceOrientation;
            const opening = createOpening(wall, 'door', 0.75);
            opening.hinge = hinge;
            opening.direction = direction;
            opening.angle = 37;
            document.walls.push(wall);
            document.openings.push(opening);
            const symbol = derivePlanOpening(wall, opening);
            const built = buildObject(document, opening.id);
            try {
              built.root.updateMatrixWorld(true);
              const pivot = built.root.getObjectByName(`HingePivot_${opening.id}`)!;
              const leaf = built.root.getObjectByName(`DoorPanel_${opening.id}`)!;
              const pivotPoint = pivot.getWorldPosition(new Vector3());
              const tip = leaf.localToWorld(
                new Vector3(((hinge === 'left' ? 1 : -1) * symbol.leafWidth) / 2, 0, 0),
              );
              expect(symbol.hinge.x).toBeCloseTo(pivotPoint.x, 10);
              expect(symbol.hinge.z).toBeCloseTo(pivotPoint.z, 10);
              expect(symbol.leafEnd.x).toBeCloseTo(tip.x, 10);
              expect(symbol.leafEnd.z).toBeCloseTo(tip.z, 10);
            } finally {
              built.dispose();
            }
          }
        }
      }
    }
  });

  test('swing follows formal closed/open angles and preserves a signed sweep over 180 degrees', () => {
    const wall = corner().walls[0];
    const opening = createOpening(wall, 'door', 0.5);
    opening.closedAngle = 15;
    opening.openAngle = -240;
    opening.angle = opening.closedAngle;
    const shape = derivePlanOpening(wall, opening);
    expect(shape.swing[0]).toEqual(shape.leafEnd);
    expect(shape.swing.at(-1)).toEqual(
      derivePlanOpening(wall, { ...opening, angle: opening.openAngle }).leafEnd,
    );
    expect(shape.swing).toHaveLength(52);
    for (const point of shape.swing) {
      expect(distance(point, shape.hinge)).toBeCloseTo(shape.leafWidth, 10);
    }
  });
});
