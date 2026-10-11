import type { ChangeSet, ProjectDocument } from '@building/editor-core';
import { doorRadians, type BuiltObject } from './scene';
import type { BuildingChanges } from './runtime-building';
import type { RuntimeOptions } from './runtime-contracts';

type Playback = { from: number; to: number; start: number; duration: number };
const sampledAngle = (animation: Playback, time: number) =>
  animation.from +
  (animation.to - animation.from) *
    Math.max(0, Math.min(1, (time - animation.start) / animation.duration));

interface AnimationHooks {
  document(): ProjectDocument;
  snapshotDocument(): ProjectDocument;
  object(id: string): BuiltObject | undefined;
  selectedId(): string | null;
  updateSelection(root: BuiltObject['root']): void;
  command: RuntimeOptions['command'];
  invalidate(): void;
}

/** Owns transient door poses; only completed playback commits an angle to EditorCore. */
export class RuntimeAnimations {
  private animations = new Map<string, Playback>();
  private liveAngles = new Map<string, number>();

  constructor(private hooks: AnimationHooks) {}

  get active(): boolean {
    return this.animations.size > 0;
  }

  /** Reconciles formal edits and reapplies remaining live poses to rebuilt door meshes. */
  sync(delta: BuildingChanges, doc: ProjectDocument, changes?: ChangeSet): void {
    if (delta.replace) {
      this.clear();
    }
    for (const [id] of this.animations) {
      const old = delta.previous.openings.find((o) => o.id === id),
        next = doc.openings.find((o) => o.id === id);
      if (
        !next ||
        old?.angle !== next.angle ||
        (['undo', 'redo'].includes(changes?.reason ?? '') && delta.changed.has(id))
      ) {
        this.animations.delete(id);
        this.liveAngles.delete(id);
      }
    }
    for (const [id, angle] of this.liveAngles) {
      this.setPose(id, angle);
    }
  }

  /** Advances one stable playback snapshot because a final command can synchronously change the map. */
  advance(time: number): boolean {
    // oxlint-disable-next-line unicorn/no-useless-spread -- Completing a door submits a command that can mutate the animation Map.
    for (const [id, animation] of [...this.animations]) {
      const angle = sampledAngle(animation, time);
      this.liveAngles.set(id, angle);
      this.setPose(id, angle);
      if (time >= animation.start + animation.duration) {
        this.animations.delete(id);
        this.liveAngles.delete(id);
        if (!this.hooks.command({ type: 'update-opening', id, patch: { angle: animation.to } })) {
          const formal = this.hooks.document().openings.find((o) => o.id === id);
          if (formal) {
            this.setPose(id, formal.angle);
          }
        }
      }
    }
    return this.active;
  }

  /** Starts or reverses from the sampled live pose instead of jumping back to the formal angle. */
  animate(id: string, to: number): void {
    const door = this.hooks.document().openings.find((o) => o.id === id && o.kind === 'door');
    if (!door) {
      return;
    }
    const time = performance.now(),
      current = this.animations.get(id);
    this.animations.set(id, {
      from: current ? sampledAngle(current, time) : (this.liveAngles.get(id) ?? door.angle),
      to,
      start: time,
      duration: Math.max(1, door.duration * 1000),
    });
    this.hooks.invalidate();
  }

  private setPose(id: string, angle: number): void {
    const document = this.hooks.document(),
      opening = document.openings.find((o) => o.id === id),
      root = this.hooks.object(id)?.root;
    if (!opening || !root) {
      return;
    }
    const pivot = root.getObjectByName(`HingePivot_${id}`);
    if (pivot) {
      pivot.rotation.y = doorRadians(
        opening,
        document.walls.find((wall) => wall.id === opening.wallId),
        angle,
      );
    }
    if (this.hooks.selectedId() === id) {
      this.hooks.updateSelection(root);
    }
  }

  /** Captures independent live angles for export/path tracing without changing the formal document. */
  snapshot(): ProjectDocument {
    const document = this.hooks.snapshotDocument();
    if (!this.animations.size && !this.liveAngles.size) {
      return document;
    }
    const time = performance.now();
    return {
      ...document,
      openings: document.openings.map((opening) => {
        const animation = this.animations.get(opening.id),
          angle = animation ? sampledAngle(animation, time) : this.liveAngles.get(opening.id);
        return angle === undefined ? opening : { ...opening, angle };
      }),
    };
  }

  diagnostics(): string[] {
    return [...this.animations.keys()];
  }

  /** Drops transient poses on project replacement or runtime disposal. */
  clear(): void {
    this.animations.clear();
    this.liveAngles.clear();
  }
}
