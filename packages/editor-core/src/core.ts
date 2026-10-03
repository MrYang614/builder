import type {
  Level,
  EnvironmentSettings,
  EnvironmentResource,
  Opening,
  ProjectDocument,
  Resource,
  Slab,
  SurfaceBinding,
  TextureContinuity,
  Wall,
} from './model';
import { createEmptyProject, createId } from './model';
import { EPSILON, samePoint, validateDocument, wallsConnected } from './validation';
import type { DomainError } from './validation';
import { documentWarnings } from './queries';
import type { DomainWarning } from './queries';
import { propagateWallEndpoints } from './topology';

export type Command =
  | { type: 'add-wall'; wall: Wall }
  | { type: 'update-wall'; id: string; patch: Partial<Omit<Wall, 'id'>> }
  | { type: 'delete-wall'; id: string }
  | { type: 'add-slab'; slab: Slab }
  | { type: 'update-slab'; id: string; patch: Partial<Omit<Slab, 'id'>> }
  | { type: 'delete-slab'; id: string }
  | { type: 'add-opening'; opening: Opening }
  | { type: 'update-opening'; id: string; patch: Partial<Omit<Opening, 'id'>> }
  | { type: 'delete-opening'; id: string }
  | { type: 'add-level'; level: Level }
  | { type: 'update-level'; id: string; patch: Partial<Omit<Level, 'id'>>; moveAbove?: boolean }
  | { type: 'delete-level'; id: string }
  | {
      type: 'set-material';
      objectId: string;
      side: 'A' | 'B' | 'edge' | 'top' | 'bottom';
      binding: SurfaceBinding;
      applyContinuity?: boolean;
    }
  | { type: 'add-resource'; resource: Resource }
  | { type: 'delete-resource'; id: string }
  | { type: 'set-environment'; environment: EnvironmentSettings }
  | { type: 'add-environment-resource'; resource: EnvironmentResource }
  | { type: 'delete-environment-resource'; id: string }
  | { type: 'set-continuity'; group: TextureContinuity }
  | { type: 'delete-continuity'; id: string }
  | { type: 'rename-project'; name: string }
  | { type: 'batch'; commands: Command[]; label?: string };

export interface ChangeSet {
  projectId: string;
  revision: number;
  previousRevision: number;
  wallIds: string[];
  slabIds: string[];
  openingIds: string[];
  levelIds: string[];
  resourceIds: string[];
  continuityIds: string[];
  environmentChanged: boolean;
  environmentResourceIds: string[];
  /** All IDs that consumers may need to recreate, including removed objects. */
  affectedIds: string[];
  removedIds: string[];
  full: boolean;
  reason: string;
}
export type CommandResult =
  | { ok: true; changeSet: ChangeSet; warnings?: DomainWarning[] }
  | { ok: false; error: DomainError };
export type PreviewResult =
  | { ok: true; document: ProjectDocument }
  | { ok: false; error: DomainError };
export interface EditorStatus {
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  savedRevision: number;
  revision: number;
}
interface HistoryEntry {
  before: ProjectDocument;
  after: ProjectDocument;
  label: string;
}
interface PreviewTransaction {
  id: string;
  revision: number;
  command?: Command;
  document: ProjectDocument;
}

