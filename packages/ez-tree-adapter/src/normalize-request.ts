import type { EzTreeCreateRequest, EzTreeOptionValue } from './types';
import { EzTreeAdapterError } from './types';

export const DEFAULT_EZ_TREE_DETAIL = 'medium' as const;
export const DEFAULT_EZ_TREE_PRESET = 'Oak Medium';

const DETAIL_VALUES = new Set<EzTreeCreateRequest['detail']>(['low', 'medium', 'high']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneJsonValue(
  value: unknown,
  field: string,
  seen = new WeakSet<object>(),
): EzTreeOptionValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new EzTreeAdapterError('invalid-option', `${field} must be a finite number`, field);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new EzTreeAdapterError('invalid-option', `${field} cannot contain cycles`, field);
    }
    seen.add(value);
    const result = value.map((entry, index) => cloneJsonValue(entry, `${field}[${index}]`, seen));
    seen.delete(value);
    return result;
  }
  if (isRecord(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new EzTreeAdapterError('invalid-option', `${field} must be a plain object`, field);
    }
    if (seen.has(value)) {
      throw new EzTreeAdapterError('invalid-option', `${field} cannot contain cycles`, field);
    }
    seen.add(value);
    const result: Record<string, EzTreeOptionValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        throw new EzTreeAdapterError('invalid-option', `${field}.${key} is not allowed`, field);
      }
      result[key] = cloneJsonValue(entry, `${field}.${key}`, seen);
    }
    seen.delete(value);
    return result;
  }
  throw new EzTreeAdapterError('invalid-option', `${field} must be JSON serializable`, field);
}

function finiteNumber(value: number | undefined, field: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value)) {
    throw new EzTreeAdapterError('invalid-number', `${field} must be finite`, field);
  }
  return value;
}

function validateMaterial(material: EzTreeCreateRequest['material']): void {
  if (!material || typeof material !== 'object' || Array.isArray(material)) {
    throw new EzTreeAdapterError('invalid-material', 'material must be an object', 'material');
  }
  for (const field of [
    'barkColor',
    'leafColor',
    'barkTextureId',
    'barkNormalTextureId',
    'barkRoughnessTextureId',
    'barkAoTextureId',
    'leafTextureId',
  ] as const) {
    const value = material[field];
    if (value !== undefined && typeof value !== 'string') {
      throw new EzTreeAdapterError(
        'invalid-material',
        `${field} must be a string`,
        `material.${field}`,
      );
    }
  }
  if (material.leafDoubleSided !== undefined && typeof material.leafDoubleSided !== 'boolean') {
    throw new EzTreeAdapterError(
      'invalid-material',
      'leafDoubleSided must be a boolean',
      'material.leafDoubleSided',
    );
  }
}

function validateWind(wind: EzTreeCreateRequest['wind']): void {
  if (!wind || typeof wind !== 'object' || Array.isArray(wind)) {
    throw new EzTreeAdapterError('invalid-wind', 'wind must be an object', 'wind');
  }
  if (wind.enabled !== undefined && typeof wind.enabled !== 'boolean') {
    throw new EzTreeAdapterError('invalid-wind', 'wind.enabled must be a boolean', 'wind.enabled');
  }
}

function clamp(value: number | undefined, minimum: number, maximum: number, field: string) {
  const finite = finiteNumber(value, field);
  return finite === undefined ? undefined : Math.min(maximum, Math.max(minimum, finite));
}

/** Normalizes immutable, JSON-safe input before any upstream object is created. */
export function normalizeEzTreeRequest(request: EzTreeCreateRequest): EzTreeCreateRequest {
  if (!request || typeof request !== 'object') {
    throw new EzTreeAdapterError('invalid-request', 'A tree request is required');
  }
  if (typeof request.seed !== 'number' || !Number.isFinite(request.seed)) {
    throw new EzTreeAdapterError('invalid-seed', 'seed must be a finite number', 'seed');
  }
  if (request.detail !== undefined && !DETAIL_VALUES.has(request.detail)) {
    throw new EzTreeAdapterError('invalid-detail', 'detail must be low, medium, or high', 'detail');
  }
  if (request.preset !== undefined && typeof request.preset !== 'string') {
    throw new EzTreeAdapterError('invalid-preset', 'preset must be a string', 'preset');
  }
  if (request.material !== undefined) {
    validateMaterial(request.material);
  }
  if (request.wind !== undefined) {
    validateWind(request.wind);
  }
  if (request.options !== undefined && !isRecord(request.options)) {
    throw new EzTreeAdapterError('invalid-option', 'options must be a plain object', 'options');
  }
  const material = request.material
    ? {
        ...request.material,
        leafAlphaTest: clamp(request.material.leafAlphaTest, 0, 1, 'material.leafAlphaTest'),
      }
    : undefined;
  const wind = request.wind
    ? {
        ...request.wind,
        strength: clamp(request.wind.strength, 0, 1, 'wind.strength'),
        frequency: clamp(request.wind.frequency, 0, 10, 'wind.frequency'),
        scale: clamp(request.wind.scale, 0, 100, 'wind.scale'),
      }
    : undefined;
  const options = request.options
    ? (cloneJsonValue(request.options, 'options') as Record<string, EzTreeOptionValue>)
    : undefined;
  return {
    seed: Math.trunc(request.seed) >>> 0,
    preset: request.preset?.trim() || DEFAULT_EZ_TREE_PRESET,
    options,
    material,
    detail: request.detail ?? DEFAULT_EZ_TREE_DETAIL,
    wind,
  };
}
