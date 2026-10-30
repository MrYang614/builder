import type { ProjectDocument } from '@building/editor-core';
import type { RenderState } from './renderer';

export interface RuntimeRenderingHooks {
  background(): string;
  document(): ProjectDocument;
  snapshot(): ProjectDocument;
  interactive(): boolean;
  advanceAnimations(time: number): boolean;
  frameRendered?(time: number): void;
  cancelEditing(): void;
  disconnectControls(): void;
  connectControls(canvas: HTMLCanvasElement): void;
  bindCanvas(): void;
  resizeViewport(): void;
  status(code: string, params?: Record<string, string | number>): void;
  renderState?(state: RenderState): void;
}
