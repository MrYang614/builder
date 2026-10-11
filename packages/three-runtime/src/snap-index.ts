import {
  buildSnapCandidates,
  prepareSnapCandidates,
  resolveSnapPoint,
  type ChangeSet,
  type ProjectDocument,
  type SnapCandidate,
  type SnapResult,
  type SnapSettings,
  type Vec2,
} from '@building/editor-core';
import { buildEffectiveWallSnapCandidates } from '@building/building-geometry';
import type { SnapAxisConstraint } from './drag-anchor';

interface SnapSession {
  levelId: string;
  hiddenIds: readonly string[];
  snap: SnapSettings;
}
interface Group {
  signature: string;
  candidates: SnapCandidate[];
}

/** Retains formal object candidates; only changed geometry rebuilds its group. */
export class RuntimeSnapIndex {
  private document: ProjectDocument | null = null;
  private levelId = '';
  private groups = new Map<string, Group>();
  private candidates: SnapCandidate[] = [];
  private boundaryKey = '';
  private boundaryGroups = new Map<string, Group>();
  private boundaryBuilds = 0;
  private boundaryGroupBuilds = 0;
  private hiddenKey = '';
  private hiddenReference: readonly string[] | null = null;
  private dirty = true;
  private feedbackKey = '';
  private rebuilds = 0;
  private objectBuilds = 0;
  private queries = 0;
  private queryMs = 0;

  /** Releases cached project references on floor/project transitions or disposal. */
  reset(status?: (code: string) => void): void {
    this.clearFeedback(status);
    this.document = null;
    this.groups.clear();
    this.candidates = [];
    this.boundaryKey = '';
    this.boundaryGroups.clear();
    this.hiddenReference = null;
    this.dirty = true;
  }

  /** Re-solves exposed wall topology only after geometric changes, retaining unchanged owner groups. */
  private boundaries(document: ProjectDocument): SnapCandidate[] {
    const walls = document.walls
      .filter((wall) => wall.levelId === this.levelId)
      .sort((a, b) => a.id.localeCompare(b.id));
    const key = JSON.stringify(
      walls.map((wall) => [wall.id, wall.start, wall.end, wall.thickness, wall.height]),
    );
    if (key !== this.boundaryKey) {
      const groups = new Map<string, SnapCandidate[]>();
      for (const candidate of buildEffectiveWallSnapCandidates(document, this.levelId)) {
        const group = groups.get(candidate.objectId) ?? [];
        group.push(candidate);
        groups.set(candidate.objectId, group);
      }
      for (const id of this.boundaryGroups.keys()) {
        if (!groups.has(id)) {
          this.boundaryGroups.delete(id);
        }
      }
      for (const [id, candidates] of groups) {
        const signature = JSON.stringify(candidates);
        if (this.boundaryGroups.get(id)?.signature !== signature) {
          this.boundaryGroups.set(id, { signature, candidates });
          this.boundaryGroupBuilds++;
        }
      }
      this.boundaryKey = key;
      this.boundaryBuilds++;
    }
    return [...this.boundaryGroups.values()].flatMap((group) => group.candidates);
  }

  /** Clears target announcements without discarding camera-independent world geometry. */
  clearFeedback(status?: (code: string) => void): void {
    if (status && this.feedbackKey) {
      status('snap.none');
    }
    this.feedbackKey = '';
  }

