import type { BufferGeometry, Box3, Object3D } from 'three';

export type EzTreeScalar = string | number | boolean | null;

export type EzTreeOptionValue =
  | EzTreeScalar
  | EzTreeOptionValue[]
  | { [key: string]: EzTreeOptionValue };

export interface EzTreeMaterialRequest {
  barkColor?: string;
  leafColor?: string;
  barkTextureId?: string;
  barkNormalTextureId?: string;
  barkRoughnessTextureId?: string;
  barkAoTextureId?: string;
  leafTextureId?: string;
  leafAlphaTest?: number;
  leafDoubleSided?: boolean;
}

export interface EzTreeCreateRequest {
  seed: number;
  preset?: string;
  options?: Record<string, EzTreeOptionValue>;
  material?: EzTreeMaterialRequest;
  detail?: 'low' | 'medium' | 'high';
  wind?: {
    enabled?: boolean;
    strength?: number;
    frequency?: number;
    scale?: number;
  };
}

export interface EzTreeAdapterWarning {
  code: string;
  message: string;
  field?: string;
}

export interface EzTreeGeometryResult {
  branches?: BufferGeometry;
  leaves?: BufferGeometry;
  bounds: Box3;
  vertexCount: number;
  triangleCount: number;
  warnings: readonly EzTreeAdapterWarning[];
  dispose(): void;
}

export interface EzTreeInstance {
  object: Object3D;
  branches?: Object3D;
  leaves?: Object3D;
  bounds: Box3;
  seed: number;
  preset?: string;
  warnings: readonly EzTreeAdapterWarning[];
  dispose(): void;
}

export interface EzTreeCapabilities {
  supportsPresets: boolean;
  supportsGeometryOutput: boolean;
  supportsLods: boolean;
  supportsWind: boolean;
  supportsMaterialInjection: boolean;
}

export interface EzTreeLodLevel {
  distance: number;
  detail: 'low' | 'medium' | 'high';
  object: Object3D;
}

export interface EzTreeLodResult {
  object: Object3D;
  levels: readonly EzTreeLodLevel[];
  bounds: Box3;
  fallback: boolean;
  warnings: readonly EzTreeAdapterWarning[];
  dispose(): void;
}

export interface EzTreeDisposeOptions {
  disposeGeometry?: boolean;
  disposeMaterials?: boolean;
  disposeTextures?: boolean;
}

export class EzTreeAdapterError extends Error {
  readonly code: string;
  readonly field?: string;

  constructor(code: string, message: string, field?: string) {
    super(message);
    this.name = 'EzTreeAdapterError';
    this.code = code;
    this.field = field;
  }
}
