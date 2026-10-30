import * as THREE from 'three';
import { describe, expect, test, vi } from 'vitest';
import { RuntimeViewTransition } from '../packages/three-runtime/src/runtime-view-transition';
import {
  fitObliqueCameraPose,
  interpolateCameraPose,
  obliqueCameraPose,
  planCameraPose,
  visiblePlanBounds,
  type PlanViewFraming,
} from '../packages/three-runtime/src/view-transition-math';

const framing: PlanViewFraming = { center: { x: 3, z: -2 }, pixelsPerMeter: 60, elevation: 4 };

function fixture(originActive = false) {
  const camera = new THREE.PerspectiveCamera(45, 800 / 600, 0.05, 1500);
  camera.position.set(9, 10, 12);
  const target = new THREE.Vector3(0, 1, 0);
  camera.lookAt(target);
  const building = new THREE.Group();
  const visible = new THREE.Group();
  const hidden = new THREE.Group();
  const ghost = new THREE.Group();
  hidden.visible = false;
  building.add(visible, hidden, ghost);
  const auxiliary = new THREE.Group();
  let active = originActive;
  const activate = vi.fn((next: boolean) => {
    active = next;
  });
  const input = vi.fn();
  const rasterOnly = vi.fn();
  const owner = new RuntimeViewTransition({
    camera,
    target,
    building,
    auxiliary,
    roots: () => [
      { root: visible, currentLevel: true },
      { root: hidden, currentLevel: true },
      { root: ghost, currentLevel: false },
    ],
    viewport: () => ({ width: 800, height: 600 }),
    isActive: () => active,
    activate,
    input,
    rasterOnly,
    invalidate: vi.fn(),
  });
  const frame = (time: number) => {
    owner.advance(time);
    owner.presented(time);
  };
  return {
    owner,
    camera,
    target,
    building,
    visible,
    hidden,
    ghost,
    auxiliary,
    activate,
    input,
    rasterOnly,
    frame,
    isActive: () => active,
  };
}

