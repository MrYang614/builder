import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SNAP_SETTINGS,
  buildSnapCandidates,
  createEmptyProject,
  createOpening,
  createSlab,
  createWall,
  prepareSnapCandidates,
  resolveSnapPoint,
  snapDocumentPoint,
  type SnapCandidate,
  type SnapSettings,
} from '@building/editor-core';

const settings = (patch: Partial<SnapSettings> = {}): SnapSettings => ({
  ...DEFAULT_SNAP_SETTINGS,
  ...patch,
});

function segment(
  id: string,
  start: { x: number; z: number },
  end: { x: number; z: number },
): SnapCandidate {
  return {
    objectId: id,
    levelId: 'level_1',
    targetKind: 'wall-centerline',
    segment: { start, end },
  };
}

describe('pure geometric snapping', () => {
  it('snaps to a wall endpoint before a line projection', () => {
    const doc = createEmptyProject();
    const wall = createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 0 });
    wall.id = 'wall-a';
    doc.walls.push(wall);
    const result = snapDocumentPoint({ x: 0.04, z: 0.02 }, doc, settings(), { levelId: 'level_1' });
    expect(result).toMatchObject({
      point: { x: 0, z: 0 },
      kind: 'point',
      targetKind: 'wall-endpoint',
      objectId: 'wall-a',
    });
  });

  it('labels a shared wall endpoint as a deterministic junction', () => {
    const doc = createEmptyProject();
    const first = createWall('level_1', { x: 0, z: 0 }, { x: 2, z: 0 });
    first.id = 'wall-a';
    const second = createWall('level_1', { x: 2, z: 0 }, { x: 2, z: 2 });
    second.id = 'wall-b';
    doc.walls.push(first, second);
    const result = snapDocumentPoint({ x: 2.02, z: 0.01 }, doc, settings(), {
      levelId: 'level_1',
    });
    expect(result).toMatchObject({ targetKind: 'wall-junction', point: { x: 2, z: 0 } });
  });

  it('snaps slab vertices and opening corners with stable metadata', () => {
    const doc = createEmptyProject();
    const wall = createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 0 });
    wall.id = 'wall-a';
    doc.walls.push(wall);
    const opening = createOpening(wall, 'door', 1);
    opening.id = 'door-a';
    doc.openings.push(opening);
    const slab = createSlab('level_1', { x: 1, z: 1 }, { x: 3, z: 3 });
    slab.id = 'slab-a';
    doc.slabs.push(slab);
    const candidates = buildSnapCandidates(doc, { levelId: 'level_1' });
    expect(candidates.some((c) => c.targetKind === 'slab-vertex' && c.objectId === 'slab-a')).toBe(
      true,
    );
    expect(
      candidates.some((c) => c.targetKind === 'opening-corner' && c.objectId === 'door-a'),
    ).toBe(true);
    expect(
      snapDocumentPoint({ x: 1.02, z: 1.03 }, doc, settings(), { levelId: 'level_1' }).targetKind,
    ).toBe('slab-vertex');
  });

  it('projects to a finite line segment and keeps a distant point raw', () => {
    const candidate: SnapCandidate = {
      objectId: 'wall-a',
      levelId: 'level_1',
      targetKind: 'wall-centerline',
      segment: { start: { x: 0, z: 0 }, end: { x: 4, z: 0 } },
    };
    expect(resolveSnapPoint({ x: 2, z: 0.1 }, [candidate], settings())).toMatchObject({
      kind: 'line',
      point: { x: 2, z: 0 },
    });
    expect(resolveSnapPoint({ x: 8, z: 0 }, [candidate], settings({ mode: 'lines' }))).toEqual({
      point: { x: 8, z: 0 },
      kind: 'raw',
      distance: 0,
    });
  });

  it('uses deterministic object and index tie breakers regardless of input order', () => {
    const candidates: SnapCandidate[] = [
      {
        objectId: 'z-object',
        levelId: 'level_1',
        targetKind: 'anchor',
        point: { x: 1, z: 0 },
        index: 0,
      },
      {
        objectId: 'a-object',
        levelId: 'level_1',
        targetKind: 'anchor',
        point: { x: 1, z: 0 },
        index: 0,
      },
    ];
    const reversed = resolveSnapPoint({ x: 1, z: 0 }, [...candidates].reverse(), settings());
    const ordered = resolveSnapPoint({ x: 1, z: 0 }, candidates, settings());
    expect(reversed).toEqual(ordered);
    expect(ordered.objectId).toBe('a-object');
  });

  it('filters the active object and all other floors, including transient sources', () => {
    const candidate: SnapCandidate = {
      objectId: 'active',
      levelId: 'level_1',
      targetKind: 'anchor',
      point: { x: 0, z: 0 },
    };
    const otherFloor: SnapCandidate = { ...candidate, objectId: 'other-floor', levelId: 'level_2' };
    const ghost: SnapCandidate = { ...candidate, objectId: 'ghost', source: 'ghost' };
    const doc = createEmptyProject();
    const wall = createWall('level_1', { x: 0, z: 0 }, { x: 2, z: 0 });
    wall.id = 'active';
    doc.walls.push(wall);
    expect(
      snapDocumentPoint({ x: 0.01, z: 0 }, doc, settings(), {
        levelId: 'level_1',
        excludeId: 'active',
        anchors: [otherFloor, ghost],
      }),
    ).toMatchObject({ kind: 'grid', point: { x: 0, z: 0 } });
  });

  it('handles degenerate segments and disabled snapping without changing raw input', () => {
    const degenerate: SnapCandidate = {
      objectId: 'zero',
      levelId: 'level_1',
      targetKind: 'wall-centerline',
      segment: { start: { x: 0, z: 0 }, end: { x: 0, z: 0 } },
    };
    expect(
      resolveSnapPoint({ x: 0, z: 0 }, [degenerate], settings({ mode: 'lines' })),
    ).toMatchObject({
      kind: 'raw',
      point: { x: 0, z: 0 },
    });
    expect(
      resolveSnapPoint({ x: 0.03, z: 0.02 }, [degenerate], settings({ enabled: false })),
    ).toEqual({
      point: { x: 0.03, z: 0.02 },
      kind: 'raw',
      distance: 0,
    });
  });

  it('returns intersections before line projections when two segments cross', () => {
    const candidates: SnapCandidate[] = [
      {
        objectId: 'horizontal',
        levelId: 'level_1',
        targetKind: 'wall-centerline',
        segment: { start: { x: -2, z: 0 }, end: { x: 2, z: 0 } },
      },
      {
        objectId: 'vertical',
        levelId: 'level_1',
        targetKind: 'wall-centerline',
        segment: { start: { x: 0, z: -2 }, end: { x: 0, z: 2 } },
      },
    ];
    expect(resolveSnapPoint({ x: 0.02, z: 0.03 }, candidates, settings())).toMatchObject({
      kind: 'point',
      targetKind: 'intersection',
      point: { x: 0, z: 0 },
    });
  });

  it('accepts the metric tolerance boundary and rejects the next representable distance', () => {
    const candidates: SnapCandidate[] = [
      {
        objectId: 'node',
        levelId: 'level_1',
        targetKind: 'anchor',
        point: { x: 0, z: 0 },
      },
    ];
    const config = settings({ mode: 'points', tolerance: 0.125 });
    expect(resolveSnapPoint({ x: 0.125, z: 0 }, candidates, config).kind).toBe('point');
    const outside = { x: 0.125 + Number.EPSILON, z: 0 };
    expect(resolveSnapPoint(outside, candidates, config)).toEqual({
      point: outside,
      kind: 'raw',
      distance: 0,
    });
  });

  it('preserves stored metre coordinates exactly and does not round projected coordinates', () => {
    const node = { x: 99999.876543211, z: -99998.012345679 };
    const candidate: SnapCandidate = {
      objectId: 'metric',
      levelId: 'level_1',
      targetKind: 'anchor',
      point: node,
    };
    const config = settings({ mode: 'points' });
    const result = resolveSnapPoint({ x: node.x + 0.01, z: node.z - 0.02 }, [candidate], config);
    expect(result.point).toEqual(node);
    expect(result.point).not.toBe(node);
    const raw = { x: 0.123456789123, z: 0.012345678912 };
    const line = segment('line', { x: -1, z: 0 }, { x: 1, z: 0 });
    const projected = resolveSnapPoint(raw, [line], settings({ mode: 'lines' }));
    expect(projected.point.x).toBeCloseTo(raw.x, 14);
    expect(projected.point.z).toBe(0);
    expect(projected.distance).toBe(raw.z);
    expect(projected.segment).toEqual(line.segment);
  });

  it('keeps duplicate and overlapping lines deterministic without inventing intersections', () => {
    const full = segment('a-line', { x: 0, z: 0 }, { x: 4, z: 0 });
    const overlap = segment('b-line', { x: 1, z: 0 }, { x: 3, z: 0 });
    const parallel = segment('c-line', { x: 0, z: 1 }, { x: 4, z: 1 });
    const candidates = [full, overlap, parallel, { ...full }];
    const prepared = prepareSnapCandidates(candidates);
    expect(prepared.filter((candidate) => candidate.targetKind === 'intersection')).toHaveLength(0);
    const raw = { x: 2, z: 0.05 };
    const config = settings({ mode: 'lines' });
    const forward = resolveSnapPoint(raw, prepared, config, { prepared: true });
    const reversed = resolveSnapPoint(
      raw,
      prepareSnapCandidates([...candidates].reverse()),
      config,
      { prepared: true },
    );
    expect(reversed).toEqual(forward);
    expect(forward).toMatchObject({ objectId: 'a-line', point: { x: 2, z: 0 }, kind: 'line' });
  });

  it('precomputes unique intersections once and gives prepared queries the same result', () => {
    const a = segment('a-line', { x: -2, z: 0 }, { x: 2, z: 0 });
    const b = segment('b-line', { x: 0, z: -2 }, { x: 0, z: 2 });
    const candidates = [a, b, { ...a }];
    const prepared = prepareSnapCandidates(candidates);
    expect(prepared.filter((candidate) => candidate.targetKind === 'intersection')).toHaveLength(1);
    expect(prepareSnapCandidates(prepared)).toEqual(prepared);
    const raw = { x: 0.04, z: 0.03 };
    expect(resolveSnapPoint(raw, prepared, settings(), { prepared: true })).toEqual(
      resolveSnapPoint(raw, candidates, settings()),
    );
    expect(
      resolveSnapPoint(raw, prepared, settings(), { prepared: true }).relatedObjectIds,
    ).toEqual(['a-line', 'b-line']);
  });

  it('breaks otherwise identical overlapping-line ties by segment end and ownership', () => {
    const short = segment('same-owner', { x: 0, z: 0 }, { x: 2, z: 0 });
    const long = segment('same-owner', { x: 0, z: 0 }, { x: 4, z: 0 });
    const ownedA = { ...short, relatedObjectIds: ['a-source', 'z-source'] };
    const ownedZ = { ...short, relatedObjectIds: ['z-source'] };
    const reorderedA = { ...short, relatedObjectIds: ['z-source', 'a-source'] };
    const config = settings({ mode: 'lines' });
    const raw = { x: 1, z: 0.05 };
    for (const candidates of [
      [long, short],
      [ownedZ, ownedA],
      [reorderedA, ownedA],
    ]) {
      const before = structuredClone(candidates);
      const forward = resolveSnapPoint(raw, candidates, config);
      const reversed = resolveSnapPoint(raw, [...candidates].reverse(), config);
      expect(reversed).toEqual(forward);
      const prepared = prepareSnapCandidates(candidates);
      expect(resolveSnapPoint(raw, prepared, config, { prepared: true })).toEqual(forward);
      expect(resolveSnapPoint(raw, [...prepared].reverse(), config, { prepared: true })).toEqual(
        forward,
      );
      expect(candidates).toEqual(before);
    }
    expect(resolveSnapPoint(raw, [long, short], config).segment).toEqual(short.segment);
    expect(resolveSnapPoint(raw, [ownedZ, ownedA], config).relatedObjectIds).toEqual([
      'a-source',
      'z-source',
    ]);
  });

  it('queries a prepared cache without revisiting segment pairs or rebuilding bounds', () => {
    let segmentReads = 0;
    const candidates = Array.from({ length: 120 }, (_, index) => {
      const candidate = segment(`line-${index}`, { x: 0, z: index }, { x: 4, z: index });
      const geometry = candidate.segment;
      Object.defineProperty(candidate, 'segment', {
        get() {
          segmentReads += 1;
          return geometry;
        },
      });
      return candidate;
    });
    const prepared = prepareSnapCandidates(candidates);
    segmentReads = 0;
    const result = resolveSnapPoint({ x: 2, z: 0.05 }, prepared, settings(), { prepared: true });
    expect(result.objectId).toBe('line-0');
    // Each source is read only for validation and projection; an index rebuild needs more reads.
    expect(segmentReads).toBeLessThanOrEqual(candidates.length * 6);
  });

  it('directly excludes either intersection source and hosted opening corners', () => {
    const a = segment('a-line', { x: -2, z: 0 }, { x: 2, z: 0 });
    const b = segment('b-line', { x: 0, z: -2 }, { x: 0, z: 2 });
    const candidates = prepareSnapCandidates([a, b]);
    const raw = { x: 0.04, z: 0.03 };
    for (const excludedId of ['a-line', 'b-line']) {
      expect(
        resolveSnapPoint(raw, candidates, settings({ mode: 'points' }), {
          excludeId: excludedId,
          prepared: true,
        }).kind,
      ).toBe('raw');
    }
    expect(
      resolveSnapPoint(raw, [a, b], settings({ mode: 'lines' }), { excludeId: 'a-line' }),
    ).toMatchObject({ objectId: 'b-line', point: { x: 0, z: 0.03 } });
    const doc = createEmptyProject();
    const wall = createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 0 });
    wall.id = 'host';
    doc.walls.push(wall);
    doc.openings.push(createOpening(wall, 'window', 1));
    const openingCandidates = buildSnapCandidates(doc, { levelId: 'level_1' }).filter(
      (candidate) => candidate.targetKind === 'opening-corner',
    );
    const corner = openingCandidates[0]!.point!;
    expect(
      resolveSnapPoint(corner, openingCandidates, settings({ mode: 'points' }), {
        excludeId: 'host',
      }).kind,
    ).toBe('raw');
  });

  it('derives junctions after independently cached wall groups are combined', () => {
    const doc = createEmptyProject();
    const a = createWall('level_1', { x: 0, z: 0 }, { x: 2, z: 0 });
    a.id = 'a';
    const b = createWall('level_1', { x: 2, z: 0 }, { x: 2, z: 2 });
    b.id = 'b';
    const groupA = buildSnapCandidates({ ...doc, walls: [a] }, { levelId: 'level_1' });
    const groupB = buildSnapCandidates({ ...doc, walls: [b] }, { levelId: 'level_1' });
    const combined = prepareSnapCandidates([...groupA, ...groupB]);
    expect(combined.filter((candidate) => candidate.targetKind === 'wall-junction')).toHaveLength(
      2,
    );
    expect(
      resolveSnapPoint({ x: 2.01, z: 0.02 }, combined, settings(), { prepared: true }).targetKind,
    ).toBe('wall-junction');
    expect(
      prepareSnapCandidates(combined, { excludeId: 'a' }).filter(
        (candidate) => candidate.targetKind === 'wall-junction',
      ),
    ).toHaveLength(0);
  });

  it('preserves explicitly supplied junction nodes while replacing only derived junctions', () => {
    const explicit: SnapCandidate = {
      objectId: 'junction-owner',
      levelId: 'level_1',
      targetKind: 'wall-junction',
      point: { x: 1.25, z: 2.5 },
    };
    const generated: SnapCandidate = {
      ...explicit,
      objectId: 'old-source',
      point: { x: 3, z: 4 },
      relatedObjectIds: ['old-source', 'deleted-source'],
    };
    const prepared = prepareSnapCandidates([explicit, generated]);
    expect(prepared).toEqual([explicit]);
    expect(prepareSnapCandidates(prepared)).toEqual(prepared);
    expect(resolveSnapPoint({ x: 1.27, z: 2.51 }, [explicit], settings())).toMatchObject({
      targetKind: 'wall-junction',
      objectId: 'junction-owner',
      point: explicit.point,
    });
  });

  it('rejects point targets off a locked editing axis and accepts metric tolerance', () => {
    const offAxis: SnapCandidate = {
      objectId: 'off-axis',
      levelId: 'level_1',
      targetKind: 'wall-endpoint',
      point: { x: 1, z: 0.05 },
    };
    const raw = { x: 1.02, z: 0 };
    const config = settings({ mode: 'points' });
    expect(resolveSnapPoint(raw, [offAxis], config, { constraint: { z: 0 } })).toEqual({
      point: raw,
      kind: 'raw',
      distance: 0,
    });
    const boundary: SnapCandidate = { ...offAxis, point: { x: 1, z: 1e-7 } };
    expect(resolveSnapPoint(raw, [boundary], config, { constraint: { z: 0 } }).kind).toBe('point');
    const outside: SnapCandidate = { ...offAxis, point: { x: 1, z: 1e-7 + Number.EPSILON } };
    expect(resolveSnapPoint(raw, [outside], config, { constraint: { z: 0 } }).kind).toBe('raw');
  });

  it('selects a valid line projection and rejects nearer projections on a different axis', () => {
    const valid = segment('valid', { x: 0, z: 0 }, { x: 4, z: 0 });
    const invalid = segment('off-axis', { x: 0, z: 0.01 }, { x: 4, z: 0.01 });
    const raw = { x: 2.03456789, z: 0 };
    expect(
      resolveSnapPoint(raw, [invalid, valid], settings({ mode: 'lines' }), {
        constraint: { z: 0 },
      }),
    ).toMatchObject({ kind: 'line', objectId: 'valid', point: raw, segment: valid.segment });
    expect(
      resolveSnapPoint(raw, [invalid], settings({ mode: 'lines' }), {
        constraint: { z: 0 },
      }).kind,
    ).toBe('raw');
    const vertical = segment('vertical', { x: 2.03456789, z: -1 }, { x: 2.03456789, z: 3 });
    expect(
      resolveSnapPoint(raw, [vertical], settings({ mode: 'lines' }), {
        constraint: { x: raw.x },
      }).point,
    ).toEqual(raw);
  });

  it('quantizes only unlocked grid coordinates and leaves disabled raw input unchanged', () => {
    const raw = { x: 0.14, z: 0.047123456789 };
    expect(
      resolveSnapPoint(raw, [], settings({ mode: 'grid' }), {
        constraint: { z: raw.z },
      }),
    ).toMatchObject({ kind: 'grid', point: { x: 0.1, z: raw.z } });
    expect(
      resolveSnapPoint(raw, [], settings({ enabled: false }), {
        constraint: { x: 20, z: 30 },
      }),
    ).toEqual({ kind: 'raw', point: raw, distance: 0 });
    expect(
      resolveSnapPoint(raw, [], settings({ mode: 'off' }), {
        constraint: { x: 20, z: 30 },
      }),
    ).toEqual({ kind: 'raw', point: raw, distance: 0 });
  });

  it('measures constrained point and line tolerance from the unprojected effective anchor', () => {
    const raw = { x: 4, z: 0 };
    const point: SnapCandidate = {
      objectId: 'on-axis-endpoint',
      levelId: 'level_1',
      targetKind: 'wall-endpoint',
      point: raw,
    };
    const line = segment('on-axis-line', { x: 0, z: 0 }, { x: 8, z: 0 });
    const config = settings({ tolerance: 0.16 });
    for (const [candidate, mode] of [
      [point, 'points'],
      [line, 'lines'],
    ] as const) {
      expect(
        resolveSnapPoint(
          raw,
          [candidate],
          { ...config, mode },
          {
            constraint: { z: 0 },
            distanceOrigin: { x: 4, z: 0.5 },
          },
        ),
      ).toEqual({ point: raw, kind: 'raw', distance: 0 });
      const result = resolveSnapPoint(
        raw,
        [candidate],
        { ...config, mode },
        {
          constraint: { z: 0 },
          distanceOrigin: { x: 4, z: 0.12 },
        },
      );
      expect(result.point).toEqual(raw);
      expect(result.distance).toBe(0.12);
      expect(result.kind).toBe(mode === 'points' ? 'point' : 'line');
    }
    const doc = createEmptyProject();
    doc.walls.push(createWall('level_1', { x: 0, z: 0 }, raw));
    expect(
      snapDocumentPoint(
        raw,
        doc,
        { ...config, mode: 'points' },
        {
          levelId: 'level_1',
          constraint: { z: 0 },
          distanceOrigin: { x: 4, z: 0.5 },
        },
      ),
    ).toEqual({ point: raw, kind: 'raw', distance: 0, levelId: 'level_1' });
  });

  it('rejects distant constrained grid targets and keeps off input independent of distance origin', () => {
    const raw = { x: 4.03, z: 0 };
    const options = { constraint: { z: 0 }, distanceOrigin: { x: 4.03, z: 0.5 } };
    expect(resolveSnapPoint(raw, [], settings({ mode: 'grid' }), options)).toEqual({
      point: raw,
      kind: 'raw',
      distance: 0,
    });
    const nearby = resolveSnapPoint(raw, [], settings({ mode: 'grid' }), {
      ...options,
      distanceOrigin: { x: 4.03, z: 0.12 },
    });
    expect(nearby).toMatchObject({ point: { x: 4, z: 0 }, kind: 'grid' });
    expect(nearby.distance).toBe(Math.hypot(raw.x - 4, 0.12));
    for (const config of [settings({ enabled: false }), settings({ mode: 'off' })]) {
      expect(resolveSnapPoint(raw, [], config, options)).toEqual({
        point: raw,
        kind: 'raw',
        distance: 0,
      });
    }
  });
});
