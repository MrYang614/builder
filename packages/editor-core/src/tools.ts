import type { Vec2 } from './model';
import type { Tool } from './session';

export type ToolState =
  | { kind: 'idle'; tool: Tool }
  | { kind: 'start'; tool: 'wall' | 'slab'; start: Vec2 }
  | { kind: 'preview'; tool: 'wall' | 'slab'; start: Vec2; end: Vec2 }
  | {
      kind: 'host-preview';
      tool: 'door' | 'window';
      wallId: string;
      offset: number;
      valid: boolean;
    };
export type ToolInput =
  | { type: 'activate'; tool: Tool }
  | { type: 'move'; point: Vec2; host?: { wallId: string; offset: number; valid: boolean } }
  | { type: 'click'; point: Vec2; host?: { wallId: string; offset: number; valid: boolean } }
  | { type: 'cancel' }
  | { type: 'camera'; active: boolean };
export type ToolIntent =
  | { type: 'create-wall'; start: Vec2; end: Vec2 }
  | { type: 'create-slab'; start: Vec2; end: Vec2 }
  | { type: 'create-opening'; kind: 'door' | 'window'; wallId: string; offset: number }
  | { type: 'select'; point: Vec2; surface: boolean };

/** Normalized world input only. Drafts and camera suspension never mutate the formal document. */
export class ToolStateMachine {
  private state: ToolState = { kind: 'idle', tool: 'select' };
  private cameraActive = false;
  getState(): ToolState {
    return this.state;
  }
  handle(input: ToolInput): ToolIntent | undefined {
    if (input.type === 'camera') {
      this.cameraActive = input.active;
      return undefined;
    }
    if (input.type === 'activate') {
      this.state = { kind: 'idle', tool: input.tool };
      return undefined;
    }
    if (input.type === 'cancel') {
      this.state =
        this.state.kind === 'idle'
          ? { kind: 'idle', tool: 'select' }
          : { kind: 'idle', tool: this.state.tool };
      return undefined;
    }
    if (this.cameraActive) {
      return undefined;
    }
    const tool = this.state.tool;
    if (tool === 'wall' || tool === 'slab') {
      if (this.state.kind === 'idle') {
        if (input.type === 'click') {
          this.state = { kind: 'start', tool, start: { ...input.point } };
        }
        return undefined;
      }
      if (this.state.kind !== 'start' && this.state.kind !== 'preview') {
        return undefined;
      }
      const start = this.state.start;
      const end = tool === 'wall' ? orthogonal(start, input.point) : { ...input.point };
      if (input.type === 'move') {
        this.state = { kind: 'preview', tool, start, end };
        return undefined;
      }
      if (Math.hypot(end.x - start.x, end.z - start.z) < 0.05) {
        return undefined;
      }
      this.state = tool === 'wall' ? { kind: 'start', tool, start: end } : { kind: 'idle', tool };
      return { type: tool === 'wall' ? 'create-wall' : 'create-slab', start: { ...start }, end };
    }
    if (tool === 'door' || tool === 'window') {
      if (!input.host) {
        this.state = { kind: 'idle', tool };
        return undefined;
      }
      this.state = { kind: 'host-preview', tool, ...input.host };
      if (input.type === 'click' && input.host.valid) {
        return {
          type: 'create-opening',
          kind: tool,
          wallId: input.host.wallId,
          offset: input.host.offset,
        };
      }
      return undefined;
    }
    if (input.type === 'click') {
      return { type: 'select', point: input.point, surface: tool === 'material' };
    }
    return undefined;
  }
  /** Failed submissions leave the draft editable instead of advancing a connected wall chain. */
  reject(intent: ToolIntent): void {
    if (intent.type === 'create-wall' || intent.type === 'create-slab') {
      this.state = {
        kind: 'preview',
        tool: intent.type === 'create-wall' ? 'wall' : 'slab',
        start: intent.start,
        end: intent.end,
      };
    }
  }
}
function orthogonal(start: Vec2, end: Vec2): Vec2 {
  return Math.abs(end.x - start.x) >= Math.abs(end.z - start.z)
    ? { x: end.x, z: start.z }
    : { x: start.x, z: end.z };
}
