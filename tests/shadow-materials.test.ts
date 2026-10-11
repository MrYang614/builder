import { describe, expect, test, vi } from 'vitest';
import {
  Mesh,
  MeshDepthMaterial,
  MeshDistanceMaterial,
  MeshStandardMaterial,
  Texture,
} from 'three';
import { createEmptyProject, createOpening, createSlab, createWall } from '@building/editor-core';
import { buildBuilding } from '@building/three-runtime';
import {
  prepareBorrowedShadow,
  prepareShadowMaterial,
} from '../packages/three-runtime/src/shadow-materials';

describe('borrowed native shadow material sampler policy', () => {
  test.each([MeshDepthMaterial, MeshDistanceMaterial])(
    '%s clears unused opaque image maps without disposing borrowed textures',
    (ShadowMaterial) => {
      const material = new ShadowMaterial(),
        texture = new Texture(),
        textureDispose = vi.spyOn(texture, 'dispose');
      material.map = texture;
      prepareShadowMaterial(material);
      expect(material.map).toBeNull();
      expect(textureDispose).not.toHaveBeenCalled();
      const stableVersion = material.version;
      // Three copies the source image back before every shadow draw; the policy must
      // strip it while keeping the already-correct untextured program version stable.
      for (let frame = 0; frame < 20; frame++) {
        material.map = texture;
        prepareShadowMaterial(material);
        expect(material.map).toBeNull();
        expect(material.version).toBe(stableVersion);
      }
      material.dispose();
      texture.dispose();
    },
  );

  test('masked and alpha-hashed silhouettes retain images; sampler presence changes invalidate once', () => {
    const material = new MeshDepthMaterial(),
      texture = new Texture(),
      alpha = new Texture();
    prepareShadowMaterial(material);
    material.alphaTest = 0.5;
    material.map = texture;
    material.alphaMap = alpha;
    const maskInputVersion = material.version;
    prepareShadowMaterial(material);
    expect(material.map).toBe(texture);
    expect(material.alphaMap).toBe(alpha);
    expect(material.version).toBe(maskInputVersion + 1);
    prepareShadowMaterial(material);
    expect(material.version).toBe(maskInputVersion + 1);
    material.alphaMap = null;
    prepareShadowMaterial(material);
    expect(material.version).toBe(maskInputVersion + 2);
    material.alphaTest = 0;
    material.alphaHash = true;
    prepareShadowMaterial(material);
    expect(material.map).toBe(texture);
    material.alphaHash = false;
    const opaqueInputVersion = material.version;
    prepareShadowMaterial(material);
    expect(material.map).toBeNull();
    expect(material.version).toBe(opaqueInputVersion + 1);
    material.dispose();
    texture.dispose();
    alpha.dispose();
  });

  test('unsupported material types preserve the original material state', () => {
    const texture = new Texture(),
      material = new MeshStandardMaterial({ map: texture });
    const version = material.version;
    prepareShadowMaterial(material);
    expect(material.map).toBe(texture);
    expect(material.version).toBe(version);
    material.dispose();
    texture.dispose();
  });

  test('wall, slab and opening snapshot meshes receive the policy without document or export overlays', () => {
    const document = createEmptyProject(),
      wall = createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 0 });
    document.walls.push(wall);
    document.slabs.push(createSlab('level_1', { x: 0, z: -2 }, { x: 4, z: 2 }));
    document.openings.push(createOpening(wall, 'door', 1), createOpening(wall, 'window', 2.5));
    const snapshot = structuredClone(document),
      building = buildBuilding(document);
    let casters = 0;
    try {
      building.root.traverse((object) => {
        if (object instanceof Mesh && object.castShadow) {
          casters++;
          expect(object.onBeforeShadow).toBe(prepareBorrowedShadow);
          expect(object.userData.displayMaterials).toBeUndefined();
        }
      });
      expect(casters).toBeGreaterThan(4);
      expect(document).toEqual(snapshot);
    } finally {
      building.dispose();
    }
    expect(building.resources.stats).toEqual({ materials: 0, textures: 0, references: 0 });
  });
});
