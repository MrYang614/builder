import { Color } from 'three';
import type { EzTreeAdapterWarning, EzTreeMaterialRequest } from './types';
import { EzTreeAdapterError } from './types';

export interface EzTreeMaterialInput {
  barkTint?: number;
  leafTint?: number;
  leafAlphaTest?: number;
  leafDoubleSided?: boolean;
  warnings: EzTreeAdapterWarning[];
}

function toTint(value: string, field: string): number {
  if (!value.trim()) {
    throw new EzTreeAdapterError('invalid-material', `${field} cannot be empty`, field);
  }
  const normalized = value.trim().toLowerCase();
  const named = new Set([
    'black',
    'blue',
    'brown',
    'gray',
    'green',
    'grey',
    'orange',
    'pink',
    'purple',
    'red',
    'white',
    'yellow',
  ]);
  const validSyntax =
    /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(normalized) ||
    named.has(normalized) ||
    validFunctionalColor(normalized);
  if (!validSyntax) {
    throw new EzTreeAdapterError(
      'invalid-material',
      `${field} is not a supported CSS color`,
      field,
    );
  }
  try {
    return new Color(value).getHex();
  } catch {
    throw new EzTreeAdapterError('invalid-material', `${field} is not a valid color`, field);
  }
}

function validFunctionalColor(value: string): boolean {
  const match = /^(rgba?|hsla?)\(([^)]*)\)$/i.exec(value);
  if (!match) {
    return false;
  }
  const parts = match[2].split(',').map((part) => part.trim());
  const isNumber = (part: string, minimum: number, maximum: number, percent = false) => {
    const number = Number.parseFloat(part.replace('%', ''));
    return (
      Number.isFinite(number) &&
      (percent
        ? part.endsWith('%') && number >= minimum && number <= maximum
        : number >= minimum && number <= maximum)
    );
  };
  if (match[1].toLowerCase().startsWith('rgb')) {
    if (parts.length !== 3 && parts.length !== 4) {
      return false;
    }
    if (!parts.slice(0, 3).every((part) => isNumber(part, 0, part.endsWith('%') ? 100 : 255))) {
      return false;
    }
    return parts.length === 3 || isNumber(parts[3], 0, 1);
  }
  if (parts.length !== 3 && parts.length !== 4) {
    return false;
  }
  if (
    !isNumber(parts[0], -360, 360) ||
    !isNumber(parts[1], 0, 100, true) ||
    !isNumber(parts[2], 0, 100, true)
  ) {
    return false;
  }
  return parts.length === 3 || isNumber(parts[3], 0, 1);
}

/** Converts stable builder material fields into the upstream option shape. */
export function createEzTreeMaterialInput(request?: EzTreeMaterialRequest): EzTreeMaterialInput {
  const warnings: EzTreeAdapterWarning[] = [];
  if (!request) {
    return { warnings };
  }
  const unsupportedTextureFields = [
    'barkTextureId',
    'barkNormalTextureId',
    'barkRoughnessTextureId',
    'barkAoTextureId',
    'leafTextureId',
  ] as const;
  for (const field of unsupportedTextureFields) {
    if (request[field] !== undefined) {
      warnings.push({
        code: 'unsupported-material-field',
        field: `material.${field}`,
        message: `The pinned ez-tree version owns its built-in textures; ${field} is ignored.`,
      });
    }
  }
  return {
    barkTint:
      request.barkColor !== undefined ? toTint(request.barkColor, 'material.barkColor') : undefined,
    leafTint:
      request.leafColor !== undefined ? toTint(request.leafColor, 'material.leafColor') : undefined,
    leafAlphaTest: request.leafAlphaTest,
    leafDoubleSided: request.leafDoubleSided,
    warnings,
  };
}
