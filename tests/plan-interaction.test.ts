import { describe, expect, test, vi } from 'vitest';
import {
  EditorCore,
  SessionStore,
  createEmptyProject,
  createWall,
  createSlab,
  createOpening,
  type ProjectDocument,
  type Command,
} from '@building/editor-core';
import { CommandGateway } from '../apps/desktop/src/app/command-gateway';
import { PlanInteraction, type PlanPreview } from '../apps/desktop/src/plan-view/interaction';
import {
  fitPlanCamera,
  planToScreen,
  screenToPlan,
  worldToPlan,
  planToWorld,
  zoomPlanCamera,
} from '../apps/desktop/src/plan-view/coordinates';

function setup(document = createEmptyProject()) {
  const core = new EditorCore(document),
    commands = new CommandGateway(core);
  const session = new SessionStore(document.levels[0]!.id);
  session.set({ snap: { ...session.getSnapshot().snap, enabled: false } });
  let preview: PlanPreview | null = null;
  const status = vi.fn();
  const submit = vi.fn((command: Command) => commands.execute(command).ok);
  const plan = new PlanInteraction({
    getDocument: core.getSnapshot,
    getSession: session.getSnapshot,
    submit,
    select: (id) => session.set({ selectedId: id ?? undefined }),
    activateTool: (tool) => session.set({ tool }),
    status,
    onPreview: (next) => {
      preview = next;
    },
  });
  core.subscribe(() => plan.reconcile());
  session.subscribe(() => plan.reconcile());
  return { core, commands, session, plan, status, submit, preview: () => preview };
}

function wallProject(): ProjectDocument {
  const doc = createEmptyProject();
  const wall = createWall('level_1', { x: 0, z: 0 }, { x: 6, z: 0 });
  wall.id = 'wall';
  doc.walls.push(wall);
  return doc;
}

describe('plan coordinate contract', () => {
  test('positive world Z maps down and round-trips CSS pixels without DPI quantization', () => {
    const camera = { center: { x: 2.3456789, z: -8.7654321 }, pixelsPerMeter: 37.25 };
    const rect = { left: 328, top: 104, width: 517, height: 391 };
    const world = { x: 1.234567891, z: -0.0123456789 };
    const screen = planToScreen(world, rect, camera),
      roundtrip = screenToPlan(screen, rect, camera);
    expect(roundtrip.x).toBeCloseTo(world.x, 12);
    expect(roundtrip.z).toBeCloseTo(world.z, 12);
    expect(planToWorld(worldToPlan(world))).toEqual(world);
    expect(planToScreen({ ...world, z: world.z + 1 }, rect, camera).y - screen.y).toBeCloseTo(
      37.25,
    );
  });
  test('zoom preserves the pointer anchor and fit excludes other floors', () => {
    const camera = { center: { x: 0, z: 0 }, pixelsPerMeter: 50 };
    const rect = { left: 10, top: 20, width: 600, height: 400 },
      anchor = { x: 2, z: -1 };
    expect(planToScreen(anchor, rect, zoomPlanCamera(camera, anchor, -300))).toEqual(
      planToScreen(anchor, rect, camera),
    );
    const doc = wallProject();
    doc.walls.push(createWall('level_2', { x: 1000, z: 1000 }, { x: 2000, z: 1000 }));
    expect(fitPlanCamera(doc, 'level_1', rect).center).toEqual({ x: 3, z: 0 });
    expect(fitPlanCamera(createEmptyProject(), 'level_1', rect).center).toEqual({ x: 0, z: 0 });
  });
});

