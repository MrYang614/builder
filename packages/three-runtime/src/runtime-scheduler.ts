export interface RuntimeFrameResult {
  rendered: boolean;
  continueRendering: boolean;
}

/** Serializes caller-owned frames; input during an awaited GPU frame schedules one successor. */
export class RuntimeScheduler {
  private raf: number | null = null;
  private disposed = false;
  private active = true;
  private frameInProgress = false;
  private frameRequested = false;
  private frameCount = 0;

  constructor(private readonly render: (time: number) => Promise<RuntimeFrameResult>) {}

  /** Coalesces event-driven invalidations without starting overlapping asynchronous frames. */
  invalidate = (): void => {
    if (this.disposed || !this.active) {
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
    if (this.disposed || !this.active) {
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
        !this.disposed &&
        (this.frameInProgress || (this.active && (this.raf !== null || this.frameRequested))),
    };
  }

  /** Suspends queued frames without disposing owners; resuming requests one current-state redraw. */
  setActive(active: boolean): void {
    if (this.disposed || this.active === active) {
      return;
    }
    this.active = active;
    if (active) {
      this.invalidate();
    } else {
      if (this.raf !== null) {
        cancelAnimationFrame(this.raf);
      }
      this.raf = null;
      this.frameRequested = false;
    }
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
