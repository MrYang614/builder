import {
  rectanglePolygon,
  wallLength,
  type Opening,
  type Slab,
  type Vec2,
  type Wall,
} from '@building/editor-core';

/** Builds a transient draft from the retained grab anchor; formal state changes only on commit. */
export function dragGeometry(
  initial: Wall | Slab | Opening,
  start: Vec2,
  point: Vec2,
  endpoint?: 'start' | 'end',
  corner?: number,
  host?: Wall,
  exact = false,
): Wall | Slab | Opening {
  const dx = point.x - start.x;
  const dz = point.z - start.z;
  const translate = (vertex: Vec2): Vec2 =>
    exact && vertex.x === start.x && vertex.z === start.z
      ? { ...point }
      : { x: vertex.x + dx, z: vertex.z + dz };
  if ('start' in initial) {
    if (endpoint) {
      const other = endpoint === 'start' ? initial.end : initial.start;
      const end =
        Math.abs(initial.end.x - initial.start.x) > 0.001
          ? { x: point.x, z: other.z }
          : { x: other.x, z: point.z };
      return { ...initial, [endpoint]: end };
    }
    return {
      ...initial,
      start: translate(initial.start),
      end: translate(initial.end),
    };
  }
  if ('polygon' in initial) {
    return {
      ...initial,
      polygon:
        corner === undefined
          ? initial.polygon.map(translate)
          : rectanglePolygon(
              translate(initial.polygon[corner]!),
              initial.polygon[(corner + 2) % 4]!,
            ),
    };
  }
  if (!host || wallLength(host) < 1e-7) {
    return initial;
  }
  const offset =
    initial.offset +
    (dx * (host.end.x - host.start.x) + dz * (host.end.z - host.start.z)) / wallLength(host);
  return { ...initial, offset };
}
