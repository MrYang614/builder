import {
  DEFAULTS,
  buildSnapCandidates,
  prepareSnapCandidates,
  resolveSnapPoint,
  createWall,
  createSlab,
  createOpening,
  dragAnchor,
  dragGeometry,
  ToolStateMachine,
  wallOffset,
  type Command,
  type DragAnchor,
  type EditorSession,
  type ProjectDocument,
  type SnapCandidate,
  type SnapResult,
  type Tool,
  type Vec2,
  type Wall,
} from '@building/editor-core';
import { buildEffectiveWallSnapCandidates } from '@building/building-geometry';
import { duplicatePlanObject, planObjectCommand, type PlanObject } from './interaction-commands';

export interface PlanTarget {
  id: string;
  handle?: 'start' | 'end' | number;
}
export interface PlanPointerOptions {
  altKey?: boolean;
}
export interface PlanPreview {
  object?: PlanObject;
  point?: Vec2;
  snap?: SnapResult;
  start?: Vec2;
}
export interface PlanInteractionHooks {
  getDocument(): ProjectDocument;
  getSession(): EditorSession;
  submit(command: Command): boolean;
  select(id: string | null, surface?: string): void;
  activateTool(tool: Tool): void;
  status(key: string): void;
  onPreview(preview: PlanPreview | null): void;
}
interface Drag extends DragAnchor {
  rawStart: Vec2;
  initial: PlanObject;
  draft: PlanObject;
  endpoint?: 'start' | 'end';
  corner?: number;
}

/** Owns local SVG drafts only. DOM capture belongs to the view; Core receives one command on release. */
export class PlanInteraction {
  private readonly tools = new ToolStateMachine();
  private document: ProjectDocument;
  private session: EditorSession;
  private drag?: Drag;
  private candidates: SnapCandidate[] = [];
  private previewId?: string;

  constructor(private readonly hooks: PlanInteractionHooks) {
    this.document = hooks.getDocument();
    this.session = hooks.getSession();
    this.tools.handle({ type: 'activate', tool: this.session.tool });
    this.rebuildCandidates();
  }

  /** Cancels gestures on document/session boundaries, including replacement at an identical revision. */
  reconcile(): void {
    const document = this.hooks.getDocument(),
      session = this.hooks.getSession();
    const changed = document !== this.document;
    const context =
      session.tool !== this.session.tool ||
      session.currentLevelId !== this.session.currentLevelId ||
      (!!this.drag && session.selectedId !== this.session.selectedId) ||
      session.wholeBuildingPreview !== this.session.wholeBuildingPreview ||
      session.hiddenIds !== this.session.hiddenIds;
    if (changed || context) {
      const stale = changed && this.active;
      this.cancel();
      if (stale) {
        this.hooks.status('transaction.stale');
      }
    }
    const rebuild =
      changed ||
      session.currentLevelId !== this.session.currentLevelId ||
      session.hiddenIds !== this.session.hiddenIds;
    this.document = document;
    this.session = session;
    if (context) {
      this.tools.handle({ type: 'activate', tool: session.tool });
    }
    if (rebuild) {
      this.rebuildCandidates();
    }
  }

  private rebuildCandidates(): void {
    const hidden = new Set(this.session.hiddenIds);
    const document = {
      ...this.document,
      walls: this.document.walls.filter((o) => !hidden.has(o.id)),
      slabs: this.document.slabs.filter((o) => !hidden.has(o.id)),
      openings: this.document.openings.filter((o) => !hidden.has(o.id) && !hidden.has(o.wallId)),
    };
    this.candidates = prepareSnapCandidates([
      ...buildSnapCandidates(document, { levelId: this.session.currentLevelId }).filter(
        (c) => c.targetKind !== 'wall-edge',
      ),
      ...buildEffectiveWallSnapCandidates(document, this.session.currentLevelId),
    ]);
  }

  private object(target?: PlanTarget): PlanObject | undefined {
    if (!target) {
      return undefined;
    }
    return [...this.document.walls, ...this.document.slabs, ...this.document.openings].find(
      (o) =>
        o.id === target.id &&
        o.levelId === this.session.currentLevelId &&
        !this.session.hiddenIds.includes(o.id) &&
        (!('wallId' in o) || !this.session.hiddenIds.includes(o.wallId)),
    );
  }

