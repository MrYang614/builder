import type { Opening, ProjectDocument, Vec2, Wall } from '@building/editor-core';
import { cuts, overlap, ownerAt, solids } from './solids';
import type { Point3, WallSolid } from './types';

export interface PlanEdge {
  start: Vec2;
  end: Vec2;
}

export interface PlanWallFootprint {
  wallId: string;
  /** Fill only: adjacent footprints overlap at joins just as the shared wall solids do. */
  polygon: Vec2[];
  /** Stroke separately: only the exposed union boundary, including free end caps. */
  edges: PlanEdge[];
}

export interface PlanOpening {
  polygon: Vec2[];
  start: Vec2;
  end: Vec2;
  hinge: Vec2;
  leafEnd: Vec2;
  leafWidth: number;
  /** World-space points from the formal closed angle to open angle, preserving signed sweeps. */
  swing: Vec2[];
}

function boundaryEdges(solid: WallSolid, all: WallSolid[]): PlanEdge[] {
  const local = all.filter((other) => overlap(solid, other));
  const result: PlanEdge[] = [];
  for (const axis of ['x', 'z'] as const) {
    const alongX = axis === 'x';
    const along = cuts(
      alongX ? solid.minX : solid.minZ,
      alongX ? solid.maxX : solid.maxZ,
      local.flatMap((other) => (alongX ? [other.minX, other.maxX] : [other.minZ, other.maxZ])),
    );
    for (const sign of [-1, 1]) {
      const normal: Point3 = alongX ? [0, 0, sign] : [sign, 0, 0];
      const cross = alongX
        ? sign < 0
          ? solid.minZ
          : solid.maxZ
        : sign < 0
          ? solid.minX
          : solid.maxX;
      const point = (value: number): Vec2 =>
        alongX ? { x: value, z: cross } : { x: cross, z: value };
      let previous: PlanEdge | undefined;
      for (let index = 0; index < along.length - 1; index++) {
        const start = along[index];
        const end = along[index + 1];
        const center = point((start + end) / 2);
        // Like texture routes, the footprint ignores holes. Symbols expose them separately.
        const owner = ownerAt(
          local,
          [center.x, solid.base + Math.min(solid.wall.height / 2, 0.01), center.z],
          normal,
          true,
        );
        if (owner?.wall.id !== solid.wall.id) {
          previous = undefined;
          continue;
        }
        if (previous) {
          previous.end = point(end);
        } else {
          previous = { start: point(start), end: point(end) };
          result.push(previous);
        }
      }
    }
  }
  return result;
}

/** Projects the shared wall solids and ownership rules without allocating meshes or changing data. */
export function buildPlanWallFootprints(
  document: ProjectDocument,
  levelId: string,
): PlanWallFootprint[] {
  const scoped = { ...document, walls: document.walls.filter((wall) => wall.levelId === levelId) };
  const all = solids(scoped);
  return all.map((solid) => ({
    wallId: solid.wall.id,
    polygon: [
      { x: solid.minX, z: solid.minZ },
      { x: solid.maxX, z: solid.minZ },
      { x: solid.maxX, z: solid.maxZ },
      { x: solid.minX, z: solid.maxZ },
    ],
    edges: boundaryEdges(solid, all),
  }));
}

/** Absolute Three-compatible Y rotation; both the 3D leaf and plan symbol use formal door angles. */
export function doorRotationRadians(opening: Opening, wall?: Wall, angle = opening.angle): number {
  return (
    ((angle * Math.PI) / 180) *
    (opening.hinge === 'left' ? -1 : 1) *
    opening.direction *
    (wall?.surfaceOrientation ?? 1)
  );
}

/** Derives a symbolic gap and exact 3D leaf axis; no SVG coordinates or view scale enter the model. */
export function derivePlanOpening(wall: Wall, opening: Opening): PlanOpening {
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
  const dx = (wall.end.x - wall.start.x) / length;
  const dz = (wall.end.z - wall.start.z) / length;
  const point = (along: number, across = 0): Vec2 => ({
    x: wall.start.x + dx * along - dz * across,
    z: wall.start.z + dz * along + dx * across,
  });
  const bar = Math.min(0.06, opening.width / 8, opening.height / 8);
  const leafWidth = opening.width - 2 * bar;
  const sign = opening.hinge === 'left' ? 1 : -1;
  const hingeOffset = opening.offset + opening.width / 2 - (sign * leafWidth) / 2;
  const leafAt = (angle: number): Vec2 => {
    const radians = doorRotationRadians(opening, wall, angle);
    // Positive rotation around Three's Y axis sends local +X towards -Z.
    return point(
      hingeOffset + sign * leafWidth * Math.cos(radians),
      -sign * leafWidth * Math.sin(radians),
    );
  };
  const half = wall.thickness / 2;
  const closedAngle = opening.closedAngle ?? 0;
  const steps = Math.max(1, Math.ceil(Math.abs(opening.openAngle - closedAngle) / 5));
  return {
    polygon: [
      point(opening.offset, -half),
      point(opening.offset + opening.width, -half),
      point(opening.offset + opening.width, half),
      point(opening.offset, half),
    ],
    start: point(opening.offset),
    end: point(opening.offset + opening.width),
    hinge: point(hingeOffset),
    leafEnd: leafAt(opening.angle),
    leafWidth,
    swing: Array.from({ length: steps + 1 }, (_, index) =>
      leafAt(closedAngle + ((opening.openAngle - closedAngle) * index) / steps),
    ),
  };
}
