import { createWindowControls, type WindowControls } from '../platform/window';

/** Keeps OS window actions behind the platform owner and preserves the close guard boundary. */
export class WindowController {
  private controls: WindowControls | null = null;

  async initialize(): Promise<void> {
    this.controls = await createWindowControls();
  }

  get available(): boolean {
    return this.controls !== null;
  }

  minimize(): Promise<void> {
    return this.controls?.minimize() ?? Promise.reject(new Error('window.unavailable'));
  }

  toggleMaximize(): Promise<void> {
    return this.controls?.toggleMaximize() ?? Promise.reject(new Error('window.unavailable'));
  }

  startDragging(): Promise<void> {
    return this.controls?.startDragging() ?? Promise.reject(new Error('window.unavailable'));
  }
}