  private host(target?: PlanTarget): Wall | undefined {
    const object = this.object(target);
    if (!object) {
      return undefined;
    }
    if ('start' in object) {
      return object;
    }
    return 'wallId' in object
      ? this.document.walls.find((wall) => wall.id === object.wallId)
      : undefined;
  }

  private snap(raw: Vec2, options: PlanPointerOptions): SnapResult {
    const drag = this.drag;
    const offset = drag?.pointerOffset;
    const anchor = { x: raw.x + (offset?.x ?? 0), z: raw.z + (offset?.z ?? 0) };
    const state = this.tools.getState();
    const constraint =
      drag?.constraint ??
      ((state.kind === 'start' || state.kind === 'preview') && state.tool === 'wall'
        ? Math.abs(anchor.x - state.start.x) >= Math.abs(anchor.z - state.start.z)
          ? { z: state.start.z }
          : { x: state.start.x }
        : undefined);
    const projected = { x: constraint?.x ?? anchor.x, z: constraint?.z ?? anchor.z };
    const result = resolveSnapPoint(
      projected,
      this.candidates,
      { ...this.session.snap, enabled: this.session.snap.enabled && !options.altKey },
      {
        levelId: this.session.currentLevelId,
        excludeId: drag?.initial.id,
        prepared: true,
        constraint,
        distanceOrigin: anchor,
      },
    );
    return result;
  }

  /** Selects or starts a click-based tool; targets must come from stable object IDs, never SVG geometry. */
  pointerDown(point: Vec2, target?: PlanTarget, options: PlanPointerOptions = {}): void {
    this.reconcile();
    if (this.session.wholeBuildingPreview) {
      return;
    }
    const tool = this.session.tool;
    if (tool === 'select' || tool === 'material') {
      const object = this.object(target);
      this.hooks.select(object?.id ?? null, object && 'polygon' in object ? 'top' : 'A');
      if (!object || tool === 'material') {
        return;
      }
      const endpoint =
        target?.handle === 'start' || target?.handle === 'end' ? target.handle : undefined;
      const corner = typeof target?.handle === 'number' ? target.handle : undefined;
      if (
        (endpoint && !('start' in object)) ||
        (corner !== undefined && (!('polygon' in object) || !object.polygon[corner]))
      ) {
        return;
      }
      this.drag = {
        initial: object,
        draft: object,
        endpoint,
        corner,
        rawStart: point,
        ...dragAnchor(
          object,
          this.document,
          point,
          this.session.snap.enabled && this.session.snap.mode !== 'off' && !options.altKey,
          endpoint,
          corner,
        ),
      };
      return;
    }
    const snap = this.snap(point, options);
    if (tool === 'door' || tool === 'window') {
      const wall = this.host(target);
      if (!wall) {
        return;
      }
      const opening = createOpening(
        wall,
        tool,
        wallOffset(snap.point, wall) -
          (tool === 'door' ? DEFAULTS.doorWidth : DEFAULTS.windowWidth) / 2,
      );
      this.commit(planObjectCommand(opening, true));
      return;
    }
    const intent = this.tools.handle({ type: 'click', point: snap.point });
    if (!intent || (intent.type !== 'create-wall' && intent.type !== 'create-slab')) {
      this.hooks.onPreview({ point: snap.point, start: snap.point, snap });
      this.hooks.status('hintEnd');
      return;
    }
    const object = this.createObject(tool, intent.start, intent.end);
    if (this.commit(planObjectCommand(object, true))) {
      this.tools.handle({ type: 'activate', tool });
      if (tool === 'wall') {
        this.tools.handle({ type: 'click', point: intent.end });
      }
      this.hooks.status(tool === 'wall' ? 'hintEnd' : 'hintStart');
    } else {
      this.tools.reject(intent);
      this.hooks.onPreview({ object, point: snap.point, start: intent.start, snap });
    }
  }

