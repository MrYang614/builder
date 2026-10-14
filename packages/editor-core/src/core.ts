import type { ProjectDocument } from './model';
import { createEmptyProject, createId } from './model';
import { validateDocument } from './validation';
import type { DomainError } from './validation';
import { documentWarnings } from './queries';
import type { DomainWarning } from './queries';
import { applyCommand } from './commands';
import type { Command } from './commands';
import { calculateChangeSet } from './changes';
import type { ChangeSet } from './changes';
import { copy, equivalentDocuments, freezeDocument } from './immutable';
export type { Command } from './commands';
export type { ChangeSet } from './changes';
export { calculateChangeSet } from './changes';
export { freezeDocument } from './immutable';

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
  error?: DomainError;
  document: ProjectDocument;
}

const rejected = (code: string, params?: DomainError['params']): CommandResult => ({
  ok: false,
  error: { code, params },
});
/** Sole owner of immutable formal documents, atomic history and revision-bound preview commands. */
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
  /** Validates and isolates caller data before installing the initial saved revision. */
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
  /** Returns the cached immutable revision; reads never clone large embedded resources. */
  getSnapshot = (): ProjectDocument => this.document;
  /** Registers formal-change delivery and returns the caller's cleanup callback. */
  subscribe = (listener: (changeSet: ChangeSet) => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getStatusSnapshot = (): EditorStatus => this.statusSnapshot;
  /** Subscribes to history/save status separately from the immutable document. */
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
  /** Records the revision actually written; an older save cannot mark newer edits clean. */
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
  /** Applies and validates one atomic command; rejected and equivalent edits create no history. */
  execute(command: Command, label: string = command.type): CommandResult {
    let next: ProjectDocument | DomainError;
    try {
      next = applyCommand(this.document, copy(command));
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
    if (!Number.isSafeInteger(this.clock + 1)) {
      return rejected('command.invalid');
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
  /** Validates a detached command without replacing an active pointer preview or publishing state. */
  dryRun(command: Command): CommandResult {
    let next: ProjectDocument | DomainError;
    try {
      next = applyCommand(this.document, copy(command));
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
    if (!equivalentDocuments(this.document, next) && !Number.isSafeInteger(this.clock + 1)) {
      return rejected('command.invalid');
    }
    return {
      ok: true,
      changeSet: calculateChangeSet(this.document, next, 'dryRun'),
      warnings: documentWarnings(next),
    };
  }
  /** Restores an entire transaction under a fresh revision, including all dependent objects. */
  undo(): CommandResult {
    if (this.undoStack.length && !Number.isSafeInteger(this.clock + 1)) {
      return rejected('command.invalid');
    }
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
  /** Reinstalls one undone transaction without reapplying its commands to newer data. */
  redo(): CommandResult {
    if (this.redoStack.length && !Number.isSafeInteger(this.clock + 1)) {
      return rejected('command.invalid');
    }
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
  /** Installs a fully validated isolated project and clears history plus outstanding previews. */
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
  /** Starts a single transient transaction pinned to the current formal revision. */
  beginPreview(): string {
    const token = createId('transaction');
    this.previewTransaction = {
      id: token,
      revision: this.document.revision,
      document: this.document,
    };
    return token;
  }
  /** Validates a candidate against the formal revision without publishing or recording history. */
  preview(token: string, command: Command): PreviewResult {
    const transaction = this.previewTransaction;
    if (!transaction || transaction.id !== token) {
      return { ok: false, error: { code: 'transaction.missing' } };
    }
    if (transaction.revision !== this.document.revision) {
      return { ok: false, error: { code: 'transaction.stale' } };
    }
    // An invalid latest pointer candidate must never commit an older valid draft.
    transaction.command = undefined;
    transaction.error = undefined;
    transaction.document = this.document;
    let next: ProjectDocument | DomainError;
    try {
      next = applyCommand(this.document, copy(command));
    } catch {
      transaction.error = { code: 'command.invalid' };
      return { ok: false, error: transaction.error };
    }
    if ('code' in next) {
      transaction.error = next;
      return { ok: false, error: next };
    }
    const validation = validateDocument(next);
    if (!validation.ok) {
      transaction.error = validation.error;
      return validation;
    }
    transaction.command = copy(command);
    transaction.document = freezeDocument(next);
    return { ok: true, document: transaction.document };
  }
  /** Commits only the latest valid candidate once; stale or invalid drafts preserve the document. */
  commitPreview(token: string, label = 'drag'): CommandResult {
    const transaction = this.previewTransaction;
    if (!transaction || transaction.id !== token) {
      return rejected('transaction.missing');
    }
    this.previewTransaction = undefined;
    if (transaction.revision !== this.document.revision) {
      return rejected('transaction.stale');
    }
    if (transaction.error) {
      return { ok: false, error: transaction.error };
    }
    if (!transaction.command) {
      return rejected('transaction.empty');
    }
    return this.execute(transaction.command, label);
  }
  /** Releases a matching transient command without affecting already committed edits. */
  cancelPreview(token?: string): void {
    if (!token || token === this.previewTransaction?.id) {
      this.previewTransaction = undefined;
    }
  }
  /** Updates cached status and fixes each subscriber set before delivering synchronous callbacks. */
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
  /** Supersedes older work with a token that also identifies its immutable source revision. */
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
  /** Requires both the latest request and its original project revision to remain current. */
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
  /** Invalidates outstanding results without changing the formal project. */
  cancel(): void {
    this.sequence += 1;
  }
}