  /** Applies a ChangeSet to geometry groups, preserving indexes for material-only changes. */
  sync(document: ProjectDocument, changes?: ChangeSet): void {
    if (!this.levelId) {
      return;
    }
    if (document.id !== this.document?.id || changes?.full) {
      this.groups.clear();
      this.dirty = true;
    }
    const ids =
      changes &&
      this.document?.id === document.id &&
      !changes.full &&
      changes.projectId === document.id &&
      changes.revision === document.revision &&
      changes.previousRevision === this.document.revision
        ? new Set(changes.affectedIds)
        : null;
    const walls = new Map(document.walls.map((w) => [w.id, w]));
    const objects = [...document.walls, ...document.slabs, ...document.openings].filter(
      (object) => object.levelId === this.levelId,
    );
    const present = new Set(objects.map((object) => object.id));
    for (const id of this.groups.keys()) {
      if (!present.has(id)) {
        this.groups.delete(id);
        this.dirty = true;
      }
    }
    for (const object of objects) {
      const host = 'wallId' in object ? walls.get(object.wallId) : undefined;
      if (
        ids &&
        !ids.has(object.id) &&
        !(host && ids.has(host.id)) &&
        !changes?.levelIds.includes(object.levelId) &&
        this.groups.has(object.id)
      ) {
        continue;
      }
      const geometry =
        'start' in object
          ? [object.levelId, object.start, object.end, object.thickness, object.height]
          : 'polygon' in object
            ? [object.levelId, object.polygon]
            : [
                object.levelId,
                object.wallId,
                object.offset,
                object.width,
                host?.start,
                host?.end,
                host?.thickness,
              ];
      const signature = JSON.stringify(geometry);
      if (this.groups.get(object.id)?.signature === signature) {
        continue;
      }
      const subset = {
        ...document,
        walls: 'start' in object ? [object] : host ? [host] : [],
        slabs: 'polygon' in object ? [object] : [],
        openings: 'wallId' in object ? [object] : [],
      };
      const candidates = buildSnapCandidates(subset, { levelId: this.levelId }).filter(
        (candidate) => candidate.objectId === object.id,
      );
      this.groups.set(object.id, { signature, candidates });
      this.objectBuilds++;
      this.dirty = true;
    }
    this.document = document;
  }

  /** Sends localized type feedback only on transitions, avoiding per-pointer React updates. */
  publishFeedback(result: SnapResult, status: (code: string) => void): void {
    const key = result.labelKey ?? '';
    if (key === this.feedbackKey) {
      return;
    }
    if (key) {
      status(key);
    } else if (this.feedbackKey) {
      status('snap.none');
    }
    this.feedbackKey = key;
  }

  /** Queries retained current-level formal geometry; helpers and ghosts never enter this index. */
  resolve(
    raw: { x: number; z: number },
    document: ProjectDocument,
    levelId: string,
    hiddenIds: readonly string[],
    settings: SnapSettings,
    excludeId?: string,
    constraint?: SnapAxisConstraint,
    distanceOrigin?: Vec2,
  ): SnapResult {
    const started = performance.now();
    if (this.levelId !== levelId || this.document?.id !== document.id) {
      this.reset();
      this.levelId = levelId;
    }
    if (this.document !== document) {
      this.sync(document);
    }
    if (this.hiddenReference !== hiddenIds) {
      const key = [...hiddenIds].sort().join('|');
      this.dirty ||= key !== this.hiddenKey;
      this.hiddenKey = key;
      this.hiddenReference = hiddenIds;
    }
    if (this.dirty) {
      const hidden = new Set(hiddenIds);
      const candidates = [
        ...[...this.groups.values()]
          .flatMap((group) => group.candidates)
          .filter((candidate) => candidate.targetKind !== 'wall-edge'),
        ...this.boundaries(document),
      ].filter(
        (candidate) =>
          !hidden.has(candidate.objectId) &&
          !candidate.relatedObjectIds?.some((id) => hidden.has(id)),
      );
      this.candidates = prepareSnapCandidates(candidates, { levelId });
      this.dirty = false;
      this.rebuilds++;
    }
    const result = resolveSnapPoint(raw, this.candidates, settings, {
      levelId,
      excludeId,
      prepared: true,
      constraint,
      distanceOrigin,
    });
    this.queries++;
    this.queryMs += performance.now() - started;
    return result;
  }

  /** Alt/Option and disabled snapping preserve the original projected input exactly. */
  resolvePointer(
    raw: { x: number; z: number },
    bypass: boolean,
    document: ProjectDocument,
    session: SnapSession,
    excludeId?: string,
    constraint?: SnapAxisConstraint,
    distanceOrigin?: Vec2,
  ): SnapResult {
    return bypass || !session.snap.enabled
      ? { point: { ...raw }, kind: 'raw', distance: 0, levelId: session.levelId }
      : this.resolve(
          raw,
          document,
          session.levelId,
          session.hiddenIds,
          session.snap,
          excludeId,
          constraint,
          distanceOrigin,
        );
  }

  /** Read-only counters support reproducible browser timings without publishing frame state. */
  diagnostics() {
    return {
      rebuilds: this.rebuilds,
      objectBuilds: this.objectBuilds,
      boundaryBuilds: this.boundaryBuilds,
      boundaryGroupBuilds: this.boundaryGroupBuilds,
      queries: this.queries,
      queryMs: this.queryMs,
      candidates: this.candidates.length,
    };
  }
}