  private createObject(tool: Tool, start: Vec2, end: Vec2): PlanObject {
    const level = this.document.levels.find((l) => l.id === this.session.currentLevelId)!;
    return tool === 'wall'
      ? createWall(level.id, start, end)
      : createSlab(
          level.id,
          start,
          end,
          this.session.slabPurpose === 'roof'
            ? (this.session.roofElevation ?? level.elevation + level.height)
            : level.elevation,
          this.session.slabPurpose,
        );
  }

  /** Moves only local parameters and cached snap queries; no full document validation runs per pointer event. */
  pointerMove(point: Vec2, target?: PlanTarget, options: PlanPointerOptions = {}): void {
    this.reconcile();
    if (this.session.wholeBuildingPreview) {
      return;
    }
    const snap = this.snap(point, options);
    if (this.drag) {
      const drag = this.drag;
      if (
        point.x === drag.rawStart.x &&
        point.z === drag.rawStart.z &&
        drag.draft === drag.initial
      ) {
        return;
      }
      const hostId = 'wallId' in drag.initial ? drag.initial.wallId : undefined;
      const host = this.document.walls.find((w) => w.id === hostId);
      drag.draft = dragGeometry(
        drag.initial,
        drag.start,
        snap.point,
        drag.endpoint,
        drag.corner,
        host,
        this.session.snap.enabled && this.session.snap.mode !== 'off' && !options.altKey,
      );
      this.hooks.onPreview({ object: drag.draft, point: snap.point, snap });
      return;
    }
    this.tools.handle({ type: 'move', point: snap.point });
    const state = this.tools.getState();
    let object: PlanObject | undefined;
    if (state.kind === 'preview') {
      object = this.createObject(state.tool, state.start, state.end);
    } else if (this.session.tool === 'door' || this.session.tool === 'window') {
      const wall = this.host(target),
        kind = this.session.tool;
      if (wall) {
        object = createOpening(
          wall,
          kind,
          wallOffset(snap.point, wall) -
            (kind === 'door' ? DEFAULTS.doorWidth : DEFAULTS.windowWidth) / 2,
        );
      }
    }
    if (object) {
      this.previewId ??= object.id;
      object.id = this.previewId;
    }
    this.hooks.onPreview({
      object,
      point: snap.point,
      snap,
      start: state.kind === 'preview' || state.kind === 'start' ? state.start : undefined,
    });
  }

  /** A release submits at most once, after transient state is cleared for synchronous Core subscribers. */
  pointerUp(point?: Vec2, options: PlanPointerOptions = {}): void {
    this.reconcile();
    if (!this.drag) {
      return;
    }
    if (point) {
      this.pointerMove(point, undefined, options);
    }
    const drag = this.drag;
    this.drag = undefined;
    this.hooks.onPreview(null);
    if (JSON.stringify(drag.initial) !== JSON.stringify(drag.draft)) {
      this.commit(planObjectCommand(drag.draft, false));
    }
  }

  private commit(command: Command): boolean {
    this.cancel();
    const accepted = this.hooks.submit(command);
    this.document = this.hooks.getDocument();
    this.session = this.hooks.getSession();
    this.rebuildCandidates();
    return accepted;
  }

  /** Escape, blur, capture loss and view unmount all discard drafts without consuming history. */
  cancel(exitTool = false): void {
    const idle = !this.active;
    this.drag = undefined;
    this.previewId = undefined;
    this.tools.handle({ type: 'activate', tool: this.hooks.getSession().tool });
    this.hooks.onPreview(null);
    if (exitTool && idle) {
      this.hooks.activateTool('select');
    }
  }

  /** Duplicates one current-floor object through the common command gateway and selects the accepted copy. */
  duplicateSelection(): void {
    this.reconcile();
    if (this.session.wholeBuildingPreview) {
      return;
    }
    const object = this.object({ id: this.session.selectedId ?? '' });
    if (!object) {
      return;
    }
    const result = duplicatePlanObject(this.document, object);
    if (this.commit(result.command)) {
      this.hooks.select(result.id);
    }
  }

  get active(): boolean {
    return !!this.drag || this.tools.getState().kind !== 'idle';
  }
}
