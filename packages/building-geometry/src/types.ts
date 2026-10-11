import type { Wall, Vec2 } from '@building/editor-core';

/** A tolerance in metres; geometry remains independent of rendering and platform APIs. */
export const GEOMETRY_EPSILON = 1e-7;
export type Point3 = [number, number, number];
export type SurfaceRole = 'A' | 'B' | 'top' | 'bottom' | 'edge' | 'reveal';
export interface GeometryGroup {
  start: number;
  count: number;
  role: SurfaceRole;
  materialIndex: number;
}
export interface GeometryData {
  objectId: string;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  groups: GeometryGroup[];
}
export interface SurfaceSegment {
  wallId: string;
  side: 'A' | 'B';
  start: Vec2;
  end: Vec2;
  /** Distances along the actual outside/inside boundary, before physical tile scaling. */
  startDistance: number;
  endDistance: number;
  verticalOrigin: number;
}
export interface SurfacePath {
  id: string;
  segments: SurfaceSegment[];
  closed: boolean;
  seam: Vec2;
  length: number;
}
export interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}
export interface WallSolid extends Box {
  wall: Wall;
  dx: number;
  dz: number;
  base: number;
  holes: Box[];
}
