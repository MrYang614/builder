import * as THREE from 'three';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createEmptyProject, createOpening, createWall, EditorCore } from '@building/editor-core';
import { viewportTokens } from '@building/ui/tokens';
import { RuntimeBuilding } from '../packages/three-runtime/src/runtime-building';
import { RuntimeSelection } from '../packages/three-runtime/src/runtime-selection';
import { RuntimeAnimations } from '../packages/three-runtime/src/runtime-animations';
import { RuntimeDecorations } from '../packages/three-runtime/src/runtime-decorations';
import type { RuntimeSession } from '../packages/three-runtime/src/runtime-contracts';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.reverse().forEach((dispose) => dispose());
  cleanups.length = 0;
  vi.restoreAllMocks();
});

function fixture() {
  const doc = createEmptyProject();
  doc.levels.push({ id: 'level_2', name: '2', elevation: 3, height: 3 });
  const wall = createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 0 });
  wall.id = 'wall_1';
  const ghost = createWall('level_2', { x: 6, z: 0 }, { x: 10, z: 0 });
  ghost.id = 'wall_2';
  const door = createOpening(wall, 'door', 1);
  door.id = 'door_1';
  doc.walls.push(wall, ghost);
  doc.openings.push(door);
  const core = new EditorCore(doc),
    invalidate = vi.fn(),
    status = vi.fn(),
    building = new RuntimeBuilding(core.getSnapshot(), invalidate, status),
    session: RuntimeSession = {
      levelId: 'level_1',
      tool: 'select',
      selectedId: wall.id,
      surface: 'A',
      wholeBuilding: false,
      hiddenIds: [],
      slabPurpose: 'floor',
      roofElevation: 3,
      cameraMode: 'edit',
      snap: { enabled: true, mode: 'all', tolerance: 0.16, gridSize: 0.1 },
    };
  cleanups.push(() => building.dispose());
  building.sync(core.getSnapshot());
  return { core, wall, ghost, door, building, session, status, invalidate };
}

function formalMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      meshes.push(object);
    }
  });
  return meshes;
}

describe('formal scene and helper ownership after runtime composition', () => {
  test('decorations detach their lights and release shadow targets and helper buffers exactly once', () => {
    const scene = new THREE.Scene(),
      decorations = new RuntimeDecorations(scene, viewportTokens('light')),
      lights = scene.children.filter((object) => object instanceof THREE.Light),
      directional = lights.find(
        (light) => light instanceof THREE.DirectionalLight,
      )! as THREE.DirectionalLight,
      shadowTarget = new THREE.WebGLRenderTarget(4, 4),
      disposeShadow = vi.spyOn(shadowTarget, 'dispose'),
      disposeMarker = vi.spyOn(decorations.snapMark.geometry, 'dispose');
    directional.shadow.map = shadowTarget;
    expect(lights).toHaveLength(3);
    decorations.dispose();
    decorations.dispose();
    expect(disposeShadow).toHaveBeenCalledOnce();
    expect(disposeMarker).toHaveBeenCalledOnce();
    expect(scene.children).toHaveLength(0);
    expect(decorations.auxiliary.children).toHaveLength(0);
  });

  test('valid ChangeSets retain unaffected roots and replace only geometry affected by a Core command', () => {
    const { core, wall, ghost, building } = fixture();
    const stableRoot = building.get(ghost.id)!.root,
      oldWall = building.get(wall.id)!;
    const dispose = vi.spyOn(oldWall, 'dispose');
    const result = core.execute({ type: 'update-wall', id: wall.id, patch: { height: 2.6 } });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.code);
    }
    building.sync(core.getSnapshot(), result.changeSet);
    expect(dispose).toHaveBeenCalledOnce();
    expect(building.get(ghost.id)!.root).toBe(stableRoot);
    expect(building.diagnostics().rebuiltIds).toContain(wall.id);
    expect(building.diagnostics().rebuiltIds).not.toContain(ghost.id);
    expect(building.document).toBe(core.getSnapshot());
  });

  test('ghost clones remain display-only and current-floor picking excludes hidden and ghost roots', () => {
    const { core, wall, ghost, building, session } = fixture();
    const doc = core.getSnapshot(),
      root = building.get(ghost.id)!.root,
      mesh = formalMeshes(root)[0]!;
    const formal = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const original = formal.map((material) => ({
      opacity: material.opacity,
      transparent: material.transparent,
    }));
    building.applyVisibility(session, doc);
    const clones = mesh.userData.displayMaterials as THREE.Material[];
    expect(clones.every((material) => material.opacity === 0.18 && material.transparent)).toBe(
      true,
    );
    expect(
      formal.map((material) => ({ opacity: material.opacity, transparent: material.transparent })),
    ).toEqual(original);
    expect(building.pickRoots(session)).not.toContain(root);
    session.hiddenIds = [wall.id];
    building.applyVisibility(session, doc);
    expect(building.pickRoots(session)).not.toContain(building.get(wall.id)!.root);
    session.wholeBuilding = true;
    building.applyVisibility(session, doc);
    expect(clones.map((material) => material.opacity)).toEqual(
      formal.map((material) => material.opacity),
    );
    expect(core.getSnapshot()).toBe(doc);
  });

  test('project replacement releases old leases and disposal remains exact-once', () => {
    const { building, ghost, status } = fixture();
    const old = building.get(ghost.id)!,
      dispose = vi.spyOn(old, 'dispose'),
      empty = createEmptyProject();
    building.sync(empty);
    expect(dispose).toHaveBeenCalledOnce();
    expect(building.diagnostics()).toMatchObject({
      objects: 0,
      resources: { references: 0, materials: 0, textures: 0 },
    });
    building.dispose();
    building.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });

  test('selection cache reuses helpers and theme/clear disposal cannot release formal buffers', () => {
    const { core, building, session, wall } = fixture();
    const auxiliary = new THREE.Group(),
      selection = new RuntimeSelection(auxiliary, viewportTokens('light'), (id) =>
        building.get(id),
      );
    cleanups.push(() => selection.dispose());
    const formalGeometry = formalMeshes(building.get(wall.id)!.root)[0]!.geometry,
      disposeFormal = vi.spyOn(formalGeometry, 'dispose');
    selection.update(core.getSnapshot(), session);
    expect(selection.diagnostics()).toMatchObject({ handles: 2 });
    const firstHandle = selection.handles.children[0] as THREE.Mesh,
      disposeHandle = vi.spyOn(firstHandle.geometry, 'dispose');
    selection.update(core.getSnapshot(), session);
    expect(selection.handles.children[0]).toBe(firstHandle);
    selection.setTheme(viewportTokens('dark'));
    selection.update(core.getSnapshot(), session);
    expect(disposeHandle).toHaveBeenCalledOnce();
    session.selectedId = null;
    selection.update(core.getSnapshot(), session);
    expect(selection.diagnostics()).toEqual({ handles: 0, surfaceHighlights: 0, hingeMarkers: 0 });
    expect(disposeFormal).not.toHaveBeenCalled();
    const outline = auxiliary.children.find(
        (object) => object instanceof THREE.Box3Helper,
      )! as THREE.Box3Helper,
      disposeOutline = vi.spyOn(outline.geometry, 'dispose');
    selection.dispose();
    selection.dispose();
    selection.update(core.getSnapshot(), { ...session, selectedId: wall.id });
    expect(disposeOutline).toHaveBeenCalledOnce();
    expect(auxiliary.children).toHaveLength(0);
    expect(disposeFormal).not.toHaveBeenCalled();
  });
});

