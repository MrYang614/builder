import * as THREE from 'three';

export interface PlanViewFraming {
  center: { x: number; z: number };
  pixelsPerMeter: number;
  elevation: number;
}

export type ViewTransitionPhase =
  | 'enter-fade'
  | 'enter-orbit'
  | 'exit-orbit'
  | 'exit-fade'
  | 'idle';

export interface ViewTransitionOptions {
  reducedMotion?: boolean;
  onPhase?: (phase: ViewTransitionPhase) => void;
}

export interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

export const clampUnit = (value: number): number => Math.max(0, Math.min(1, value));
export const transitionEase = (value: number): number => {
  const t = clampUnit(value);
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};

/** Matches CSS pixels at the active floor; a tiny positive Z offset keeps +Z pointing down. */
export function planCameraPose(
  camera: THREE.PerspectiveCamera,
  framing: PlanViewFraming,
  height: number,
): CameraPose {
  const distance =
    height /
    framing.pixelsPerMeter /
    2 /
    Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2);
  const target = new THREE.Vector3(framing.center.x, framing.elevation, framing.center.z);
  return { target, position: target.clone().add(new THREE.Vector3(0, distance, 0.0001)) };
}

/** Derives the reference oblique pose from the planar viewing distance, independent of floor height. */
export function obliqueCameraPose(plan: CameraPose): CameraPose {
  const distance = THREE.MathUtils.clamp(plan.position.distanceTo(plan.target), 5, 30);
  return {
    target: plan.target.clone(),
    position: plan.target
      .clone()
      .add(new THREE.Vector3(0.3, 0.82, 0.49).normalize().multiplyScalar(distance)),
  };
}

/** Clips displayed floor bounds to the plan window so distant offscreen objects cannot zoom it out. */
export function visiblePlanBounds(
  roots: Iterable<THREE.Object3D>,
  framing: PlanViewFraming,
  viewport: { width: number; height: number },
): THREE.Box3 {
  const bounds = new THREE.Box3();
  const halfWidth = viewport.width / framing.pixelsPerMeter / 2;
  const halfHeight = viewport.height / framing.pixelsPerMeter / 2;
  for (const root of roots) {
    if (!root.visible) {
      continue;
    }
    const box = new THREE.Box3().setFromObject(root);
    box.min.x = Math.max(box.min.x, framing.center.x - halfWidth);
    box.max.x = Math.min(box.max.x, framing.center.x + halfWidth);
    box.min.z = Math.max(box.min.z, framing.center.z - halfHeight);
    box.max.z = Math.min(box.max.z, framing.center.z + halfHeight);
    if (!box.isEmpty()) {
      bounds.union(box);
    }
  }
  return bounds;
}

/** Extends only the final radius to fit real height/depth; target, reference direction and top pose stay fixed. */
export function fitObliqueCameraPose(
  pose: CameraPose,
  camera: THREE.PerspectiveCamera,
  bounds: THREE.Box3,
): CameraPose {
  if (bounds.isEmpty()) {
    return pose;
  }
  const direction = pose.position.clone().sub(pose.target).normalize();
  const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right);
  const tangent = Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2) * 0.92;
  let distance = pose.position.distanceTo(pose.target);
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const offset = new THREE.Vector3(x, y, z).sub(pose.target);
        const depth = Math.max(
          Math.abs(offset.dot(right)) / (tangent * camera.aspect),
          Math.abs(offset.dot(up)) / tangent,
          camera.near * 1.1,
        );
        distance = Math.max(distance, offset.dot(direction) + depth);
      }
    }
  }
  return {
    target: pose.target.clone(),
    position: pose.target.clone().addScaledVector(direction, distance),
  };
}

/** Interpolates radius and inclination around the moving target using the shortest azimuth arc. */
export function interpolateCameraPose(
  from: CameraPose,
  to: CameraPose,
  progress: number,
): CameraPose {
  const a = new THREE.Spherical().setFromVector3(from.position.clone().sub(from.target));
  const b = new THREE.Spherical().setFromVector3(to.position.clone().sub(to.target));
  const angle = Math.atan2(Math.sin(b.theta - a.theta), Math.cos(b.theta - a.theta));
  const spherical = new THREE.Spherical(
    THREE.MathUtils.lerp(a.radius, b.radius, progress),
    THREE.MathUtils.lerp(a.phi, b.phi, progress),
    a.theta + angle * progress,
  );
  const target = from.target.clone().lerp(to.target, progress);
  return { target, position: target.clone().add(new THREE.Vector3().setFromSpherical(spherical)) };
}