describe('SVG plan formal command boundary', () => {
  test('wall chain uses orthogonal Core commands and previews never consume history', () => {
    const s = setup();
    s.session.set({ tool: 'wall' });
    s.plan.pointerDown({ x: 0, z: 0 });
    for (let x = 0.5; x < 4; x += 0.5) {
      s.plan.pointerMove({ x, z: 0.3 });
    }
    expect(s.core.getSnapshot().walls).toHaveLength(0);
    expect(s.submit).not.toHaveBeenCalled();
    s.plan.pointerDown({ x: 4, z: 0.3 });
    expect(s.core.getSnapshot().walls[0]!.end).toEqual({ x: 4, z: 0 });
    s.plan.pointerDown({ x: 4, z: 3 });
    expect(s.core.getSnapshot().walls).toHaveLength(2);
    expect(s.core.getHistoryState().undoCount).toBe(2);
    expect(s.status).not.toHaveBeenCalledWith('transaction.stale');
    s.commands.undo();
    expect(s.core.getSnapshot().walls).toHaveLength(1);
    s.commands.redo();
    expect(s.core.getSnapshot().walls).toHaveLength(2);
  });
  test('body movement retains grab offset and makes a single reversible history entry', () => {
    const s = setup(wallProject());
    const before = s.core.getSnapshot();
    s.plan.pointerDown({ x: 2, z: 0 }, { id: 'wall' });
    for (let z = 0.1; z <= 2; z += 0.1) {
      s.plan.pointerMove({ x: 3, z });
    }
    expect(s.core.getSnapshot()).toBe(before);
    expect(s.submit).not.toHaveBeenCalled();
    s.plan.pointerUp({ x: 3, z: 2 });
    expect(s.submit).toHaveBeenCalledTimes(1);
    expect(s.core.getSnapshot().walls[0]).toMatchObject({
      start: { x: 1, z: 2 },
      end: { x: 7, z: 2 },
    });
    s.commands.undo();
    expect(s.core.getSnapshot().walls).toEqual(before.walls);
  });
  test('clicking a fractional wall with snapping on does not silently normalize it', () => {
    const doc = wallProject();
    doc.walls[0]!.start = { x: 0.01234567891, z: 0 };
    const s = setup(doc),
      before = s.core.getSnapshot();
    s.session.set({ snap: { ...s.session.getSnapshot().snap, enabled: true } });
    s.plan.pointerDown({ x: 1, z: 0.06 }, { id: 'wall' });
    s.plan.pointerUp({ x: 1, z: 0.06 });
    expect(s.core.getSnapshot()).toBe(before);
    expect(s.submit).not.toHaveBeenCalled();
  });
  test('endpoint edit propagates its shared L junction through Core', () => {
    const doc = wallProject();
    const other = createWall('level_1', { x: 6, z: 0 }, { x: 6, z: 4 });
    doc.walls.push(other);
    const s = setup(doc);
    s.plan.pointerDown({ x: 6, z: 0 }, { id: 'wall', handle: 'end' });
    s.plan.pointerUp({ x: 8, z: 0.2 });
    expect(s.core.getSnapshot().walls[0]!.end).toEqual({ x: 8, z: 0 });
    expect(s.core.getSnapshot().walls[1]!.start).toEqual({ x: 8, z: 0 });
    expect(s.core.getHistoryState().undoCount).toBe(1);
  });
  test('door and window placement and movement keep the real host offset; invalid release stays atomic', () => {
    const s = setup(wallProject());
    s.session.set({ tool: 'door' });
    s.plan.pointerDown({ x: 2, z: 0 }, { id: 'wall' });
    s.session.set({ tool: 'window' });
    s.plan.pointerDown({ x: 4, z: 0 }, { id: 'wall' });
    expect(s.core.getSnapshot().openings).toHaveLength(2);
    const door = s.core.getSnapshot().openings[0]!;
    expect(door.offset).toBe(1.55);
    s.session.set({ tool: 'select' });
    s.plan.pointerDown({ x: 2, z: 0 }, { id: door.id });
    s.plan.pointerUp({ x: 1, z: 0 });
    expect(s.core.getSnapshot().openings[0]!.offset).toBeCloseTo(0.55);
    const before = s.core.getSnapshot(),
      history = s.core.getHistoryState();
    s.plan.pointerDown({ x: 1, z: 0 }, { id: door.id });
    s.plan.pointerUp({ x: -10, z: 0 });
    expect(s.core.getSnapshot()).toBe(before);
    expect(s.core.getHistoryState()).toEqual(history);
  });
  test('rectangular roof creation and corner resizing preserve elevation, purpose and materials', () => {
    const s = setup();
    s.session.set({ tool: 'slab', slabPurpose: 'roof', roofElevation: 3.25 });
    s.plan.pointerDown({ x: 0, z: 0 });
    s.plan.pointerDown({ x: 3, z: 2 });
    const slab = s.core.getSnapshot().slabs[0]!;
    expect(slab).toMatchObject({ purpose: 'roof', elevation: 3.25 });
    s.session.set({ tool: 'select' });
    s.plan.pointerDown({ x: 3, z: 2 }, { id: slab.id, handle: 2 });
    s.plan.pointerUp({ x: 4, z: 5 });
    expect(s.core.getSnapshot().slabs[0]).toMatchObject({
      purpose: 'roof',
      elevation: 3.25,
      thickness: slab.thickness,
      materials: slab.materials,
    });
    expect(s.core.getSnapshot().slabs[0]!.polygon[2]).toEqual({ x: 4, z: 5 });
  });
  test.each(['cancel', 'revision', 'replace', 'level', 'hidden', 'tool', 'selection'] as const)(
    '%s boundary cancels a drag without committing stale data',
    (boundary) => {
      const doc = wallProject();
      doc.levels.push({ id: 'level_2', name: '2', height: 3, elevation: 3 });
      const s = setup(doc);
      s.plan.pointerDown({ x: 1, z: 0 }, { id: 'wall' });
      s.plan.pointerMove({ x: 2, z: 1 });
      if (boundary === 'cancel') {
        s.plan.cancel();
      }
      if (boundary === 'revision') {
        s.commands.execute({ type: 'rename-project', name: 'Changed' });
      }
      if (boundary === 'replace') {
        s.commands.replace(structuredClone(doc));
      }
      if (boundary === 'level') {
        s.session.set({ currentLevelId: 'level_2' });
      }
      if (boundary === 'hidden') {
        s.session.set({ hiddenIds: ['wall'] });
      }
      if (boundary === 'tool') {
        s.session.set({ tool: 'slab' });
      }
      if (boundary === 'selection') {
        s.session.set({ selectedId: undefined });
      }
      const before = s.core.getSnapshot();
      s.plan.pointerUp({ x: 4, z: 1 });
      expect(s.core.getSnapshot()).toBe(before);
      expect(s.submit).not.toHaveBeenCalled();
      expect(s.preview()).toBeNull();
    },
  );
  test('noncurrent, hidden and preview-only objects cannot be edited', () => {
    const doc = wallProject();
    doc.levels.push({ id: 'level_2', name: '2', height: 3, elevation: 3 });
    const slab = createSlab('level_2', { x: 0, z: 0 }, { x: 2, z: 2 }, 3);
    doc.slabs.push(slab);
    const s = setup(doc);
    s.plan.pointerDown({ x: 1, z: 1 }, { id: slab.id });
    s.plan.pointerUp({ x: 2, z: 2 });
    s.session.set({ hiddenIds: ['wall'] });
    s.plan.pointerDown({ x: 1, z: 0 }, { id: 'wall' });
    s.plan.pointerUp({ x: 2, z: 1 });
    s.session.set({ wholeBuildingPreview: true, hiddenIds: [], tool: 'wall' });
    s.plan.pointerDown({ x: 10, z: 0 });
    s.plan.pointerDown({ x: 12, z: 0 });
    expect(s.submit).not.toHaveBeenCalled();
  });
  test('duplicate wall includes hosted doors in one command and keeps independent IDs', () => {
    const doc = wallProject();
    doc.openings.push(createOpening(doc.walls[0]!, 'door', 1));
    const s = setup(doc);
    s.session.set({ selectedId: 'wall' });
    s.plan.duplicateSelection();
    const after = s.core.getSnapshot();
    expect(after.walls).toHaveLength(2);
    expect(after.openings).toHaveLength(2);
    expect(after.openings[1]!.wallId).toBe(after.walls[1]!.id);
    expect(after.openings[1]!.id).not.toBe(after.openings[0]!.id);
    expect(s.core.getHistoryState().undoCount).toBe(1);
    s.commands.undo();
    expect(s.core.getSnapshot().walls).toHaveLength(1);
    expect(s.core.getSnapshot().openings).toHaveLength(1);
  });
  test('duplicate slab starts beyond its extent and remains one valid reversible object', () => {
    const doc = createEmptyProject();
    const slab = createSlab('level_1', { x: -3, z: -2 }, { x: 4, z: 3 });
    doc.slabs.push(slab);
    const s = setup(doc);
    s.session.set({ selectedId: slab.id });
    s.plan.duplicateSelection();
    expect(s.core.getSnapshot().slabs).toHaveLength(2);
    expect(s.core.getSnapshot().slabs[1]!.polygon[0]).toEqual({ x: 5, z: -2 });
    expect(s.core.getHistoryState().undoCount).toBe(1);
    expect(s.status).not.toHaveBeenCalledWith('transaction.stale');
  });
  test('exact endpoint snapping preserves target precision and Alt bypasses grid', () => {
    const doc = createEmptyProject();
    const wall = createWall(
      'level_1',
      { x: 1.234567891, z: 2.345678912 },
      { x: 6, z: 2.345678912 },
    );
    doc.walls.push(wall);
    const s = setup(doc);
    s.session.set({
      tool: 'wall',
      snap: { ...s.session.getSnapshot().snap, enabled: true, mode: 'points' },
    });
    s.plan.pointerDown({ x: 1.25, z: 2.35 });
    s.plan.pointerDown({ x: 1.25, z: 5 });
    expect(s.core.getSnapshot().walls[1]!.start).toEqual(wall.start);
    s.plan.cancel();
    s.session.set({ snap: { ...s.session.getSnapshot().snap, mode: 'grid' } });
    s.plan.pointerDown({ x: 10.01234567891, z: 10.02345678912 }, undefined, { altKey: true });
    s.plan.pointerDown({ x: 12.01234567891, z: 10.02345678912 }, undefined, { altKey: true });
    expect(s.core.getSnapshot().walls[2]!.start).toEqual({ x: 10.01234567891, z: 10.02345678912 });
  });
});
