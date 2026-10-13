import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createEmptyProject, createWall, EditorCore, type Command } from '@building/editor-core';
import { viewportTokens } from '@building/ui/tokens';
import type { RuntimeSession } from '../packages/three-runtime/src/runtime-contracts';
import { RuntimeInteraction } from '../packages/three-runtime/src/runtime-interaction';
import { RuntimePreview } from '../packages/three-runtime/src/runtime-preview';
import type { GroundOptions, RuntimePicking } from '../packages/three-runtime/src/runtime-picking';
import type { RuntimeSnapping } from '../packages/three-runtime/src/snapping';

class Canvas extends EventTarget {
  readonly captured = new Set<number>();
  readonly focus = vi.fn();
  readonly setPointerCapture = vi.fn((id: number) => this.captured.add(id));
  readonly hasPointerCapture = vi.fn((id: number) => this.captured.has(id));
  readonly releasePointerCapture = vi.fn((id: number) => this.captured.delete(id));
}

function pointer(type: string, x = 0.05, z = 0.03, id = 1): Event {
  return Object.assign(new Event(type), {
    pointerId: id,
    clientX: x,
    clientY: z,
    button: 0,
    buttons: type === 'pointermove' ? 1 : 0,
    altKey: false,
    shiftKey: false,
  });
}

const owned: { interaction: RuntimeInteraction; preview: RuntimePreview }[] = [];
beforeEach(() => vi.stubGlobal('window', new EventTarget()));
afterEach(() => {
  for (const value of owned) {
    value.interaction.dispose();
    value.preview.dispose();
  }
  owned.length = 0;
  vi.unstubAllGlobals();
});

function fixture(tool: RuntimeSession['tool'] = 'select') {
  const document = createEmptyProject();
  const wall = createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 0 });
  wall.id = 'wall_1';
  document.walls.push(wall);
  const core = new EditorCore(document);
  const session: RuntimeSession = {
    levelId: 'level_1',
    tool,
    selectedId: wall.id,
    surface: 'A',
    wholeBuilding: false,
    hiddenIds: [],
    slabPurpose: 'floor',
    roofElevation: 3,
    cameraMode: 'edit',
    snap: { enabled: true, mode: 'points', tolerance: 0.16, gridSize: 0.1 },
  };
  let canvas = new Canvas();
  const snapping = {
    clear: vi.fn(),
    hasTarget: () => false,
    restoreFeedback: vi.fn(),
    setDimensions: vi.fn(),
  } as unknown as RuntimeSnapping;
  const status = vi.fn();
  const command = vi.fn((value: Command) => core.execute(value).ok);
  const preview = new RuntimePreview(
    {
      getDocument: core.getSnapshot,
      beginPreview: () => core.beginPreview(),
      preview: (token, value) => core.preview(token, value),
      cancelPreview: (token) => core.cancelPreview(token),
      status,
    },
    new THREE.Group(),
    viewportTokens('light'),
    snapping,
  );
  const picking = {
    ground: (event: PointerEvent, options: GroundOptions) => {
      const raw = options.raw ?? { x: event.clientX, z: event.clientY };
      return {
        x:
          options.constraint?.x ??
          raw.x + (options.applySnap ? (options.pointerOffset?.x ?? 0) : 0),
        z:
          options.constraint?.z ??
          raw.z + (options.applySnap ? (options.pointerOffset?.z ?? 0) : 0),
      };
    },
    pick: (event: PointerEvent) => ({
      id: wall.id,
      point: new THREE.Vector3(event.clientX, 0, event.clientY),
      role: 'A',
    }),
    pickHandle: () => null,
  } as unknown as RuntimePicking;
  const controls = {
    enabled: true,
    mouseButtons: { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE },
  };
  const interaction = new RuntimeInteraction(
    {
      getDocument: core.getSnapshot,
      getSession: () => session,
      command,
      select: (id) => {
        session.selectedId = id;
      },
      status,
      getCanvas: () => canvas as unknown as HTMLCanvasElement,
      controls,
      invalidate: vi.fn(),
      invalidateHistory: vi.fn(),
    },
    preview,
    picking,
    snapping,
  );
  interaction.bindCanvas();
  interaction.setSession();
  owned.push({ interaction, preview });
  return {
    core,
    wall,
    session,
    command,
    status,
    preview,
    interaction,
    controls,
    canvas: () => canvas,
    replaceCanvas: () => {
      canvas = new Canvas();
      return canvas;
    },
  };
}

