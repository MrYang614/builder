import { describe, expect, test, vi } from 'vitest';
import * as THREE from 'three';
import { viewportTokens } from '@building/ui/tokens';
import type { SnapResult } from '@building/editor-core';
import { SnapFeedback } from '../packages/three-runtime/src/snap-feedback';

function fixture(arrayMaterials = false) {
  const auxiliary = new THREE.Group();
  const geometry = new THREE.SphereGeometry(0.065, 12, 8);
  const materials = [
    new THREE.MeshBasicMaterial({ color: viewportTokens('light').snap }),
    new THREE.MeshBasicMaterial({ color: viewportTokens('light').snap }),
  ];
  const marker = new THREE.Mesh(geometry, arrayMaterials ? materials : materials[0]);
  marker.visible = false;
  auxiliary.add(marker);
  const feedback = new SnapFeedback(auxiliary, marker, viewportTokens('light').snap);
  const line = auxiliary.getObjectByName('snap-target-segment');
  if (!(line instanceof THREE.Mesh)) {
    throw new Error('Expected the owned finite snap segment line.');
  }
  const releaseMarker = () => {
    geometry.dispose();
    materials.forEach((material) => material.dispose());
  };
  return { auxiliary, marker, feedback, line, materials, releaseMarker };
}

const point: SnapResult = {
  kind: 'point',
  point: { x: 1.125, z: -2.375 },
  targetKind: 'wall-endpoint',
  objectId: 'wall_target',
  levelId: 'level_1',
  distance: 0.04,
};
const segment: SnapResult = {
  ...point,
  kind: 'line',
  targetKind: 'wall-centerline',
  point: { x: 2, z: -2.375 },
  segment: { start: { x: 1.125, z: -2.375 }, end: { x: 4.5, z: -2.375 } },
};

describe('actual Three.js snap feedback resources without a GPU context', () => {
  test('the marker and finite line use the exact resolved coordinates at the active elevation', () => {
    const { marker, feedback, line, releaseMarker } = fixture();
    try {
      feedback.update(segment, 3);
      expect(marker.visible).toBe(true);
      expect(marker.position.toArray()).toEqual([segment.point.x, 3.045, segment.point.z]);
      expect(line.visible).toBe(true);
      const positions = line.geometry.getAttribute('position');
      expect((positions.getX(0) + positions.getX(1)) / 2).toBe(segment.segment!.start.x);
      expect((positions.getZ(0) + positions.getZ(1)) / 2).toBeCloseTo(segment.segment!.start.z, 6);
      expect((positions.getX(2) + positions.getX(3)) / 2).toBe(segment.segment!.end.x);
      expect((positions.getZ(2) + positions.getZ(3)) / 2).toBeCloseTo(segment.segment!.end.z, 6);
      expect(positions.getY(0)).toBeCloseTo(3.045, 6);
      expect(positions.getY(1)).toBeCloseTo(3.045, 6);
      feedback.update(point, 0);
      expect(marker.position.toArray()).toEqual([point.point.x, 0.045, point.point.z]);
      expect(line.visible).toBe(false);
      expect(marker.renderOrder).toBeGreaterThan(line.renderOrder);
    } finally {
      feedback.dispose();
      releaseMarker();
    }
  });

  test('pointer feedback reuses its line geometry, material and position buffer across target changes', () => {
    const { auxiliary, feedback, line, releaseMarker } = fixture();
    const geometry = line.geometry;
    const material = line.material;
    const positions = geometry.getAttribute('position');
    const array = positions.array;
    const version = positions.version;
    try {
      for (let index = 0; index < 20; index += 1) {
        feedback.update(
          {
            ...segment,
            point: { x: 2 + index / 10, z: segment.point.z },
            segment: { start: segment.segment!.start, end: { x: 4.5 + index / 10, z: -2.375 } },
          },
          index / 2,
        );
      }
      expect(auxiliary.children).toHaveLength(2);
      expect(line.geometry).toBe(geometry);
      expect(line.material).toBe(material);
      expect(line.geometry.getAttribute('position')).toBe(positions);
      expect(positions.array).toBe(array);
      expect(positions.version).toBe(version + 20);
    } finally {
      feedback.dispose();
      releaseMarker();
    }
  });

  test('raw input, point-only results, degenerate lines and clear hide the relevant shapes', () => {
    const { marker, feedback, line, releaseMarker } = fixture();
    try {
      feedback.update(segment, 0);
      feedback.update({ ...point, kind: 'raw' }, 0);
      expect(marker.visible).toBe(false);
      expect(line.visible).toBe(false);
      feedback.update({ ...segment, segment: { start: point.point, end: point.point } }, 0);
      expect(marker.visible).toBe(true);
      expect(line.visible).toBe(false);
      feedback.update({ ...point, kind: 'grid' }, 0);
      expect(marker.visible).toBe(true);
      expect(line.visible).toBe(false);
      feedback.update(segment, 0);
      feedback.clear();
      feedback.clear();
      expect(marker.visible).toBe(false);
      expect(line.visible).toBe(false);
    } finally {
      feedback.dispose();
      releaseMarker();
    }
  });

  test('semantic theme changes update the owned line and every borrowed marker material', () => {
    const { feedback, line, materials, releaseMarker } = fixture(true);
    try {
      const color = viewportTokens('dark').snap;
      feedback.setTheme(color);
      expect((line.material as THREE.MeshBasicMaterial).color.equals(new THREE.Color(color))).toBe(
        true,
      );
      expect(materials.every((material) => material.color.equals(new THREE.Color(color)))).toBe(
        true,
      );
    } finally {
      feedback.dispose();
      releaseMarker();
    }
  });

  test('dispose releases the owned line exactly once and leaves marker resources with their runtime owner', () => {
    const { auxiliary, marker, feedback, line, materials, releaseMarker } = fixture(true);
    const disposeGeometry = vi.spyOn(line.geometry, 'dispose');
    const disposeMaterial = vi.spyOn(line.material as THREE.MeshBasicMaterial, 'dispose');
    const disposeMarkerGeometry = vi.spyOn(marker.geometry, 'dispose');
    const disposeMarkerMaterials = materials.map((material) => vi.spyOn(material, 'dispose'));
    feedback.update(segment, 0);
    feedback.dispose();
    feedback.dispose();
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
    expect(disposeMarkerGeometry).not.toHaveBeenCalled();
    expect(disposeMarkerMaterials.every((dispose) => dispose.mock.calls.length === 0)).toBe(true);
    expect(auxiliary.children).toEqual([marker]);
    expect(line.parent).toBeNull();
    expect(marker.visible).toBe(false);
    feedback.update(segment, 4);
    feedback.setTheme(viewportTokens('dark').snap);
    expect(marker.visible).toBe(false);
    expect(auxiliary.children).toEqual([marker]);
    releaseMarker();
  });
});
