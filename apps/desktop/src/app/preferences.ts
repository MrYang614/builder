export interface PreferenceWriter {
  persist(): Promise<void>;
  flush(): Promise<void>;
  retryAndFlush(): Promise<void>;
}

/** Capture each request before awaiting IO; later requests cannot overtake earlier writes. */
export function createPreferenceWriter<Settings>(options: {
  snapshot: () => Settings;
  write: (settings: Settings) => Promise<void>;
  onError: (error: unknown) => void;
}): PreferenceWriter {
  let pending = Promise.resolve();
  const enqueue = (write: () => Promise<void>) => {
    pending = pending.catch(() => {}).then(write);
    // Observe every failure even when callers only request a fire-and-forget preference change.
    void pending.catch((error: unknown) => {
      try {
        options.onError(error);
      } catch {
        // Notification failures must not replace the original write failure or stop the queue.
      }
    });
    return pending;
  };
  const persist = () => {
    try {
      const snapshot = options.snapshot();
      return enqueue(() => options.write(snapshot));
    } catch (error) {
      return enqueue(() => Promise.reject(error));
    }
  };
  const flush = async () => {
    for (;;) {
      const current = pending;
      try {
        await current;
      } catch (error) {
        if (current === pending) {
          throw error;
        }
        continue;
      }
      if (current === pending) {
        return;
      }
    }
  };
  return {
    persist,
    flush,
    async retryAndFlush() {
      // A fresh request lets the next close recover after a transient IO or permission failure.
      await persist();
      await flush();
    },
  };
}

/** Flush before checking the project, so edits made during preference IO are still guarded. */
export async function guardPreferenceClose(
  flush: () => Promise<void>,
  projectGuard: () => Promise<boolean>,
  onFailure: (error: unknown) => void,
): Promise<boolean> {
  try {
    await flush();
  } catch (error) {
    onFailure(error);
    return false;
  }
  return projectGuard();
}
