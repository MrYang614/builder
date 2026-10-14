import {
  createEmptyProject,
  type CommandResult,
  type EditorCore,
  type ProjectDocument,
} from '@building/editor-core';
import type { CommandGateway } from './command-gateway';

export interface ProjectCursor {
  projectId: string;
  revision: number;
  documentEpoch: number;
}

/** Owns project path and document epochs; save completion can only mark its captured revision. */
export class ProjectController {
  private path?: string;

  constructor(
    private readonly core: EditorCore,
    private readonly commands: CommandGateway,
  ) {}

  getPath(): string | undefined {
    return this.path;
  }

  getCursor(): ProjectCursor {
    const snapshot = this.core.getSnapshot();
    return {
      projectId: snapshot.id,
      revision: snapshot.revision,
      documentEpoch: this.commands.getSnapshot().documentEpoch,
    };
  }

  /** Installs a validated project and invalidates pending saves, decodes and exports. */
  replace(document: ProjectDocument, path?: string): CommandResult {
    const result = this.commands.replace(document);
    if (result.ok) {
      this.path = path;
    }
    return result;
  }

  setPath(path: string | undefined): void {
    this.path = path;
  }

  captureSave(): { snapshot: ProjectDocument; cursor: ProjectCursor } {
    const snapshot = this.core.getSnapshot();
    return { snapshot, cursor: this.getCursor() };
  }

  /** Checks the complete identity even when a replacement reuses a project ID and revision. */
  matches(cursor: ProjectCursor): boolean {
    const current = this.getCursor();
    return (
      cursor.projectId === current.projectId &&
      cursor.documentEpoch === current.documentEpoch &&
      cursor.revision === current.revision
    );
  }

  /** Marks saved only when the asynchronous write still belongs to the current document. */
  markSaved(cursor: ProjectCursor): boolean {
    if (!this.matches(cursor)) {
      return false;
    }
    return this.core.markSaved(cursor.revision, cursor.projectId);
  }

  /** A late write may finish on disk, but cannot change the active path or saved marker. */
  completeSave(cursor: ProjectCursor, path: string): boolean {
    if (!this.markSaved(cursor) || !this.matches(cursor)) {
      return false;
    }
    this.path = path;
    return true;
  }

  /** Replaces the closed document with a clean blank project and invalidates all old cursors. */
  close(): CommandResult {
    return this.replace(createEmptyProject());
  }
}