describe('door playback ownership after runtime composition', () => {
  function animations() {
    const value = fixture();
    const updateSelection = vi.fn();
    value.session.selectedId = value.door.id;
    const command = vi.fn((input: Parameters<EditorCore['execute']>[0]) => {
      const previous = value.building.document;
      const result = value.core.execute(input);
      if (result.ok) {
        value.building.sync(value.core.getSnapshot());
      }
      return { ok: result.ok, previous };
    });
    const owner = new RuntimeAnimations({
      document: () => value.building.document,
      snapshotDocument: value.core.getSnapshot,
      object: (id) => value.building.get(id),
      selectedId: () => value.session.selectedId,
      updateSelection,
      command: (input) => command(input).ok,
      invalidate: value.invalidate,
    });
    cleanups.push(() => owner.clear());
    return { ...value, owner, command, updateSelection };
  }

  test('live frames and snapshots leave Core untouched; completion commits the final angle once', () => {
    const { core, door, owner, command, updateSelection } = animations();
    const time = vi.spyOn(performance, 'now').mockReturnValue(100),
      formal = core.getSnapshot();
    owner.animate(door.id, 90);
    expect(owner.advance(100 + door.duration * 500)).toBe(true);
    time.mockReturnValue(100 + door.duration * 500);
    expect(owner.snapshot().openings[0]!.angle).toBeCloseTo(45);
    expect(core.getSnapshot()).toBe(formal);
    expect(command).not.toHaveBeenCalled();
    expect(updateSelection).toHaveBeenCalled();
    owner.advance(100 + door.duration * 1000);
    owner.advance(100 + door.duration * 2000);
    expect(command).toHaveBeenCalledOnce();
    expect(core.getSnapshot().openings[0]!.angle).toBe(90);
    expect(core.getStatusSnapshot().undoCount).toBe(1);
    expect(owner.active).toBe(false);
  });

  test('reversal starts at the live angle and an undo ChangeSet cancels pending playback', () => {
    const { core, door, owner, building, command } = animations();
    const time = vi.spyOn(performance, 'now').mockReturnValue(100);
    owner.animate(door.id, 90);
    time.mockReturnValue(100 + door.duration * 500);
    owner.animate(door.id, 0);
    expect(owner.snapshot().openings[0]!.angle).toBeCloseTo(45);
    expect(core.execute({ type: 'update-opening', id: door.id, patch: { angle: 5 } }).ok).toBe(
      true,
    );
    const undo = core.undo();
    expect(undo.ok).toBe(true);
    if (!undo.ok) {
      throw new Error(undo.error.code);
    }
    const delta = building.sync(core.getSnapshot(), undo.changeSet);
    owner.sync(delta, core.getSnapshot(), undo.changeSet);
    expect(owner.active).toBe(false);
    owner.advance(100 + door.duration * 2000);
    expect(command).not.toHaveBeenCalled();
    expect(owner.snapshot()).toBe(core.getSnapshot());
  });

  test('hiding the viewport restores formal door poses without delayed playback commits', () => {
    const { core, door, owner, building, command } = animations();
    vi.spyOn(performance, 'now').mockReturnValue(100);
    const formal = core.getSnapshot();
    owner.animate(door.id, 90);
    owner.advance(100 + door.duration * 500);
    const pivot = building.get(door.id)!.root.getObjectByName(`HingePivot_${door.id}`)!;
    expect(Math.abs(pivot.rotation.y)).toBeCloseTo(Math.PI / 4);
    owner.cancel();
    expect(pivot.rotation.y).toBeCloseTo(0);
    expect(owner.active).toBe(false);
    owner.advance(100 + door.duration * 2000);
    expect(owner.snapshot()).toBe(formal);
    expect(core.getSnapshot()).toBe(formal);
    expect(command).not.toHaveBeenCalled();
  });
});
