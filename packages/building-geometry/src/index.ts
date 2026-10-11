export { GEOMETRY_EPSILON } from './types';
export type {
  GeometryData,
  GeometryGroup,
  SurfacePath,
  SurfaceRole,
  SurfaceSegment,
} from './types';
export { deriveSurfacePaths } from './surface-paths';
export {
  buildGeometry,
  buildWallGeometry,
  buildSlabGeometry,
  prepareGeometry,
  surfaceAtTriangle,
} from './meshes';
export { buildEffectiveWallSnapCandidates } from './snap-boundaries';
