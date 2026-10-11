import { describe, expect, test } from 'vitest';
import {
  createEmptyProject,
  createOpening,
  createWall,
  resolveSnapPoint,
  type ProjectDocument,
  type SnapCandidate,
  type SnapSettings,
} from '@building/editor-core';
import { buildEffectiveWallSnapCandidates } from '@building/building-geometry';

const points: SnapSettings = { enabled: true, mode: 'points', tolerance: 0.08, gridSize: 0.1 };
const lines: SnapSettings = { ...points, mode: 'lines' };

function corner(): ProjectDocument {
  const document = createEmptyProject();
  const horizontal = createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 0 });
  horizontal.id = 'wall_a';
  const vertical = createWall('level_1', { x: 4, z: 0 }, { x: 4, z: 3 });
  vertical.id = 'wall_b';
  document.walls.push(horizontal, vertical);
  return document;
}

function segments(candidates: SnapCandidate[]) {
  return candidates
    .filter((candidate) => candidate.segment)
    .map((candidate) => ({
      objectId: candidate.objectId,
      segment: { start: candidate.segment!.start, end: candidate.segment!.end },
    }));
}

describe('effective wall-union snap boundaries', () => {
  test('standalone walls retain their two true thickness faces and four edge anchors', () => {
    const document = corner();
    document.walls.pop();
    const candidates = buildEffectiveWallSnapCandidates(document, 'level_1');
    expect(segments(candidates)).toEqual([
      { objectId: 'wall_a', segment: { start: { x: 0, z: -0.1 }, end: { x: 4, z: -0.1 } } },
      { objectId: 'wall_a', segment: { start: { x: 0, z: 0.1 }, end: { x: 4, z: 0.1 } } },
    ]);
    expect(
      candidates.filter((candidate) => candidate.point).map((candidate) => candidate.point),
    ).toEqual([
      { x: 0, z: -0.1 },
      { x: 4, z: -0.1 },
      { x: 0, z: 0.1 },
      { x: 4, z: 0.1 },
    ]);
    expect(candidates.every((candidate) => candidate.relatedObjectIds?.join() === 'wall_a')).toBe(
      true,
    );
    expect(candidates.every((candidate) => candidate.source === 'formal')).toBe(true);
  });

  test('L joins extend the outside corner and trim the occluded inside faces', () => {
    const document = corner();
    const before = structuredClone(document);
    const candidates = buildEffectiveWallSnapCandidates(document, 'level_1');
    expect(segments(candidates)).toEqual([
      { objectId: 'wall_a', segment: { start: { x: 0, z: -0.1 }, end: { x: 4.1, z: -0.1 } } },
      { objectId: 'wall_a', segment: { start: { x: 0, z: 0.1 }, end: { x: 3.9, z: 0.1 } } },
      { objectId: 'wall_b', segment: { start: { x: 3.9, z: 0.1 }, end: { x: 3.9, z: 3 } } },
      { objectId: 'wall_b', segment: { start: { x: 4.1, z: -0.1 }, end: { x: 4.1, z: 3 } } },
    ]);
    expect(
      resolveSnapPoint({ x: 4.12, z: -0.12 }, candidates, points, { levelId: 'level_1' }),
    ).toMatchObject({
      kind: 'point',
      targetKind: 'anchor',
      point: { x: 4.1, z: -0.1 },
    });
    expect(
      resolveSnapPoint(
        { x: 4.05, z: 0.1 },
        candidates,
        { ...lines, tolerance: 0.04 },
        { levelId: 'level_1' },
      ).kind,
    ).toBe('raw');
    expect(document).toEqual(before);
  });

  test('join anchors include contributing owners while unrelated endpoints and face segments stay local', () => {
    const candidates = buildEffectiveWallSnapCandidates(corner(), 'level_1');
    const joined = candidates.filter(
      (candidate) =>
        candidate.point &&
        ((candidate.point.x === 4.1 && candidate.point.z === -0.1) ||
          (candidate.point.x === 3.9 && candidate.point.z === 0.1)),
    );
    expect(joined).toHaveLength(4);
    expect(
      joined.every((candidate) => candidate.relatedObjectIds?.join() === 'wall_a,wall_b'),
    ).toBe(true);
    expect(
      candidates
        .filter((candidate) => candidate.segment)
        .every((candidate) => candidate.relatedObjectIds?.join() === candidate.objectId),
    ).toBe(true);
    const outerStart = candidates.find(
      (candidate) => candidate.point?.x === 0 && candidate.point.z === -0.1,
    )!;
    expect(outerStart.relatedObjectIds).toEqual(['wall_a']);
    for (const excludeId of ['wall_a', 'wall_b']) {
      expect(
        resolveSnapPoint({ x: 4.12, z: -0.12 }, candidates, points, {
          levelId: 'level_1',
          excludeId,
        }).kind,
      ).toBe('raw');
    }
  });

  test('only current-level walls participate even when another level has matching footprints', () => {
    const document = corner();
    document.levels.push({ id: 'level_2', name: '2', elevation: 3, height: 3 });
    const ghost = createWall('level_2', { x: 4, z: 0 }, { x: 4, z: -3 });
    ghost.id = 'ghost';
    document.walls.push(ghost);
    expect(buildEffectiveWallSnapCandidates(document, 'level_1')).toEqual(
      buildEffectiveWallSnapCandidates(corner(), 'level_1'),
    );
    const upper = buildEffectiveWallSnapCandidates(document, 'level_2');
    expect(
      upper.every(
        (candidate) => candidate.objectId === ghost.id && candidate.levelId === 'level_2',
      ),
    ).toBe(true);
    expect(upper).toHaveLength(6);
    expect(buildEffectiveWallSnapCandidates(document, 'missing')).toEqual([]);
  });

  test('wall order, face materials and continuity routing do not change candidate IDs or geometry', () => {
    const document = corner();
    const expected = buildEffectiveWallSnapCandidates(document, 'level_1');
    document.walls.reverse();
    document.walls[0]!.materials.A.tileWidth = 0.75;
    document.walls[1]!.materials.B.rotation = 35;
    document.continuity.push({
      id: 'boundary_route',
      members: [
        { wallId: 'wall_a', side: 'B', direction: 1 },
        { wallId: 'wall_b', side: 'B', direction: 1 },
      ],
      anchor: { wallId: 'wall_b', side: 'B', endpoint: 'end' },
      verticalOrigin: 1.25,
    });
    expect(buildEffectiveWallSnapCandidates(document, 'level_1')).toEqual(expected);
    for (const objectId of ['wall_a', 'wall_b']) {
      expect(
        expected
          .filter((candidate) => candidate.objectId === objectId && candidate.segment)
          .map((candidate) => candidate.index),
      ).toEqual([0, 1]);
    }
  });

  test('opening holes keep footprint routes intact because core provides independent opening corners', () => {
    const document = corner();
    const expected = buildEffectiveWallSnapCandidates(document, 'level_1');
    document.openings.push(createOpening(document.walls[0]!, 'door', 1));
    expect(buildEffectiveWallSnapCandidates(document, 'level_1')).toEqual(expected);
    expect(
      expected.every(
        (candidate) => candidate.targetKind === 'wall-edge' || candidate.targetKind === 'anchor',
      ),
    ).toBe(true);
  });
});
