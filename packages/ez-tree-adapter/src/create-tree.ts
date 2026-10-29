import {
  Box3,
  DoubleSide,
  FrontSide,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import { Tree, TreePreset } from '@dgreenheck/ez-tree';
import { createEzTreeMaterialInput } from './materials';
import { disposeEzTreeObject } from './dispose';
import { normalizeEzTreeRequest } from './normalize-request';
import type {
  EzTreeCreateRequest,
  EzTreeGeometryResult,
  EzTreeInstance,
  EzTreeLodResult,
  EzTreeAdapterWarning,
} from './types';
import { EzTreeAdapterError } from './types';

function presetName(request: EzTreeCreateRequest): string {
  const detail = request.detail ?? 'medium';
  const requested = request.preset ?? 'oak';
  if (requested.toLowerCase() === 'oak medium' && detail !== 'medium') {
    return `Oak ${detail === 'low' ? 'Small' : 'Large'}`;
  }
  const exact = Object.keys(TreePreset).find(
    (name) => name.toLowerCase() === requested.toLowerCase(),
  );
  if (exact) {
    return exact;
  }
  const alias = requested.toLowerCase();
  if (alias === 'oak' || alias === 'ash' || alias === 'aspen' || alias === 'pine') {
    return `${alias[0].toUpperCase()}${alias.slice(1)} ${detail === 'low' ? 'Small' : detail === 'high' ? 'Large' : 'Medium'}`;
  }
  throw new EzTreeAdapterError(
    'unsupported-preset',
    `Unknown ez-tree preset: ${requested}`,
    'preset',
  );
}

function mergeOptions(
  target: Record<string, unknown>,
  patch: Record<string, unknown>,
  path = 'options',
): void {
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(target, key)) {
      throw new EzTreeAdapterError(
        'unsupported-option',
        `${path}.${key} is not supported by ez-tree`,
        `${path}.${key}`,
      );
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const current = target[key];
      if (current && typeof current === 'object' && !Array.isArray(current)) {
        mergeOptions(
          current as Record<string, unknown>,
          value as Record<string, unknown>,
          `${path}.${key}`,
        );
        continue;
      }
    }
    target[key] = value;
  }
}

function meshGeometry(mesh: Object3D | undefined): BufferGeometry | undefined {
  const candidate = mesh as (Object3D & { geometry?: BufferGeometry }) | undefined;
  return candidate?.geometry;
}

function boundsFor(object: Object3D): Box3 {
  object.updateWorldMatrix(true, true);
  return new Box3().setFromObject(object);
}

function counts(geometry: BufferGeometry | undefined): { vertices: number; triangles: number } {
  if (!geometry) {
    return { vertices: 0, triangles: 0 };
  }
  const vertices = geometry.getAttribute('position')?.count ?? 0;
  const triangles = geometry.index ? geometry.index.count / 3 : vertices / 3;
  return { vertices, triangles };
}

function warningsFor(request: EzTreeCreateRequest): EzTreeAdapterWarning[] {
  const warnings: EzTreeAdapterWarning[] = [];
  if (
    request.wind &&
    (request.wind.enabled || Object.keys(request.wind).some((key) => key !== 'enabled'))
  ) {
    warnings.push({
      code: 'unsupported-wind',
      field: 'wind',
      message:
        'The pinned ez-tree version has no stable wind parameter API; wind settings are ignored.',
    });
  }
  return warnings;
}

function buildTree(request: EzTreeCreateRequest): {
  tree: Tree;
  preset: string;
  warnings: EzTreeAdapterWarning[];
} {
  const normalized = normalizeEzTreeRequest(request);
  const preset = presetName(normalized);
  const warnings = [...warningsFor(normalized)];
  const material = createEzTreeMaterialInput(normalized.material);
  warnings.push(...material.warnings);
  const tree = new Tree();
  try {
    tree.loadPreset(preset);
    if (normalized.options) {
      mergeOptions(
        tree.options as unknown as Record<string, unknown>,
        normalized.options as Record<string, unknown>,
      );
    }
    tree.options.seed = normalized.seed;
    if (material.barkTint !== undefined) {
      tree.options.bark.tint = material.barkTint;
    }
    if (material.leafTint !== undefined) {
      tree.options.leaves.tint = material.leafTint;
    }
    if (material.leafAlphaTest !== undefined) {
      tree.options.leaves.alphaTest = material.leafAlphaTest;
    }
    tree.generate();
    if (material.leafDoubleSided !== undefined) {
      const leavesMaterial = tree.leavesMesh.material;
      for (const entry of Array.isArray(leavesMaterial) ? leavesMaterial : [leavesMaterial]) {
        (entry as Material).side = material.leafDoubleSided ? DoubleSide : FrontSide;
      }
    }
    return { tree, preset, warnings };
  } catch (error) {
    disposeEzTreeObject(tree);
    if (error instanceof EzTreeAdapterError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new EzTreeAdapterError('generation-failed', `ez-tree generation failed: ${message}`);
  }
}

/** Creates a generated tree and owns its generated geometries and materials. */
export function createEzTree(request: EzTreeCreateRequest): EzTreeInstance {
  const { tree, preset, warnings } = buildTree(request);
  const object = tree as Object3D;
  let bounds: Box3;
  try {
    bounds = boundsFor(object);
  } catch (error) {
    disposeEzTreeObject(object);
    const message = error instanceof Error ? error.message : String(error);
    throw new EzTreeAdapterError('bounds-failed', `Unable to calculate ez-tree bounds: ${message}`);
  }
  let disposed = false;
  return {
    object,
    branches: tree.branchesMesh,
    leaves: tree.leavesMesh,
    bounds,
    seed: tree.options.seed >>> 0,
    preset,
    warnings,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      disposeEzTreeObject(object);
    },
  };
}

/** Creates owned geometry snapshots and releases the temporary upstream tree. */
export function createEzTreeGeometry(request: EzTreeCreateRequest): EzTreeGeometryResult {
  const instance = createEzTree(request);
  try {
    const branches = meshGeometry(instance.branches)?.clone();
    const leaves = meshGeometry(instance.leaves)?.clone();
    const branchCounts = counts(branches);
    const leafCounts = counts(leaves);
    return {
      branches,
      leaves,
      bounds: instance.bounds.clone(),
      vertexCount: branchCounts.vertices + leafCounts.vertices,
      triangleCount: branchCounts.triangles + leafCounts.triangles,
      warnings: instance.warnings,
      dispose() {
        branches?.dispose();
        leaves?.dispose();
      },
    };
  } finally {
    instance.dispose();
  }
}

/** Returns one clearly marked fallback level because ez-tree 1.1.0 has no LOD API. */
export function createEzTreeLods(request: EzTreeCreateRequest): EzTreeLodResult {
  const instance = createEzTree(request);
  const warnings: EzTreeAdapterWarning[] = [
    ...instance.warnings,
    {
      code: 'unsupported-lod',
      field: 'detail',
      message: 'The pinned ez-tree version has no LOD API; returning one fallback level.',
    },
  ];
  return {
    object: instance.object,
    levels: [
      {
        distance: 0,
        detail: normalizeEzTreeRequest(request).detail ?? 'medium',
        object: instance.object,
      },
    ],
    bounds: instance.bounds,
    fallback: true,
    warnings,
    dispose: instance.dispose,
  };
}