export function freezeDocument<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const member of Object.values(value)) {
      freezeDocument(member);
    }
    Object.freeze(value);
  }
  return value;
}
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function equivalentDocuments(a: ProjectDocument, b: ProjectDocument): boolean {
  if (a.id !== b.id || a.schemaVersion !== b.schemaVersion || a.name !== b.name) {
    return false;
  }
  if (
    a.environment !== b.environment &&
    JSON.stringify(a.environment) !== JSON.stringify(b.environment)
  ) {
    return false;
  }
  if (
    a.environmentResources !== b.environmentResources &&
    JSON.stringify(a.environmentResources) !== JSON.stringify(b.environmentResources)
  ) {
    return false;
  }
  for (const key of ['levels', 'walls', 'slabs', 'openings', 'resources', 'continuity'] as const) {
    const before = a[key],
      after = b[key];
    if (before === after) {
      continue;
    }
    if (before.length !== after.length) {
      return false;
    }
    for (let i = 0; i < before.length; i += 1) {
      // Shared immutable image resources and unchanged objects are never serialized on a pointer commit.
      if (before[i] !== after[i] && JSON.stringify(before[i]) !== JSON.stringify(after[i])) {
        return false;
      }
    }
  }
  return true;
}
const rejected = (code: string, params?: DomainError['params']): CommandResult => ({
  ok: false,
  error: { code, params },
});
function removeContinuity(document: ProjectDocument, ids: Set<string>): TextureContinuity[] {
  return document.continuity.flatMap((group) => {
    const members = group.members.filter((member) => !ids.has(member.wallId));
    if (!members.length) {
      return [];
    }
    if (members.length === group.members.length) {
      return [group];
    }
    const anchor = ids.has(group.anchor.wallId)
      ? { wallId: members[0]!.wallId, side: members[0]!.side, endpoint: 'start' as const }
      : group.anchor;
    const seam = group.seam && !ids.has(group.seam.wallId) ? group.seam : undefined;
    return [{ ...group, members, anchor, seam }];
  });
}
function apply(document: ProjectDocument, command: Command): ProjectDocument | DomainError {
  const find = <T extends { id: string }>(items: T[], objectId: string): T | DomainError =>
    items.find((item) => item.id === objectId) ?? {
      code: 'object.missing',
      params: { id: objectId },
    };
  const missing = (value: object): value is DomainError => 'code' in value;
  switch (command.type) {
    case 'batch': {
      let current = document;
      for (const nested of command.commands) {
        const result = apply(current, nested);
        if ('code' in result) {
          return result;
        }
        current = result;
      }
      return current;
    }
    case 'add-wall':
      return { ...document, walls: [...document.walls, command.wall] };
    case 'update-wall': {
      const old = find(document.walls, command.id);
      if (missing(old)) {
        return old;
      }
      const patch = { ...command.patch };
      // Exchanging endpoint array order is not a physical edit and must not exchange A/B or door offsets.
      if (
        patch.start &&
        patch.end &&
        samePoint(patch.start, old.end) &&
        samePoint(patch.end, old.start)
      ) {
        patch.start = old.start;
        patch.end = old.end;
      }
      const connected = propagateWallEndpoints(document.walls, old, patch);
      if (!Array.isArray(connected)) {
        return connected;
      }
      const propagated = connected.find((wall) => wall.id === old.id)!;
      const next = {
        ...propagated,
        ...patch,
        start: propagated.start,
        end: propagated.end,
        id: old.id,
      };
      if (patch.levelId && patch.levelId !== old.levelId) {
        next.start = patch.start ?? old.start;
        next.end = patch.end ?? old.end;
      }
      const openings =
        patch.levelId && patch.levelId !== old.levelId
          ? document.openings.map((o) =>
              o.wallId === old.id ? { ...o, levelId: patch.levelId! } : o,
            )
          : document.openings;
      return { ...document, walls: connected.map((w) => (w.id === old.id ? next : w)), openings };
    }
    case 'delete-wall': {
      const old = find(document.walls, command.id);
      if (missing(old)) {
        return old;
      }
      return {
        ...document,
        walls: document.walls.filter((w) => w.id !== command.id),
        openings: document.openings.filter((o) => o.wallId !== command.id),
        continuity: removeContinuity(document, new Set([command.id])),
      };
    }
    case 'add-slab':
      return { ...document, slabs: [...document.slabs, command.slab] };
    case 'update-slab': {
      const old = find(document.slabs, command.id);
      if (missing(old)) {
        return old;
      }
      return {
        ...document,
        slabs: document.slabs.map((s) =>
          s.id === command.id ? { ...old, ...command.patch, id: old.id } : s,
        ),
      };
    }
    case 'delete-slab': {
      const old = find(document.slabs, command.id);
      if (missing(old)) {
        return old;
      }
      return { ...document, slabs: document.slabs.filter((s) => s.id !== command.id) };
    }
    case 'add-opening':
      return { ...document, openings: [...document.openings, command.opening] };
    case 'update-opening': {
      const old = find(document.openings, command.id);
      if (missing(old)) {
        return old;
      }
      return {
        ...document,
        openings: document.openings.map((o) =>
          o.id === command.id ? { ...old, ...command.patch, id: old.id } : o,
        ),
      };
    }
    case 'delete-opening': {
      const old = find(document.openings, command.id);
      if (missing(old)) {
        return old;
      }
      return { ...document, openings: document.openings.filter((o) => o.id !== command.id) };
    }
    case 'add-level':
      return { ...document, levels: [...document.levels, command.level] };
    case 'update-level': {
      const old = find(document.levels, command.id);
      if (missing(old)) {
        return old;
      }
      const updated = { ...old, ...command.patch, id: old.id };
      const delta = command.moveAbove ? updated.height - old.height : 0;
      const movedIds = new Set(
        document.levels.filter((l) => l.elevation > old.elevation + EPSILON).map((l) => l.id),
      );
      const elevationDelta = updated.elevation - old.elevation;
      const levels = document.levels.map((l) =>
        l.id === old.id
          ? updated
          : movedIds.has(l.id) && delta
            ? { ...l, elevation: l.elevation + delta }
            : l,
      );
      const slabs = document.slabs.map((s) => {
        const move = s.levelId === old.id ? elevationDelta : movedIds.has(s.levelId) ? delta : 0;
        return move ? { ...s, elevation: s.elevation + move } : s;
      });
      return { ...document, levels, slabs };
    }
    case 'delete-level': {
      const old = find(document.levels, command.id);
      if (missing(old)) {
        return old;
      }
      if (document.levels.length === 1) {
        return { code: 'level.lastRequired' };
      }
      const deletedWalls = new Set(
        document.walls.filter((w) => w.levelId === command.id).map((w) => w.id),
      );
      return {
        ...document,
        levels: document.levels.filter((l) => l.id !== command.id),
        walls: document.walls.filter((w) => w.levelId !== command.id),
        slabs: document.slabs.filter((s) => s.levelId !== command.id),
        openings: document.openings.filter((o) => o.levelId !== command.id),
        continuity: removeContinuity(document, deletedWalls),
      };
    }
    case 'set-material': {
      const wall = document.walls.find((w) => w.id === command.objectId);
      if (wall && ['A', 'B', 'edge'].includes(command.side)) {
        const updates = new Map<string, Set<string>>([[wall.id, new Set([command.side])]]);
        if (command.applyContinuity) {
          for (const group of document.continuity) {
            if (group.members.some((m) => m.wallId === wall.id && m.side === command.side)) {
              for (const m of group.members) {
                const set = updates.get(m.wallId) ?? new Set<string>();
                set.add(m.side);
                updates.set(m.wallId, set);
              }
            }
          }
        }
        return {
          ...document,
          walls: document.walls.map((w) => {
            const sides = updates.get(w.id);
            if (!sides) {
              return w;
            }
            const materials = { ...w.materials };
            for (const side of sides) {
              materials[side as keyof Wall['materials']] = command.binding;
            }
            return { ...w, materials };
          }),
        };
      }
      const slab = document.slabs.find((s) => s.id === command.objectId);
      if (slab && ['top', 'bottom', 'edge'].includes(command.side)) {
        return {
          ...document,
          slabs: document.slabs.map((s) =>
            s.id === slab.id
              ? { ...s, materials: { ...s.materials, [command.side]: command.binding } }
              : s,
          ),
        };
      }
      const opening = document.openings.find((o) => o.id === command.objectId);
      if (opening?.materials && ['A', 'B', 'edge'].includes(command.side)) {
        return {
          ...document,
          openings: document.openings.map((o) =>
            o.id === opening.id
              ? { ...o, materials: { ...opening.materials!, [command.side]: command.binding } }
              : o,
          ),
        };
      }
      return {
        code: 'material.invalidSurface',
        params: { id: command.objectId, side: command.side },
      };
    }
    case 'add-resource':
      return { ...document, resources: [...document.resources, command.resource] };
    case 'set-environment':
      return { ...document, environment: command.environment };
    case 'add-environment-resource':
      return {
        ...document,
        environmentResources: [...(document.environmentResources ?? []), command.resource],
      };
    case 'delete-environment-resource': {
      const old = find(document.environmentResources ?? [], command.id);
      if (missing(old)) {
        return old;
      }
      if (document.environment?.resourceId === command.id) {
        return { code: 'environment.resourceInUse', params: { id: command.id } };
      }
      return {
        ...document,
        environmentResources: document.environmentResources!.filter(
          (resource) => resource.id !== command.id,
        ),
      };
    }
    case 'delete-resource': {
      const old = find(document.resources, command.id);
      if (missing(old)) {
        return old;
      }
      return { ...document, resources: document.resources.filter((r) => r.id !== command.id) };
    }
    case 'set-continuity':
      return {
        ...document,
        continuity: [
          ...document.continuity.filter((g) => g.id !== command.group.id),
          command.group,
        ],
      };
    case 'delete-continuity': {
      const old = find(document.continuity, command.id);
      if (missing(old)) {
        return old;
      }
      return { ...document, continuity: document.continuity.filter((g) => g.id !== command.id) };
    }
    case 'rename-project':
      return { ...document, name: command.name };
    default:
      return { code: 'command.unsupported' };
  }
}
function changedIds<T extends { id: string }>(before: T[], after: T[]): Set<string> {
  const old = new Map(before.map((o) => [o.id, o]));
  const result = new Set<string>();
  for (const object of after) {
    if (old.get(object.id) !== object) {
      result.add(object.id);
    }
    old.delete(object.id);
  }
  for (const objectId of old.keys()) {
    result.add(objectId);
  }
  return result;
}
export function calculateChangeSet(
  before: ProjectDocument,
  after: ProjectDocument,
  reason: string,
  full = false,
): ChangeSet {
  const walls = changedIds(before.walls, after.walls),
    slabs = changedIds(before.slabs, after.slabs);
  const openings = changedIds(before.openings, after.openings),
    levels = changedIds(before.levels, after.levels);
  const resources = changedIds(before.resources, after.resources),
    continuity = changedIds(before.continuity, after.continuity);
  const environmentResources = changedIds(
    before.environmentResources ?? [],
    after.environmentResources ?? [],
  );
  const environmentChanged =
    full ||
    before.environment !== after.environment ||
    (!!after.environment?.resourceId && environmentResources.has(after.environment.resourceId));
  const allWalls = [...before.walls, ...after.walls];
  for (const o of [...before.openings, ...after.openings]) {
    if (openings.has(o.id)) {
      walls.add(o.wallId);
    }
  }
  for (const w of allWalls) {
    if (levels.has(w.levelId)) {
      walls.add(w.id);
    }
  }
  for (const s of [...before.slabs, ...after.slabs]) {
    if (levels.has(s.levelId)) {
      slabs.add(s.id);
    }
  }
  for (const g of [...before.continuity, ...after.continuity]) {
    if (continuity.has(g.id)) {
      for (const m of g.members) {
        walls.add(m.wallId);
      }
    }
  }
  if (resources.size) {
    const uses = (materials: Record<string, SurfaceBinding> | undefined): boolean =>
      !!materials &&
      Object.values(materials).some((m) => !!m.resourceId && resources.has(m.resourceId));
    for (const w of allWalls) {
      if (uses(w.materials)) {
        walls.add(w.id);
      }
    }
    for (const s of [...before.slabs, ...after.slabs]) {
      if (uses(s.materials)) {
        slabs.add(s.id);
      }
    }
    for (const o of [...before.openings, ...after.openings]) {
      if (uses(o.materials)) {
        openings.add(o.id);
      }
    }
  }
  // Propagate connection and UV dependencies through the touched connected components, never unrelated buildings.
  let grew = true;
  while (grew) {
    grew = false;
    for (const wall of allWalls) {
      if (
        !walls.has(wall.id) &&
        allWalls.some((other) => walls.has(other.id) && wallsConnected(wall, other))
      ) {
        walls.add(wall.id);
        grew = true;
      }
    }
    for (const group of [...before.continuity, ...after.continuity]) {
      if (group.members.some((m) => walls.has(m.wallId))) {
        for (const member of group.members) {
          if (!walls.has(member.wallId)) {
            walls.add(member.wallId);
            grew = true;
          }
        }
      }
    }
  }
  for (const opening of [...before.openings, ...after.openings]) {
    if (walls.has(opening.wallId) || levels.has(opening.levelId)) {
      openings.add(opening.id);
    }
  }
  const affectedIds = [
    ...new Set([
      ...walls,
      ...slabs,
      ...openings,
      ...levels,
      ...resources,
      ...continuity,
      ...environmentResources,
    ]),
  ];
  const afterIds = new Set(
    [
      ...after.walls,
      ...after.slabs,
      ...after.openings,
      ...after.levels,
      ...after.resources,
      ...after.continuity,
      ...(after.environmentResources ?? []),
    ].map((o) => o.id),
  );
  return {
    projectId: after.id,
    revision: after.revision,
    previousRevision: before.revision,
    wallIds: [...walls],
    slabIds: [...slabs],
    openingIds: [...openings],
    levelIds: [...levels],
    resourceIds: [...resources],
    continuityIds: [...continuity],
    environmentChanged,
    environmentResourceIds: [...environmentResources],
    affectedIds,
    removedIds: affectedIds.filter((objectId) => !afterIds.has(objectId)),
    full,
    reason,
  };
}

