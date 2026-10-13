export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export type PreviewArgs = Record<string, JsonValue>;
export type ConfigField = {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  defaultValue?: JsonValue;
  defaultLabel?: string;
  options?: readonly JsonValue[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  uniqueBy?: string;
  integer?: boolean;
  orderedBounds?: readonly [string, string];
  items?: ConfigField;
  properties?: ConfigSchema;
  nullable?: boolean;
  required?: boolean;
  alternatives?: readonly ConfigField[];
};
export type ConfigSchema = Record<string, ConfigField>;

function validateValue(value: unknown, field: ConfigField, path: string): string | null {
  if (field.alternatives?.some((alternative) => validateValue(value, alternative, path) === null)) {
    return null;
  }
  if (value === null && field.nullable) {
    return null;
  }
  if (field.type === 'array') {
    if (!Array.isArray(value)) {
      return `${path} must be an array.`;
    }
    for (let index = 0; index < value.length; index++) {
      if (field.items) {
        const error = validateValue(value[index], field.items, `${path}[${index}]`);
        if (error) {
          return error;
        }
      }
    }
    if (field.uniqueBy) {
      const identifiers = new Set<unknown>();
      for (const entry of value) {
        const identifier: unknown =
          entry && typeof entry === 'object' && field.uniqueBy in entry
            ? (entry as Record<string, unknown>)[field.uniqueBy]
            : undefined;
        if (identifiers.has(identifier)) {
          return `${path}.${field.uniqueBy} identifiers must be unique.`;
        }
        identifiers.add(identifier);
      }
    }
  } else if (field.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return `${path} must be an object.`;
    }
    if (field.properties) {
      const error = validateObject(value, field.properties, path);
      if (error) {
        return error;
      }
    }
    if (field.orderedBounds) {
      const [lowerKey, upperKey] = field.orderedBounds;
      const values = value as Record<string, unknown>;
      const lower = values[lowerKey] ?? field.properties?.[lowerKey]?.defaultValue;
      const upper = values[upperKey] ?? field.properties?.[upperKey]?.defaultValue;
      if (typeof lower === 'number' && typeof upper === 'number' && lower > upper) {
        return `${path}.${upperKey} must be greater than or equal to ${lowerKey}.`;
      }
    }
  } else if (typeof value !== field.type) {
    return `${path} must be ${field.type}.`;
  }
  if (
    typeof value === 'string' &&
    field.minLength !== undefined &&
    value.length < field.minLength
  ) {
    return `${path} must contain at least ${field.minLength} character(s).`;
  }
  if (
    typeof value === 'number' &&
    (!Number.isFinite(value) ||
      (field.minimum !== undefined && value < field.minimum) ||
      (field.maximum !== undefined && value > field.maximum))
  ) {
    return `${path} is outside its allowed range.`;
  }
  if (typeof value === 'number' && field.integer && !Number.isInteger(value)) {
    return `${path} must be an integer.`;
  }
  if (field.options && !field.options.includes(value as JsonValue)) {
    return `${path} must be one of ${field.options.map(String).join(', ')}.`;
  }
  return null;
}

/** Validates only documented serializable props; callbacks and nodes belong in code. */
export function validateObject(
  value: unknown,
  schema: ConfigSchema,
  path = 'config',
): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return `${path} must be a JSON object.`;
  }
  for (const [key, field] of Object.entries(schema)) {
    if (field.required && !Object.hasOwn(value, key)) {
      return `${path}.${key} is required.`;
    }
  }
  for (const [key, entry] of Object.entries(value)) {
    const field = Object.hasOwn(schema, key) ? schema[key] : undefined;
    if (!field) {
      return `${path}.${key} is not a configurable prop. Define nodes and callbacks in code.`;
    }
    const error = validateValue(entry, field, `${path}.${key}`);
    if (error) {
      return error;
    }
  }
  return null;
}

/** Parses a draft without mutating the current preview when syntax or types are invalid. */
export function parseConfig(text: string, schema: ConfigSchema): PreviewArgs {
  const value: unknown = JSON.parse(text);
  const error = validateObject(value, schema);
  if (error) {
    throw new Error(error);
  }
  return value as PreviewArgs;
}
