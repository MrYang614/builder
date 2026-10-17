import { describe, expect, it } from 'vitest';
import {
  createCourtyardProject,
  validateDocument,
  type ProjectDocument,
  type Slab,
  type Vec2,
  type Wall,
} from '@building/editor-core';

function bounds(points: Vec2[]) {
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minZ: Math.min(...points.map((point) => point.z)),
    maxZ: Math.max(...points.map((point) => point.z)),
  };
}

function overlapArea(a: Slab, b: Slab): number {
  const first = bounds(a.polygon),
    second = bounds(b.polygon);
  return (
    Math.max(0, Math.min(first.maxX, second.maxX) - Math.max(first.minX, second.minX)) *
    Math.max(0, Math.min(first.maxZ, second.maxZ) - Math.max(first.minZ, second.minZ))
  );
}

function expectClosedRing(walls: Wall[]): void {
  expect(walls).toHaveLength(8);
  const outer = walls.filter((wall) => wall.id.includes('_outer_'));
  const inner = walls.filter((wall) => wall.id.includes('_inner_'));
  for (const ring of [outer, inner]) {
    expect(ring).toHaveLength(4);
    const byName = new Map(ring.map((wall) => [wall.id.slice(wall.id.lastIndexOf('_') + 1), wall]));
    const ordered = ring[0]!.id.includes('_outer_')
      ? ['rear', 'right', 'front', 'left']
      : ['south', 'east', 'north', 'west'];
    for (let index = 0; index < ordered.length; index += 1) {
      const current = byName.get(ordered[index]!)!;
      const next = byName.get(ordered[(index + 1) % ordered.length]!)!;
      expect(current.end).toEqual(next.start);
    }
  }
}

function floorSlabs(document: ProjectDocument, levelId: string): Slab[] {
  return document.slabs.filter(
    (slab) =>
      slab.levelId === levelId && slab.purpose === 'floor' && slab.id.includes('_floor_wing_'),
  );
}

describe('courtyard project topology', () => {
  it('creates two closed wall rings and four non-overlapping wings on each floor', () => {
    const document = createCourtyardProject('CLI Courtyard');

    expect(validateDocument(document)).toEqual({ ok: true });
    expect(document.levels.map((level) => level.id)).toEqual(['level_1', 'level_2']);
    for (const level of document.levels) {
      expectClosedRing(document.walls.filter((wall) => wall.levelId === level.id));
      const wings = floorSlabs(document, level.id);
      expect(wings).toHaveLength(4);
      for (let i = 0; i < wings.length; i += 1) {
        for (let j = i + 1; j < wings.length; j += 1) {
          expect(overlapArea(wings[i]!, wings[j]!)).toBe(0);
        }
      }
    }
  });

  it('keeps the courtyard open to the sky and hosts every opening on its level ring', () => {
    const document = createCourtyardProject();
    const court = { minX: -3, maxX: 3, minZ: -2.5, maxZ: 2.5 };
    const roof = document.slabs.filter((slab) => slab.purpose === 'roof');
    expect(roof).toHaveLength(4);
    for (const slab of roof) {
      const box = bounds(slab.polygon);
      const xOverlap = Math.max(0, Math.min(box.maxX, court.maxX) - Math.max(box.minX, court.minX));
      const zOverlap = Math.max(0, Math.min(box.maxZ, court.maxZ) - Math.max(box.minZ, court.minZ));
      expect(xOverlap * zOverlap).toBe(0);
    }

    expect(document.openings).toHaveLength(16);
    for (const opening of document.openings) {
      const wall = document.walls.find((candidate) => candidate.id === opening.wallId);
      expect(wall).toBeDefined();
      expect(opening.levelId).toBe(wall!.levelId);
      expect(opening.id.startsWith(`${opening.levelId}_`)).toBe(true);
      const hostRole = opening.id.match(
        /_(front_door|court_door|rear_window_[lr]|right_window|left_window|court_window_[ew])$/,
      )?.[1];
      const expectedWallRole = {
        front_door: 'outer_front',
        court_door: 'inner_south',
        rear_window_l: 'outer_rear',
        rear_window_r: 'outer_rear',
        right_window: 'outer_right',
        left_window: 'outer_left',
        court_window_e: 'inner_east',
        court_window_w: 'inner_west',
      }[hostRole ?? ''];
      expect(hostRole).toBeDefined();
      expect(wall!.id).toBe(`${opening.levelId}_${expectedWallRole}`);
    }
    expect(document.openings.filter((opening) => opening.kind === 'door')).toHaveLength(4);
    expect(document.openings.filter((opening) => opening.kind === 'window')).toHaveLength(12);
  });

  it('rejects coplanar solid slab overlap while allowing shared edges', () => {
    const document = createCourtyardProject();
    const duplicate = { ...document.slabs[0]!, id: 'overlapping_slab' };
    document.slabs.push(duplicate);
    expect(validateDocument(document)).toMatchObject({
      ok: false,
      error: { code: 'slab.overlap' },
    });
  });
});
