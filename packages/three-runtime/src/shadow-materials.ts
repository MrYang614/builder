import { MeshDepthMaterial, MeshDistanceMaterial, type Material, type Mesh } from 'three';

const samplerStates = new WeakMap<Material, { map: boolean; alphaMap: boolean }>();

/** Updates borrowed Three shadow samplers without owning or disposing their GPU resources. */
export function prepareShadowMaterial(material: Material): void {
  if (!(material instanceof MeshDepthMaterial || material instanceof MeshDistanceMaterial)) {
    return;
  }
  // Registered building images color opaque silhouettes. Sampling them for depth is
  // unnecessary and can revive a disposed project texture in Three's shared material.
  if (material.alphaTest === 0 && !material.alphaHash) {
    material.map = null;
  }
  const map = material.map !== null,
    alphaMap = material.alphaMap !== null,
    previous = samplerStates.get(material);
  if (!previous) {
    samplerStates.set(material, { map, alphaMap });
    material.needsUpdate = true;
  } else if (previous.map !== map || previous.alphaMap !== alphaMap) {
    previous.map = map;
    previous.alphaMap = alphaMap;
    // A presence change must rebuild USE_MAP/USE_ALPHAMAP and clear old sampler values.
    // Stable shadow draws keep the same version and compiled program.
    material.needsUpdate = true;
  }
}

/** Runs after Three copies a caster's properties into its shared depth/distance material. */
export const prepareBorrowedShadow: Mesh['onBeforeShadow'] = (
  _renderer,
  _scene,
  _camera,
  _shadowCamera,
  _geometry,
  material,
) => prepareShadowMaterial(material);
