import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { DragAnchor } from './drag-anchor';
import type { ObjectData, RuntimeOptions } from './runtime-contracts';

/** Captured source and draft belong to one pointer transaction, never the formal scene owner. */
export type Drag = DragAnchor & {
  id: string;
  initial: ObjectData;
  draft: ObjectData;
  endpoint?: 'start' | 'end';
  corner?: number;
  elevation: number;
  projectId: string;
  revision: number;
};

export interface InteractionHooks extends Pick<
  RuntimeOptions,
  'getDocument' | 'getSession' | 'command' | 'select' | 'activateTool' | 'status'
> {
  getCanvas(): HTMLCanvasElement;
  controls: Pick<OrbitControls, 'enabled' | 'mouseButtons'>;
  invalidate(): void;
  invalidateHistory(): void;
}
