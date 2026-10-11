import type {
  Command,
  Opening,
  PreviewResult,
  ProjectDocument,
  Slab,
  SnapSettings,
  Wall,
} from '@building/editor-core';
import type { RenderState } from './renderer';

export type Tool = 'select' | 'wall' | 'slab' | 'door' | 'window' | 'material';
export interface ViewportTheme {
  background: string;
  grid: string;
  axis: string;
  selection: string;
  snap: string;
  preview: string;
  invalid: string;
}
export interface RuntimeSession {
  levelId: string;
  tool: Tool;
  selectedId: string | null;
  surface: string;
  wholeBuilding: boolean;
  hiddenIds: string[];
  slabPurpose: 'floor' | 'roof';
  roofElevation: number;
  cameraMode: 'edit' | 'rotate' | 'pan';
  snap: SnapSettings;
}
export interface RuntimeOptions {
  getDocument(): ProjectDocument;
  getSession(): RuntimeSession;
  command(command: Command): boolean;
  select(id: string | null, surface?: string): void;
  beginPreview(): string;
  preview(token: string, command: Command): PreviewResult;
  cancelPreview(token?: string): void;
  activateTool?(tool: Tool): void;
  status(code: string, params?: Record<string, string | number>): void;
  renderState?(state: RenderState): void;
}
export type ObjectData = Wall | Slab | Opening;

/** Enumerates formal objects only; transient scene helpers never enter these collections. */
export const objectsOf = (doc: ProjectDocument): ObjectData[] => [
  ...doc.walls,
  ...doc.slabs,
  ...doc.openings,
];

/** Maps a transient draft to the same update command used by property editing. */
export function updateCommand(data: ObjectData): Command {
  if ('start' in data) {
    return { type: 'update-wall', id: data.id, patch: data };
  }
  if ('polygon' in data) {
    return { type: 'update-slab', id: data.id, patch: data };
  }
  return { type: 'update-opening', id: data.id, patch: data };
}

/** Creates formal geometry through Core commands without inserting preview meshes. */
export function addCommand(data: ObjectData): Command {
  if ('start' in data) {
    return { type: 'add-wall', wall: data };
  }
  if ('polygon' in data) {
    return { type: 'add-slab', slab: data };
  }
  return { type: 'add-opening', opening: data };
}