export class EditorCore {
  private document: ProjectDocument;
  private readonly listeners = new Set<(changeSet: ChangeSet) => void>();
  private readonly statusListeners = new Set<() => void>();
  private statusSnapshot: EditorStatus;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private savedRevision: number;
  private clock: number;
  private previewTransaction?: PreviewTransaction;
  constructor(document: ProjectDocument = createEmptyProject()) {
    const result = validateDocument(document);
    if (!result.ok) {
      throw new Error(`${result.error.code}: ${JSON.stringify(result.error.params ?? {})}`);
    }
    this.document = freezeDocument(copy(document));
    this.clock = document.revision;
    this.savedRevision = document.revision;
    this.statusSnapshot = Object.freeze({
      isDirty: false,
      canUndo: false,
      canRedo: false,
      undoCount: 0,
      redoCount: 0,
      savedRevision: this.savedRevision,
      revision: this.document.revision,
    });
  }
  getSnapshot = (): ProjectDocument => this.document;
  subscribe = (listener: (changeSet: ChangeSet) => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getStatusSnapshot = (): EditorStatus => this.statusSnapshot;
  subscribeStatus = (listener: () => void): (() => void) => {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  };
  isDirty = (): boolean => this.savedRevision !== this.document.revision;
  getHistoryState = (): {
    canUndo: boolean;
    canRedo: boolean;
    undoCount: number;
    redoCount: number;
  } => ({
    canUndo: !!this.undoStack.length,
    canRedo: !!this.redoStack.length,
    undoCount: this.undoStack.length,
    redoCount: this.redoStack.length,
  });
  markSaved(revision: number, projectId = this.document.id): boolean {
    if (
      projectId !== this.document.id ||
      !Number.isSafeInteger(revision) ||
      revision > this.document.revision ||
      revision < 0
    ) {
      return false;
    }
    this.savedRevision = revision;
    // A settings change or an older save finishing must not notify a false clean state.
    this.publish(calculateChangeSet(this.document, this.document, 'saved'));
    return revision === this.document.revision;
  }
  execute(command: Command, label: string = command.type): CommandResult {
    let next: ProjectDocument | DomainError;
    try {
      next = apply(this.document, copy(command));
    } catch {
      return rejected('command.invalid');
    }
    if ('code' in next) {
      return { ok: false, error: next };
    }
    const result = validateDocument(next);
    if (!result.ok) {
      return result;
    }
    const before = this.document;
    // Avoid pollution from a no-op property submission while preserving unchanged object references.
    if (equivalentDocuments(before, next)) {
      return { ok: true, changeSet: calculateChangeSet(before, before, 'noop') };
    }
    this.clock += 1;
    next = freezeDocument({ ...next, revision: this.clock });
    this.undoStack.push({ before, after: next, label });
    this.redoStack = [];
    this.document = next;
    const changeSet = calculateChangeSet(before, next, label);
    this.publish(changeSet);
    return { ok: true, changeSet, warnings: documentWarnings(next) };
  }
  undo(): CommandResult {
    const entry = this.undoStack.pop();
    if (!entry) {
      return rejected('history.empty');
    }
    this.redoStack.push(entry);
    this.clock += 1;
    const before = this.document;
    this.document = freezeDocument({ ...entry.before, revision: this.clock });
    const changeSet = calculateChangeSet(before, this.document, 'undo');
    this.publish(changeSet);
    return { ok: true, changeSet, warnings: documentWarnings(this.document) };
  }
  redo(): CommandResult {
    const entry = this.redoStack.pop();
    if (!entry) {
      return rejected('history.empty');
    }
    this.undoStack.push(entry);
    this.clock += 1;
    const before = this.document;
    this.document = freezeDocument({ ...entry.after, revision: this.clock });
    const changeSet = calculateChangeSet(before, this.document, 'redo');
    this.publish(changeSet);
    return { ok: true, changeSet, warnings: documentWarnings(this.document) };
  }
  replace(document: unknown, saved = true): CommandResult {
    const result = validateDocument(document);
    if (!result.ok) {
      return result;
    }
    const before = this.document;
    const next = copy(document as ProjectDocument);
    this.document = freezeDocument(next);
    this.clock = next.revision;
    this.undoStack = [];
    this.redoStack = [];
    this.previewTransaction = undefined;
    this.savedRevision = saved ? next.revision : -1;
    const changeSet = calculateChangeSet(before, next, 'replace', true);
    this.publish(changeSet);
    return { ok: true, changeSet, warnings: documentWarnings(next) };
  }
  beginPreview(): string {
    const token = createId('transaction');
    this.previewTransaction = {
      id: token,
      revision: this.document.revision,
      document: this.document,
    };
    return token;
  }
  preview(token: string, command: Command): PreviewResult {
    const transaction = this.previewTransaction;
    if (!transaction || transaction.id !== token) {
      return { ok: false, error: { code: 'transaction.missing' } };
    }
    if (transaction.revision !== this.document.revision) {
      return { ok: false, error: { code: 'transaction.stale' } };
    }
    let next: ProjectDocument | DomainError;
    try {
      next = apply(this.document, copy(command));
    } catch {
      return { ok: false, error: { code: 'command.invalid' } };
    }
    if ('code' in next) {
      return { ok: false, error: next };
    }
    const validation = validateDocument(next);
    if (!validation.ok) {
      return validation;
    }
    transaction.command = copy(command);
    transaction.document = freezeDocument(next);
    return { ok: true, document: transaction.document };
  }
  commitPreview(token: string, label = 'drag'): CommandResult {
    const transaction = this.previewTransaction;
    if (!transaction || transaction.id !== token) {
      return rejected('transaction.missing');
    }
    this.previewTransaction = undefined;
    if (transaction.revision !== this.document.revision) {
      return rejected('transaction.stale');
    }
    if (!transaction.command) {
      return rejected('transaction.empty');
    }
    return this.execute(transaction.command, label);
  }
  cancelPreview(token?: string): void {
    if (!token || token === this.previewTransaction?.id) {
      this.previewTransaction = undefined;
    }
  }
  private publish(changeSet: ChangeSet): void {
    const status = {
      isDirty: this.isDirty(),
      ...this.getHistoryState(),
      savedRevision: this.savedRevision,
      revision: this.document.revision,
    };
    if (
      Object.keys(status).some(
        (key) =>
          status[key as keyof EditorStatus] !== this.statusSnapshot[key as keyof EditorStatus],
      )
    ) {
      this.statusSnapshot = Object.freeze(status);
      // oxlint-disable-next-line unicorn/no-useless-spread -- Subscribe/unsubscribe during dispatch must not change this delivery set.
      for (const listener of [...this.statusListeners]) {
        listener();
      }
    }
    // oxlint-disable-next-line unicorn/no-useless-spread -- Commands may change subscribers while this revision is being delivered.
    for (const listener of [...this.listeners]) {
      listener(changeSet);
    }
  }
}

/** Reject late compute/file results after edits or project switches. */
export class RevisionGate {
  private sequence = 0;
  create(document: ProjectDocument): {
    requestId: number;
    projectId: string;
    documentRevision: number;
  } {
    this.sequence += 1;
    return {
      requestId: this.sequence,
      projectId: document.id,
      documentRevision: document.revision,
    };
  }
  accepts(
    task: { requestId: number; projectId: string; documentRevision: number },
    document: ProjectDocument,
  ): boolean {
    return (
      task.requestId === this.sequence &&
      task.projectId === document.id &&
      task.documentRevision === document.revision
    );
  }
  cancel(): void {
    this.sequence += 1;
  }
}
