import type {
  Command,
  CommandResult,
  EditorCore,
  PreviewResult,
  RevisionGate,
} from '@building/editor-core';
import { validateDocument, RevisionGate as Gate } from '@building/editor-core';

export interface CommandRequestOptions {
  baseRevision?: number;
  projectId?: string;
  documentEpoch?: number;
  dryRun?: boolean;
  label?: string;
}

export interface CommandGatewaySnapshot {
  projectId: string;
  revision: number;
  documentEpoch: number;
}

/** Serializes UI, pointer and CLI submissions before they reach the sole EditorCore owner. */
export class CommandGateway {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly revisionGate: RevisionGate;
  private documentEpoch = 0;

  constructor(
    private readonly core: EditorCore,
    revisionGate: RevisionGate = new Gate(),
  ) {
    this.revisionGate = revisionGate;
  }

  getSnapshot(): CommandGatewaySnapshot {
    const document = this.core.getSnapshot();
    return {
      projectId: document.id,
      revision: document.revision,
      documentEpoch: this.documentEpoch,
    };
  }

  /** Invalidates asynchronous work and the old pointer preview at a successful replacement boundary. */
  incrementDocumentEpoch(): number {
    this.documentEpoch += 1;
    this.revisionGate.cancel();
    this.core.cancelPreview();
    return this.documentEpoch;
  }

  /** Rejects stale revision/epoch writes instead of guessing an implicit merge. */
  execute(command: Command, options: CommandRequestOptions = {}): CommandResult {
    const conflict = this.conflict(options);
    if (conflict) {
      return conflict;
    }
    if (options.dryRun) {
      return this.dryRun(command);
    }
    return this.core.execute(command, options.label);
  }

  private conflict(options: CommandRequestOptions): CommandResult | undefined {
    const current = this.getSnapshot();
    if (options.projectId !== undefined && options.projectId !== current.projectId) {
      return { ok: false, error: { code: 'revision.conflict' } };
    }
    if (options.documentEpoch !== undefined && options.documentEpoch !== current.documentEpoch) {
      return {
        ok: false,
        error: { code: 'document_epoch.conflict', params: { expected: current.documentEpoch } },
      };
    }
    if (options.baseRevision !== undefined && options.baseRevision !== current.revision) {
      return {
        ok: false,
        error: { code: 'revision.conflict', params: { expected: current.revision } },
      };
    }
    return undefined;
  }

  /** Queues long-running bridge requests while keeping synchronous pointer edits available. */
  enqueue<T>(job: () => T | Promise<T>): Promise<T> {
    const next = this.queue.then(job, job);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  /** Validates through Core without consuming its single active pointer preview. */
  dryRun(command: Command): CommandResult {
    return this.core.dryRun(command);
  }

  /** Applies history only at the caller's current revision and document epoch. */
  undo(options: CommandRequestOptions = {}): CommandResult {
    return this.conflict(options) ?? this.core.undo();
  }

  /** Replays one history entry through the same conflict boundary as a formal command. */
  redo(options: CommandRequestOptions = {}): CommandResult {
    return this.conflict(options) ?? this.core.redo();
  }

  /** Failed validation leaves the existing epoch, history and pointer preview untouched. */
  replace(document: unknown, saved = true): CommandResult {
    const result = validateDocument(document);
    if (!result.ok) {
      return result;
    }
    this.incrementDocumentEpoch();
    return this.core.replace(document, saved);
  }

  /** Starts the sole Core preview without installing candidate data. */
  beginPreview(): string {
    return this.core.beginPreview();
  }

  /** Revalidates a pointer candidate against its starting formal revision. */
  preview(token: string, command: Command): PreviewResult {
    return this.core.preview(token, command);
  }

  /** Commits at most one history item for the current pointer transaction. */
  commitPreview(token: string, label?: string): CommandResult {
    return this.core.commitPreview(token, label);
  }

  /** Cancels transient pointer work without altering formal data or history. */
  cancelPreview(token?: string): void {
    this.core.cancelPreview(token);
  }
}
