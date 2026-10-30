import type { ProjectDocument, Vec2 } from '@building/editor-core';

export interface PlanCamera {
  center: Vec2;
  pixelsPerMeter: number;
}
export interface PlanSize {
  width: number;
  height: number;
}
export interface PlanRect extends PlanSize {
  left: number;
  top: number;
}
export interface PlanPoint {
  x: number;
  y: number;
}

/** Plan +Y follows world +Z; physical metres remain independent of SVG scaling. */
export function worldToPlan(point: Vec2): PlanPoint {
  return { x: point.x, y: point.z };
}
/** Reverses the single XZ-to-SVG mapping without quantizing formal coordinates. */
export function planToWorld(point: PlanPoint): Vec2 {
  return { x: point.x, z: point.y };
}
/** Client coordinates and SVG bounds are CSS pixels: devicePixelRatio is deliberately not applied. */
export function screenToPlan(point: PlanPoint, rect: PlanRect, camera: PlanCamera): Vec2 {
  return {
    x: camera.center.x + (point.x - rect.left - rect.width / 2) / camera.pixelsPerMeter,
    z: camera.center.z + (point.y - rect.top - rect.height / 2) / camera.pixelsPerMeter,
  };
}
/** Maps a physical point to client CSS pixels using the same camera as pointer input. */
export function planToScreen(point: Vec2, rect: PlanRect, camera: PlanCamera): PlanPoint {
  return {
    x: rect.left + rect.width / 2 + (point.x - camera.center.x) * camera.pixelsPerMeter,
    y: rect.top + rect.height / 2 + (point.z - camera.center.z) * camera.pixelsPerMeter,
  };
}
/** Fits only the active floor, leaving an empty floor centered at the origin. */
export function fitPlanCamera(
  document: ProjectDocument,
  levelId: string,
  size: PlanSize,
): PlanCamera {
  const points = document.walls
    .filter((wall) => wall.levelId === levelId)
    .flatMap((wall) => [wall.start, wall.end])
    .concat(
      document.slabs.filter((slab) => slab.levelId === levelId).flatMap((slab) => slab.polygon),
    );
  if (!points.length) {
    return { center: { x: 0, z: 0 }, pixelsPerMeter: 50 };
  }
  const xs = points.map((point) => point.x),
    zs = points.map((point) => point.z);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minZ = Math.min(...zs),
    maxZ = Math.max(...zs);
  return {
    center: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 },
    pixelsPerMeter: Math.max(
      2,
      Math.min(
        120,
        Math.max(1, size.width - 96) / Math.max(2, maxX - minX + 1),
        Math.max(1, size.height - 96) / Math.max(2, maxZ - minZ + 1),
      ),
    ),
  };
}
/** Wheel zoom preserves the physical point under the cursor; zoom never mutates the project. */
export function zoomPlanCamera(camera: PlanCamera, anchor: Vec2, delta: number): PlanCamera {
  const pixelsPerMeter = Math.max(
    2,
    Math.min(800, camera.pixelsPerMeter * Math.exp(-delta * 0.001)),
  );
  const ratio = camera.pixelsPerMeter / pixelsPerMeter;
  return {
    pixelsPerMeter,
    center: {
      x: anchor.x - (anchor.x - camera.center.x) * ratio,
      z: anchor.z - (anchor.z - camera.center.z) * ratio,
    },
  };
}