describe('runtime interaction ownership and formal preview isolation', () => {
  test.each(['door', 'window'] as const)(
    '%s placement preserves the resolved raw offset when snapping is disabled or bypassed',
    (tool) => {
      for (const bypass of ['disabled', 'alt'] as const) {
        const value = fixture(tool);
        value.session.snap.enabled = bypass !== 'disabled';
        const center = 1.23456789;
        const expected = center - (tool === 'door' ? 0.45 : 0.6);
        value
          .canvas()
          .dispatchEvent(
            Object.assign(pointer('pointermove', center, 0), { altKey: bypass === 'alt' }),
          );
        expect(value.preview.mesh.position.x).toBeCloseTo(center, 14);
        expect(value.core.getSnapshot().openings).toHaveLength(0);
        value
          .canvas()
          .dispatchEvent(
            Object.assign(pointer('pointerdown', center, 0), { altKey: bypass === 'alt' }),
          );
        expect(value.core.getSnapshot().openings[0].offset).toBe(expected);
        expect(value.command).toHaveBeenCalledOnce();
        expect(value.core.getHistoryState().undoCount).toBe(1);
      }
    },
  );
  test('body drag previews without document writes and commits exactly one command on release', () => {
    const value = fixture();
    const document = value.core.getSnapshot();
    value.canvas().dispatchEvent(pointer('pointerdown'));
    expect(value.canvas().captured).toEqual(new Set([1]));
    expect(value.controls.enabled).toBe(false);
    value.canvas().dispatchEvent(pointer('pointermove', 1.05, 1.03));
    expect(value.preview.diagnostics()).toMatchObject({ visible: true, valid: true });
    expect(value.interaction.diagnostics().dragging).toBe(true);
    expect(value.core.getSnapshot()).toBe(document);
    expect(value.core.getHistoryState().undoCount).toBe(0);
    value.canvas().dispatchEvent(pointer('pointerup', 1.05, 1.03));
    expect(value.command).toHaveBeenCalledTimes(1);
    expect(value.core.getSnapshot().walls[0]).toMatchObject({
      start: { x: 1, z: 1 },
      end: { x: 5, z: 1 },
    });
    expect(value.core.getHistoryState().undoCount).toBe(1);
    expect(value.canvas().captured.size).toBe(0);
    expect(value.controls.enabled).toBe(true);
    expect(value.preview.mesh.visible).toBe(false);
    value.canvas().dispatchEvent(pointer('pointerup'));
    expect(value.command).toHaveBeenCalledTimes(1);
  });

  test.each(['cancel', 'pointercancel', 'blur'] as const)(
    '%s restores the initial state, releases capture and creates no history',
    (action) => {
      const value = fixture();
      const document = value.core.getSnapshot();
      value.canvas().dispatchEvent(pointer('pointerdown'));
      value.canvas().dispatchEvent(pointer('pointermove', 1.05, 1.03));
      if (action === 'cancel') {
        value.interaction.cancel();
      } else if (action === 'blur') {
        window.dispatchEvent(new Event('blur'));
      } else {
        value.canvas().dispatchEvent(pointer('pointercancel'));
      }
      expect(value.core.getSnapshot()).toBe(document);
      expect(value.core.getHistoryState().undoCount).toBe(0);
      expect(value.command).not.toHaveBeenCalled();
      expect(value.canvas().captured.size).toBe(0);
      expect(value.interaction.active).toBe(false);
      expect(value.controls.enabled).toBe(true);
      expect(value.preview.mesh.visible).toBe(false);
    },
  );

  test('a formal revision change cancels the old gesture before it can submit its stale draft', () => {
    const value = fixture();
    value.canvas().dispatchEvent(pointer('pointerdown'));
    value.canvas().dispatchEvent(pointer('pointermove', 1.05, 1.03));
    const changed = value.core.execute({
      type: 'update-wall',
      id: value.wall.id,
      patch: { end: { x: 6, z: 0 } },
    });
    if (!changed.ok) {
      throw new Error(changed.error.code);
    }
    value.interaction.sync(value.core.getSnapshot(), changed.changeSet);
    value.canvas().dispatchEvent(pointer('pointerup', 1.05, 1.03));
    expect(value.status).toHaveBeenCalledWith('transaction.stale');
    expect(value.command).not.toHaveBeenCalled();
    expect(value.core.getSnapshot().walls[0].end).toEqual({ x: 6, z: 0 });
    expect(value.core.getHistoryState().undoCount).toBe(1);
    expect(value.canvas().captured.size).toBe(0);
    expect(value.preview.mesh.visible).toBe(false);
  });

  test.each(['wall', 'slab'] as const)(
    '%s drawing survives temporary right-button camera navigation and submits from its retained start',
    (tool) => {
      const value = fixture(tool);
      const document = value.core.getSnapshot();
      value.canvas().dispatchEvent(pointer('pointerdown', 0, 1));
      value.canvas().dispatchEvent(pointer('pointermove', 2, 2));
      const retained = value.interaction.diagnostics().state;
      expect(value.preview.mesh.visible).toBe(true);
      value
        .canvas()
        .dispatchEvent(Object.assign(pointer('pointerdown', 2, 2, 2), { button: 2, buttons: 2 }));
      value.interaction.onCameraChange();
      value.canvas().dispatchEvent(pointer('pointermove', 6, 6, 2));
      expect(value.interaction.diagnostics().state).toEqual(retained);
      expect(value.preview.mesh.visible).toBe(true);
      expect(value.core.getSnapshot()).toBe(document);
      expect(value.command).not.toHaveBeenCalled();
      value.canvas().dispatchEvent(pointer('pointerup', 6, 6, 2));
      value.canvas().dispatchEvent(pointer('pointermove', 3, 2));
      value.canvas().dispatchEvent(pointer('pointerdown', 3, 2));
      expect(value.command).toHaveBeenCalledOnce();
      expect(value.core.getHistoryState().undoCount).toBe(1);
      if (tool === 'wall') {
        expect(value.core.getSnapshot().walls[1]).toMatchObject({
          start: { x: 0, z: 1 },
          end: { x: 3, z: 1 },
        });
      } else {
        expect(value.core.getSnapshot().slabs[0].polygon).toEqual([
          { x: 0, z: 1 },
          { x: 3, z: 1 },
          { x: 3, z: 2 },
          { x: 0, z: 2 },
        ]);
      }
    },
  );

  test('camera mode buttons suspend drawing while a floor change cancels it', () => {
    const value = fixture('wall');
    const document = value.core.getSnapshot();
    value.canvas().dispatchEvent(pointer('pointerdown', 0, 1));
    value.canvas().dispatchEvent(pointer('pointermove', 2, 1));
    const retained = value.interaction.diagnostics().state;
    value.session.cameraMode = 'pan';
    value.interaction.setSession();
    value.interaction.onCameraChange();
    expect(value.controls.mouseButtons.LEFT).toBe(THREE.MOUSE.PAN);
    expect(value.interaction.diagnostics().state).toEqual(retained);
    value.session.cameraMode = 'edit';
    value.interaction.setSession();
    expect(value.interaction.diagnostics().state).toEqual(retained);
    expect(value.session.snap.enabled).toBe(true);
    expect(value.core.getSnapshot()).toBe(document);
    expect(value.command).not.toHaveBeenCalled();
    value.session.levelId = 'level_2';
    value.interaction.setSession();
    expect(value.interaction.diagnostics().state).toEqual({ kind: 'idle', tool: 'wall' });
    expect(value.preview.mesh.visible).toBe(false);
  });

  test('camera reprojection cancels an object drag without submitting its draft', () => {
    const value = fixture();
    const document = value.core.getSnapshot();
    value.canvas().dispatchEvent(pointer('pointerdown'));
    value.canvas().dispatchEvent(pointer('pointermove', 1.05, 1.03));
    value.interaction.onCameraChange();
    value.canvas().dispatchEvent(pointer('pointerup', 1.05, 1.03));
    expect(value.interaction.diagnostics().dragging).toBe(false);
    expect(value.preview.mesh.visible).toBe(false);
    expect(value.canvas().captured.size).toBe(0);
    expect(value.controls.enabled).toBe(true);
    expect(value.core.getSnapshot()).toBe(document);
    expect(value.command).not.toHaveBeenCalled();
  });

  test('canvas replacement removes old listeners and disposal releases capture and owned preview resources once', () => {
    const value = fixture();
    const oldCanvas = value.canvas();
    const nextCanvas = value.replaceCanvas();
    value.interaction.bindCanvas();
    value.interaction.bindCanvas();
    expect(value.interaction.listenerCount).toBe(8);
    oldCanvas.dispatchEvent(pointer('pointerdown'));
    expect(value.interaction.diagnostics().dragging).toBe(false);
    nextCanvas.dispatchEvent(pointer('pointerdown'));
    nextCanvas.dispatchEvent(pointer('pointermove', 1.05, 1.03));
    expect(nextCanvas.setPointerCapture).toHaveBeenCalledTimes(1);
    const geometry = vi.spyOn(value.preview.mesh.geometry, 'dispose');
    const material = vi.spyOn(value.preview.mesh.material as THREE.Material, 'dispose');
    value.interaction.dispose();
    value.interaction.dispose();
    expect(nextCanvas.captured.size).toBe(0);
    expect(value.interaction.listenerCount).toBe(0);
    nextCanvas.dispatchEvent(pointer('pointerdown'));
    window.dispatchEvent(new Event('blur'));
    expect(nextCanvas.setPointerCapture).toHaveBeenCalledTimes(1);
    expect(value.command).not.toHaveBeenCalled();
    expect(geometry).not.toHaveBeenCalled();
    value.preview.dispose();
    value.preview.dispose();
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
  });
});
