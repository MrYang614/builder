import type { ProjectDocument } from './model';
import { wallLength } from './model';
import {
  ENVIRONMENT_LIMITS,
  environmentResourceBytes,
  inspectEnvironmentBytes,
} from './environment';
import {
  EPSILON,
  allowed,
  fail,
  finite,
  id,
  point,
  pointOnSegment,
  positive,
  samePoint,
  valid,
  validateBinding,
  validateOpening,
  validateWallPairs,
} from './validation-primitives';
import type { ValidationResult } from './validation-primitives';
export {
  EPSILON,
  fail,
  samePoint,
  validateBinding,
  validateOpening,
  wallsConnected,
  pointOnSegment,
} from './validation-primitives';
export type { DomainError, ValidationResult } from './validation-primitives';

const validatedResources = new WeakSet<object>();

/** Validate untrusted files without allowing partially installed documents. */
export function validateDocument(input: unknown): ValidationResult {
  try {
    if (!input || typeof input !== 'object') {
      return fail('project.invalid');
    }
    const d = input as ProjectDocument;
    if (d.schemaVersion !== 1) {
      return fail('project.unsupportedVersion', { version: Number(d.schemaVersion) || 0 });
    }
    if (
      !allowed(d, [
        'schemaVersion',
        'id',
        'name',
        'revision',
        'levels',
        'walls',
        'slabs',
        'openings',
        'resources',
        'continuity',
        'environment',
        'environmentResources',
      ])
    ) {
      return fail('project.unknownField');
    }
    if (
      !id(d.id) ||
      typeof d.name !== 'string' ||
      !Number.isSafeInteger(d.revision) ||
      d.revision < 0 ||
      ![d.levels, d.walls, d.slabs, d.openings, d.resources, d.continuity].every(Array.isArray)
    ) {
      return fail('project.invalid');
    }
    if (
      d.environmentResources !== undefined &&
      (!Array.isArray(d.environmentResources) ||
        d.environmentResources.length > ENVIRONMENT_LIMITS.maxResources)
    ) {
      return fail('environment.invalid');
    }
    if (!d.levels.length) {
      return fail('level.lastRequired');
    }
    if (
      d.levels.length > 500 ||
      d.walls.length > 10000 ||
      d.slabs.length > 10000 ||
      d.openings.length > 10000 ||
      d.resources.length > 1000 ||
      d.continuity.length > 20000
    ) {
      return fail('project.tooLarge');
    }
    const ids = new Set<string>();
    for (const object of [
      ...d.levels,
      ...d.walls,
      ...d.slabs,
      ...d.openings,
      ...d.resources,
      ...d.continuity,
      ...(d.environmentResources ?? []),
    ]) {
      if (!object || !id(object.id) || ids.has(object.id)) {
        return fail('object.duplicateId', { id: object?.id ?? '' });
      }
      ids.add(object.id);
    }
    const resources = new Set(d.resources.map((r) => r.id));
    const environmentIds = new Set((d.environmentResources ?? []).map((resource) => resource.id));
    if (d.environment !== undefined) {
      const settings = d.environment;
      if (
        !settings ||
        typeof settings !== 'object' ||
        !allowed(settings, ['resourceId', 'intensity', 'rotation', 'background'])
      ) {
        return fail('environment.invalid');
      }
      if (
        !finite(settings.intensity) ||
        settings.intensity < 0 ||
        settings.intensity > 10 ||
        !finite(settings.rotation) ||
        settings.rotation < 0 ||
        settings.rotation > 360 ||
        typeof settings.background !== 'boolean'
      ) {
        return fail('environment.invalid');
      }
      if (
        settings.resourceId !== undefined &&
        (!id(settings.resourceId) || !environmentIds.has(settings.resourceId))
      ) {
        return fail('environment.resourceMissing', { id: settings.resourceId });
      }
    }
    for (const resource of d.environmentResources ?? []) {
      if (Object.isFrozen(resource) && validatedResources.has(resource)) {
        continue;
      }
      if (!allowed(resource, ['id', 'name', 'mime', 'dataUrl'])) {
        return fail('project.unknownField');
      }
      if (
        typeof resource.name !== 'string' ||
        resource.name.length > 4096 ||
        !['image/vnd.radiance', 'image/x-exr', 'image/png', 'image/jpeg'].includes(resource.mime)
      ) {
        return fail('environment.invalidAsset');
      }
      try {
        if (inspectEnvironmentBytes(environmentResourceBytes(resource)).mime !== resource.mime) {
          return fail('environment.invalidAsset');
        }
      } catch (failure) {
        return fail(
          failure instanceof Error && 'code' in failure
            ? String(failure.code)
            : 'environment.invalidAsset',
        );
      }
      if (Object.isFrozen(resource)) {
        validatedResources.add(resource);
      }
    }
    for (const r of d.resources) {
      if (Object.isFrozen(r) && validatedResources.has(r)) {
        continue;
      }
      if (!allowed(r, ['id', 'name', 'mime', 'dataUrl'])) {
        return fail('project.unknownField');
      }
      if (
        typeof r.name !== 'string' ||
        !['image/png', 'image/jpeg'].includes(r.mime) ||
        typeof r.dataUrl !== 'string' ||
        !r.dataUrl.startsWith(`data:${r.mime};base64,`) ||
        r.dataUrl.length > 45_000_000 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(r.dataUrl.slice(r.dataUrl.indexOf(',') + 1))
      ) {
        return fail('resource.invalid', { id: r.id });
      }
      if (Object.isFrozen(r)) {
        validatedResources.add(r);
      }
    }
    const levels = new Set(d.levels.map((l) => l.id));
    for (const l of d.levels) {
      if (!allowed(l, ['id', 'name', 'elevation', 'height'])) {
        return fail('project.unknownField');
      }
      if (
        typeof l.name !== 'string' ||
        !l.name.trim() ||
        !finite(l.elevation) ||
        !positive(l.height)
      ) {
        return fail('level.invalid', { id: l.id });
      }
    }
    for (const w of d.walls) {
      if (
        !allowed(w, [
          'id',
          'levelId',
          'start',
          'end',
          'height',
          'thickness',
          'materials',
          'surfaceOrientation',
        ]) ||
        !allowed(w.start, ['x', 'z']) ||
        !allowed(w.end, ['x', 'z']) ||
        !allowed(w.materials, ['A', 'B', 'edge'])
      ) {
        return fail('project.unknownField');
      }
      if (!levels.has(w.levelId)) {
        return fail('level.missing', { id: w.levelId });
      }
      if (
        !point(w.start) ||
        !point(w.end) ||
        wallLength(w) < 0.05 ||
        !positive(w.height) ||
        !positive(w.thickness)
      ) {
        return fail('wall.invalid', { id: w.id });
      }
      if (Math.abs(w.start.x - w.end.x) >= EPSILON && Math.abs(w.start.z - w.end.z) >= EPSILON) {
        return fail('wall.orthogonalOnly', { id: w.id });
      }
      if (w.surfaceOrientation !== undefined && ![1, -1].includes(w.surfaceOrientation)) {
        return fail('wall.invalid', { id: w.id });
      }
      for (const side of ['A', 'B', 'edge'] as const) {
        const result = validateBinding(w.materials?.[side], resources, side === 'edge');
        if (!result.ok) {
          return result;
        }
      }
    }
    const pairs = validateWallPairs(d.walls);
    if (!pairs.ok) {
      return pairs;
    }
    for (const s of d.slabs) {
      if (
        !allowed(s, [
          'id',
          'levelId',
          'polygon',
          'elevation',
          'thickness',
          'purpose',
          'materials',
        ]) ||
        !allowed(s.materials, ['top', 'bottom', 'edge'])
      ) {
        return fail('project.unknownField');
      }
      if (!levels.has(s.levelId)) {
        return fail('level.missing', { id: s.levelId });
      }
      if (
        !Array.isArray(s.polygon) ||
        s.polygon.length !== 4 ||
        !s.polygon.every(point) ||
        !positive(s.thickness) ||
        !finite(s.elevation) ||
        !['floor', 'roof'].includes(s.purpose)
      ) {
        return fail('slab.invalid', { id: s.id });
      }
      const p = s.polygon;
      if (p.some((vertex) => !allowed(vertex, ['x', 'z']))) {
        return fail('project.unknownField');
      }
      for (let i = 0; i < 4; i += 1) {
        const a = p[i]!,
          b = p[(i + 1) % 4]!;
        if (samePoint(a, b) || (Math.abs(a.x - b.x) > EPSILON && Math.abs(a.z - b.z) > EPSILON)) {
          return fail('slab.rectangleOnly', { id: s.id });
        }
      }
      if (Math.abs(p[0]!.x - p[2]!.x) < 0.05 || Math.abs(p[0]!.z - p[2]!.z) < 0.05) {
        return fail('slab.invalid', { id: s.id });
      }
      for (const side of ['top', 'bottom', 'edge'] as const) {
        const result = validateBinding(s.materials?.[side], resources, side === 'edge');
        if (!result.ok) {
          return result;
        }
      }
    }
    for (let i = 0; i < d.slabs.length; i += 1) {
      const first = d.slabs[i]!;
      const firstX = first.polygon.map((point) => point.x);
      const firstZ = first.polygon.map((point) => point.z);
      for (let j = i + 1; j < d.slabs.length; j += 1) {
        const second = d.slabs[j]!;
        if (first.levelId !== second.levelId) {
          continue;
        }
        const verticalOverlap =
          Math.min(first.elevation, second.elevation) -
          Math.max(first.elevation - first.thickness, second.elevation - second.thickness);
        if (verticalOverlap <= EPSILON) {
          continue;
        }
        const secondX = second.polygon.map((point) => point.x);
        const secondZ = second.polygon.map((point) => point.z);
        const horizontalOverlap =
          Math.min(Math.max(...firstX), Math.max(...secondX)) -
          Math.max(Math.min(...firstX), Math.min(...secondX));
        const depthOverlap =
          Math.min(Math.max(...firstZ), Math.max(...secondZ)) -
          Math.max(Math.min(...firstZ), Math.min(...secondZ));
        if (horizontalOverlap > EPSILON && depthOverlap > EPSILON) {
          return fail('slab.overlap', { ids: [first.id, second.id] });
        }
      }
    }
    for (const o of d.openings) {
      if (
        !allowed(o, [
          'id',
          'levelId',
          'wallId',
          'kind',
          'offset',
          'width',
          'height',
          'sill',
          'hinge',
          'direction',
          'angle',
          'closedAngle',
          'openAngle',
          'duration',
          'materials',
        ]) ||
        (o.materials && !allowed(o.materials, ['A', 'B', 'edge']))
      ) {
        return fail('project.unknownField');
      }
      const wall = d.walls.find((w) => w.id === o.wallId);
      if (!wall) {
        return fail('wall.missing', { id: o.wallId });
      }
      const result = validateOpening(o, wall);
      if (!result.ok) {
        return result;
      }
      const length = wallLength(wall),
        dx = (wall.end.x - wall.start.x) / length,
        dz = (wall.end.z - wall.start.z) / length;
      for (const neighbor of d.walls) {
        if (
          neighbor.id === wall.id ||
          neighbor.levelId !== wall.levelId ||
          o.sill >= neighbor.height - EPSILON
        ) {
          continue;
        }
        if (
          Math.abs(
            dx * (neighbor.end.x - neighbor.start.x) + dz * (neighbor.end.z - neighbor.start.z),
          ) > EPSILON
        ) {
          continue;
        }
        const junction =
          Math.abs(dx) > 0.9
            ? { x: neighbor.start.x, z: wall.start.z }
            : { x: wall.start.x, z: neighbor.start.z };
        if (!pointOnSegment(junction, wall) || !pointOnSegment(junction, neighbor)) {
          continue;
        }
        const offset = (junction.x - wall.start.x) * dx + (junction.z - wall.start.z) * dz;
        const clearance = neighbor.thickness / 2 + 0.01;
        if (
          o.offset < offset + clearance - EPSILON &&
          o.offset + o.width > offset - clearance + EPSILON
        ) {
          return fail('opening.junctionConflict', {
            id: o.id,
            wallId: wall.id,
            neighborId: neighbor.id,
          });
        }
      }
      if (o.materials) {
        for (const side of ['A', 'B', 'edge'] as const) {
          const r = validateBinding(o.materials[side], resources, side === 'edge');
          if (!r.ok) {
            return r;
          }
        }
      }
    }
    for (let i = 0; i < d.openings.length; i += 1) {
      for (let j = i + 1; j < d.openings.length; j += 1) {
        const a = d.openings[i]!,
          b = d.openings[j]!;
        if (
          a.wallId === b.wallId &&
          Math.min(a.offset + a.width, b.offset + b.width) - Math.max(a.offset, b.offset) > -0.08 &&
          Math.min(a.sill + a.height, b.sill + b.height) - Math.max(a.sill, b.sill) > -0.08
        ) {
          return fail('opening.overlap', { ids: [a.id, b.id] });
        }
      }
    }
    const members = new Set<string>();
    for (const group of d.continuity) {
      if (!allowed(group, ['id', 'members', 'anchor', 'verticalOrigin', 'seam'])) {
        return fail('project.unknownField');
      }
      if (!Array.isArray(group.members) || !group.members.length || !finite(group.verticalOrigin)) {
        return fail('continuity.invalid', { id: group.id });
      }
      for (const m of group.members) {
        if (!allowed(m, ['wallId', 'side', 'direction'])) {
          return fail('project.unknownField');
        }
        if (
          !d.walls.some((w) => w.id === m.wallId) ||
          !['A', 'B'].includes(m.side) ||
          ![1, -1].includes(m.direction) ||
          members.has(`${m.wallId}:${m.side}`)
        ) {
          return fail('continuity.invalid', { id: group.id });
        }
        members.add(`${m.wallId}:${m.side}`);
      }
      for (const a of [group.anchor, ...(group.seam ? [group.seam] : [])]) {
        if (a && !allowed(a, ['wallId', 'side', 'endpoint'])) {
          return fail('project.unknownField');
        }
        if (
          !a ||
          !group.members.some((m) => m.wallId === a.wallId && m.side === a.side) ||
          !['start', 'end'].includes(a.endpoint)
        ) {
          return fail('continuity.invalid', { id: group.id });
        }
      }
    }
    return valid();
  } catch {
    return fail('project.invalid');
  }
}
