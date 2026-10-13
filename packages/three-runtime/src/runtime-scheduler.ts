export interface RuntimeFrameResult {
  rendered: boolean;
  continueRendering: boolean;
}

/** Serializes caller-owned frames; input during an awaited GPU frame schedules one successor. */
export class RuntimeScheduler {
  private raf: number | null = null;
  private disposed = false;
  private frameInProgress = false;
  private frameRequested = false;
  private frameCount = 0;

  constructor(private readonly render: (time: number) => Promise<RuntimeFrameResult>) {}

  /** Coalesces event-driven invalidations without starting overlapping asynchronous frames. */
  invalidate = (): void => {
    if (this.disposed) {
      return;
    }
    if (this.frameInProgress) {
      this.frameRequested = true;
    } else if (this.raf === null) {
      this.raf = requestAnimationFrame(this.frame);
    }
  };

  private frame = async (time: number): Promise<void> => {
    this.raf = null;
    if (this.disposed) {
      return;
    }
    this.frameInProgress = true;
    this.frameRequested = false;
    let continueRendering = false;
    try {
      const result = await this.render(time);
      if (result.rendered) {
        this.frameCount++;
      }
      continueRendering = result.continueRendering;
    } finally {
      this.frameInProgress = false;
      if (this.frameRequested || continueRendering) {
        this.invalidate();
      }
    }
  };

  /** Reports awaited GPU work as pending too; a null RAF handle alone does not establish idle. */
  diagnostics() {
    return {
      frameCount: this.frameCount,
      pendingFrame:
        !this.disposed && (this.raf !== null || this.frameInProgress || this.frameRequested),
    };
  }

  /** Cancels queued work; an in-flight frame may finish but cannot schedule another frame. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
    }
    this.raf = null;
  }
}