describe('runtime-owned reference view transition', () => {
  test.each([
    { width: 1082, height: 716, elevation: 0 },
    { width: 382, height: 416, elevation: 0 },
    { width: 1082, height: 716, elevation: 4 },
    { width: 382, height: 416, elevation: 4 },
  ])(
    'fitted oblique view contains full-height corners at viewport $width × $height, elevation $elevation',
    (viewport) => {
      const camera = new THREE.PerspectiveCamera(45, viewport.width / viewport.height, 0.05, 1500);
      const current = {
        center: { x: 0.2, z: -0.3 },
        elevation: viewport.elevation,
        pixelsPerMeter: Math.min((viewport.width - 96) / 8.24, (viewport.height - 96) / 6.24),
      };
      const bounds = new THREE.Box3(
        new THREE.Vector3(-4.12, viewport.elevation - 0.2, -3.12),
        new THREE.Vector3(4.12, viewport.elevation + 3, 3.12),
      );
      const plan = planCameraPose(camera, current, viewport.height);
      const reference = obliqueCameraPose(plan);
      const fitted = fitObliqueCameraPose(reference, camera, bounds);
      camera.position.copy(fitted.position);
      camera.lookAt(fitted.target);
      camera.updateMatrixWorld(true);
      for (const x of [bounds.min.x, bounds.max.x]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
          for (const z of [bounds.min.z, bounds.max.z]) {
            const point = new THREE.Vector3(x, y, z).project(camera);
            expect(Math.abs(point.x)).toBeLessThanOrEqual(0.920001);
            expect(Math.abs(point.y)).toBeLessThanOrEqual(0.920001);
            expect(point.z).toBeGreaterThan(-1);
            expect(point.z).toBeLessThan(1);
          }
        }
      }
      expect(fitted.target.equals(plan.target)).toBe(true);
      expect(
        fitted.position
          .clone()
          .sub(fitted.target)
          .normalize()
          .distanceTo(new THREE.Vector3(0.3, 0.82, 0.49).normalize()),
      ).toBeLessThan(1e-12);
      expect(fitted.position.distanceTo(fitted.target)).toBeGreaterThanOrEqual(
        reference.position.distanceTo(reference.target),
      );
    },
  );

  test('framing bounds keep real height but exclude hidden or distant offscreen objects', () => {
    const geometry = new THREE.BoxGeometry(4, 3, 4);
    const material = new THREE.MeshBasicMaterial();
    const near = new THREE.Mesh(geometry, material);
    near.position.set(0, 5.5, 0);
    const far = new THREE.Mesh(geometry, material);
    far.position.set(100, 100, 100);
    const hidden = new THREE.Mesh(geometry, material);
    hidden.scale.setScalar(100);
    hidden.visible = false;
    const bounds = visiblePlanBounds(
      [near, far, hidden],
      {
        center: { x: 1.5, z: 0 },
        pixelsPerMeter: 100,
        elevation: 4,
      },
      { width: 200, height: 200 },
    );
    expect(bounds.min.toArray()).toEqual([0.5, 4, -1]);
    expect(bounds.max.toArray()).toEqual([2, 7, 1]);
    geometry.dispose();
    material.dispose();
  });

  test.each(['complete', 'cancel'] as const)(
    'compressed geometry suppresses shadow reception and restores original flags on %s',
    async (end) => {
      const value = fixture(true);
      const geometry = new THREE.BoxGeometry();
      const material = new THREE.MeshBasicMaterial();
      const receiver = new THREE.Mesh(geometry, material);
      receiver.receiveShadow = true;
      const unshadowed = new THREE.Mesh(geometry, material);
      value.visible.add(receiver, unshadowed);
      const promise = value.owner.start('plan', framing);
      value.frame(0);
      expect(receiver.receiveShadow).toBe(true);
      value.frame(650);
      expect(receiver.receiveShadow).toBe(false);
      expect(unshadowed.receiveShadow).toBe(false);
      if (end === 'complete') {
        value.frame(1300);
        expect(receiver.receiveShadow).toBe(false);
        value.frame(1750);
      } else {
        value.owner.cancel();
      }
      expect(await promise).toBe(end === 'complete');
      expect(receiver.receiveShadow).toBe(true);
      expect(unshadowed.receiveShadow).toBe(false);
      expect(receiver.material).toBe(material);
      geometry.dispose();
      material.dispose();
    },
  );

  test('top pose aligns ground CSS pixels at an elevated floor and respects effective FOV', () => {
    const camera = new THREE.PerspectiveCamera(45, 800 / 600, 0.05, 1500);
    camera.zoom = 1.7;
    camera.updateProjectionMatrix();
    const pose = planCameraPose(camera, framing, 600);
    camera.position.copy(pose.position);
    camera.lookAt(pose.target);
    camera.updateMatrixWorld(true);
    const screen = (x: number, z: number) =>
      new THREE.Vector3(x, framing.elevation, z).project(camera);
    const center = screen(3, -2);
    const right = screen(4, -2);
    const down = screen(3, -1);
    expect(center.x).toBeCloseTo(0, 8);
    expect(center.y).toBeCloseTo(0, 8);
    expect((right.x - center.x) * 400).toBeCloseTo(60, 3);
    expect((center.y - down.y) * 300).toBeCloseTo(60, 2);
    const iso = obliqueCameraPose(pose);
    expect(
      iso.position
        .clone()
        .sub(iso.target)
        .normalize()
        .distanceTo(new THREE.Vector3(0.3, 0.82, 0.49).normalize()),
    ).toBeLessThan(1e-12);
    expect(iso.position.distanceTo(iso.target)).toBeCloseTo(
      pose.position.distanceTo(pose.target),
      8,
    );
  });

  test('camera interpolation takes the short azimuth arc across the angle boundary', () => {
    const pose = (theta: number) => ({
      target: new THREE.Vector3(),
      position: new THREE.Vector3().setFromSpherical(new THREE.Spherical(12, 1, theta)),
    });
    const middle = interpolateCameraPose(pose(3.1), pose(-3.1), 0.5);
    expect(middle.position.z).toBeLessThan(-10);
    expect(middle.position.length()).toBeCloseTo(12);
  });

  test('enter renders aligned pixels before fade and follows the reference hold, arc and growth', async () => {
    const value = fixture();
    const phases = vi.fn();
    const promise = value.owner.start('3d', framing, { onPhase: phases });
    expect(phases).not.toHaveBeenCalled();
    expect(value.owner.diagnostics()).toMatchObject({
      phase: 'enter-fade',
      growth: 0,
      scaleY: 0.0001,
    });
    const floorPoint = new THREE.Vector3(1, framing.elevation, 1).applyMatrix4(
      value.building.matrixWorld,
    );
    expect(floorPoint.y).toBeCloseTo(framing.elevation, 12);
    expect(value.ghost.visible).toBe(false);
    expect(value.hidden.visible).toBe(false);
    expect(value.auxiliary.visible).toBe(false);
    value.frame(10);
    expect(phases.mock.calls).toEqual([['enter-fade']]);
    value.frame(429);
    expect(value.owner.diagnostics().phase).toBe('enter-fade');
    value.frame(430);
    expect(value.owner.diagnostics().phase).toBe('enter-orbit');
    value.frame(1067.5);
    expect(value.owner.diagnostics().growth).toBeCloseTo(0.5);
    expect(value.camera.position.y).toBeGreaterThan(framing.elevation);
    expect(value.input).toHaveBeenLastCalledWith(false);
    value.frame(2130);
    expect(await promise).toBe(true);
    expect(phases.mock.calls).toEqual([['enter-fade'], ['enter-orbit'], ['idle']]);
    expect(value.owner.diagnostics()).toMatchObject({ phase: 'idle', growth: 1, scaleY: 1 });
    expect(value.ghost.visible).toBe(true);
    expect(value.hidden.visible).toBe(false);
    expect(value.auxiliary.visible).toBe(true);
    expect(value.input).toHaveBeenLastCalledWith(true);
    expect(value.rasterOnly.mock.calls).toEqual([[true], [false]]);
  });

  test('exit presents the flattened top frame before fade, then suspends before restoring geometry', async () => {
    const value = fixture(true);
    const phases = vi.fn();
    const scaleAtSuspend: number[] = [];
    value.activate.mockImplementation((active) => {
      if (!active) {
        scaleAtSuspend.push(value.building.scale.y);
      }
    });
    const promise = value.owner.start('plan', framing, { onPhase: phases });
    value.frame(0);
    value.owner.advance(1300);
    expect(phases.mock.calls).toEqual([['exit-orbit']]);
    expect(value.owner.diagnostics().growth).toBe(0);
    value.owner.presented(1300);
    expect(phases.mock.calls).toEqual([['exit-orbit'], ['exit-fade']]);
    expect(value.building.scale.y).toBe(0.0001);
    value.frame(1749);
    expect(value.owner.active).toBe(true);
    value.frame(1750);
    expect(await promise).toBe(true);
    expect(scaleAtSuspend).toEqual([0.0001]);
    expect(value.building.scale.y).toBe(1);
    expect(value.input).toHaveBeenLastCalledWith(false);
  });

  test.each([false, true])(
    'reduced motion uses only an 80ms fade (origin active=%s)',
    async (originActive) => {
      const value = fixture(originActive);
      const target = originActive ? 'plan' : '3d';
      const phases = vi.fn();
      const promise = value.owner.start(target, framing, { reducedMotion: true, onPhase: phases });
      const pose = value.camera.position.clone();
      value.frame(0);
      value.frame(40);
      expect(value.camera.position.equals(pose)).toBe(true);
      expect(value.building.scale.y).toBe(1);
      value.frame(80);
      expect(await promise).toBe(true);
      expect(phases.mock.calls).toEqual([[originActive ? 'exit-fade' : 'enter-fade'], ['idle']]);
    },
  );

  test.each([false, true])(
    'cancellation restores the origin pose, activation and visibility (active=%s)',
    async (active) => {
      const value = fixture(active);
      const position = value.camera.position.clone();
      const target = value.target.clone();
      const promise = value.owner.start(active ? 'plan' : '3d', framing);
      value.frame(0);
      value.frame(600);
      value.owner.cancel();
      value.owner.cancel();
      expect(await promise).toBe(false);
      expect(value.camera.position.equals(position)).toBe(true);
      expect(value.target.equals(target)).toBe(true);
      expect(value.isActive()).toBe(active);
      expect(value.building.position.y).toBe(0);
      expect(value.building.scale.y).toBe(1);
      expect(value.hidden.visible).toBe(false);
      expect(value.ghost.visible).toBe(true);
      expect(value.owner.advance(1000)).toBe(false);
    },
  );

  test('busy requests leave the active flow untouched; only genuine viewport changes cancel', async () => {
    const value = fixture();
    const promise = value.owner.start('3d', framing);
    expect(await value.owner.start('plan', framing)).toBe(false);
    value.owner.resize(800, 600);
    expect(value.owner.active).toBe(true);
    value.owner.resize(799, 600);
    expect(await promise).toBe(false);
    expect(value.owner.active).toBe(false);
  });

  test('invalid framing has no activation side effects', async () => {
    const value = fixture();
    expect(await value.owner.start('3d', { ...framing, pixelsPerMeter: 0 })).toBe(false);
    expect(value.activate).not.toHaveBeenCalled();
    expect(value.rasterOnly).not.toHaveBeenCalled();
  });

  test('a failing phase callback cancels and resolves without retaining a transformed scene', async () => {
    const value = fixture();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const promise = value.owner.start('3d', framing, {
      onPhase: () => {
        throw new Error('consumer failure');
      },
    });
    value.frame(0);
    expect(await promise).toBe(false);
    expect(value.building.scale.y).toBe(1);
    expect(value.isActive()).toBe(false);
    warning.mockRestore();
  });
});
