import { describe, expect, it, vi } from 'vitest';
import { createPreferenceWriter, guardPreferenceClose } from './preferences';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('serialized local preference writes', () => {
  it('captures each requested snapshot and flushes delayed writes in request order', async () => {
    let snapshot = { backend: 'webgl', language: 'en' };
    const firstStarted = deferred(),
      secondStarted = deferred(),
      firstRelease = deferred(),
      secondRelease = deferred();
    const stored: (typeof snapshot)[] = [];
    const writer = createPreferenceWriter({
      snapshot: () => ({ ...snapshot }),
      write: async (settings) => {
        const first = stored.length === 0;
        stored.push(settings);
        (first ? firstStarted : secondStarted).resolve();
        await (first ? firstRelease : secondRelease).promise;
      },
      onError: vi.fn(),
    });
    const first = writer.persist();
    snapshot = { backend: 'webgpu', language: 'zh-CN' };
    const second = writer.persist();
    // A later local mutation must not change either already-captured request.
    snapshot = { backend: 'webgl', language: 'zh-CN' };
    await firstStarted.promise;
    expect(stored).toEqual([{ backend: 'webgl', language: 'en' }]);
    let flushed = false;
    const flush = writer.flush().then(() => {
      flushed = true;
    });
    firstRelease.resolve();
    await secondStarted.promise;
    expect(flushed).toBe(false);
    expect(stored).toEqual([
      { backend: 'webgl', language: 'en' },
      { backend: 'webgpu', language: 'zh-CN' },
    ]);
    secondRelease.resolve();
    await Promise.all([first, second, flush]);
    expect(flushed).toBe(true);
  });

  it('includes a preference enqueued while close is already waiting for a flush', async () => {
    let value = 1;
    const releases = [deferred(), deferred()];
    const starts = [deferred(), deferred()];
    const stored: number[] = [];
    const writer = createPreferenceWriter({
      snapshot: () => value,
      write: async (setting) => {
        const index = stored.length;
        stored.push(setting);
        starts[index]!.resolve();
        await releases[index]!.promise;
      },
      onError: vi.fn(),
    });
    void writer.persist();
    await starts[0]!.promise;
    const projectGuard = vi.fn(async () => true),
      failure = vi.fn();
    const close = guardPreferenceClose(writer.flush, projectGuard, failure);
    value = 2;
    void writer.persist();
    releases[0]!.resolve();
    await starts[1]!.promise;
    expect(projectGuard).not.toHaveBeenCalled();
    releases[1]!.resolve();
    expect(await close).toBe(true);
    expect(projectGuard).toHaveBeenCalledOnce();
    expect(stored).toEqual([1, 2]);
    expect(failure).not.toHaveBeenCalled();
  });

  it('reports a failed latest write, prevents close, and recovers after a later successful write', async () => {
    const release = deferred(),
      started = deferred(),
      error = new Error('disk full');
    let value = 1;
    const onError = vi.fn();
    const writer = createPreferenceWriter({
      snapshot: () => value,
      write: async (setting) => {
        if (setting === 1) {
          started.resolve();
          await release.promise;
          throw error;
        }
      },
      onError,
    });
    const first = writer.persist();
    await started.promise;
    const projectGuard = vi.fn(async () => true),
      closeFailure = vi.fn();
    const close = guardPreferenceClose(writer.flush, projectGuard, closeFailure);
    release.resolve();
    await expect(first).rejects.toBe(error);
    expect(await close).toBe(false);
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(closeFailure).toHaveBeenCalledExactlyOnceWith(error);
    expect(projectGuard).not.toHaveBeenCalled();
    await expect(writer.flush()).rejects.toBe(error);
    value = 2;
    await writer.persist();
    await expect(writer.flush()).resolves.toBeUndefined();
    expect(await guardPreferenceClose(writer.flush, projectGuard, closeFailure)).toBe(true);
  });

  it('a failed older request does not reject a flush that includes its successful successor', async () => {
    const firstRelease = deferred(),
      secondRelease = deferred(),
      secondStarted = deferred(),
      error = new Error('temporary IO failure');
    let value = 1;
    const onError = vi.fn();
    const writer = createPreferenceWriter({
      snapshot: () => value,
      write: async (setting) => {
        if (setting === 1) {
          await firstRelease.promise;
          throw error;
        }
        secondStarted.resolve();
        await secondRelease.promise;
      },
      onError,
    });
    const failed = writer.persist();
    value = 2;
    const successful = writer.persist();
    const flush = writer.flush();
    firstRelease.resolve();
    await secondStarted.promise;
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    secondRelease.resolve();
    await expect(failed).rejects.toBe(error);
    await Promise.all([successful, flush]);
  });

  it('snapshot failures are visible and notification failures cannot poison later writes', async () => {
    const error = new Error('local storage unavailable');
    let readable = false;
    const write = vi.fn(async () => {});
    const onError = vi.fn(() => {
      throw new Error('observer failed');
    });
    const writer = createPreferenceWriter({
      snapshot: () => {
        if (!readable) {
          throw error;
        }
        return 'webgl';
      },
      write,
      onError,
    });
    await expect(writer.persist()).rejects.toBe(error);
    await expect(writer.flush()).rejects.toBe(error);
    expect(write).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    readable = true;
    await writer.persist();
    await writer.flush();
    expect(write).toHaveBeenCalledExactlyOnceWith('webgl');
  });

  it('still honors project close cancellation after preference writes finish', async () => {
    const flush = vi.fn(async () => {}),
      projectGuard = vi.fn(async () => false),
      onFailure = vi.fn();
    expect(await guardPreferenceClose(flush, projectGuard, onFailure)).toBe(false);
    expect(flush).toHaveBeenCalledOnce();
    expect(projectGuard).toHaveBeenCalledOnce();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('retries unchanged preferences on the next close after IO recovers', async () => {
    const settings = { backend: 'webgpu', language: 'zh-CN' },
      error = new Error('preferences directory permission denied');
    const starts = [deferred(), deferred()],
      releases = [deferred(), deferred()];
    let available = false;
    const stored: (typeof settings)[] = [];
    const snapshot = vi.fn(() => ({ ...settings })),
      onError = vi.fn(),
      closeFailure = vi.fn(),
      projectGuard = vi.fn(async () => true);
    const writer = createPreferenceWriter({
      snapshot,
      write: async (value) => {
        const index = stored.length;
        stored.push(value);
        starts[index]!.resolve();
        await releases[index]!.promise;
        if (!available) {
          throw error;
        }
      },
      onError,
    });
    const firstClose = guardPreferenceClose(
      writer.retryAndFlush,
      projectGuard,
      closeFailure,
      writer.flush,
    );
    await starts[0]!.promise;
    expect(projectGuard).not.toHaveBeenCalled();
    releases[0]!.resolve();
    expect(await firstClose).toBe(false);
    expect(closeFailure).toHaveBeenCalledExactlyOnceWith(error);
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    // Only external IO availability changes; the user's preference values stay unchanged.
    available = true;
    const secondClose = guardPreferenceClose(
      writer.retryAndFlush,
      projectGuard,
      closeFailure,
      writer.flush,
    );
    await starts[1]!.promise;
    expect(projectGuard).not.toHaveBeenCalled();
    releases[1]!.resolve();
    expect(await secondClose).toBe(true);
    expect(projectGuard).toHaveBeenCalledOnce();
    expect(snapshot).toHaveBeenCalledTimes(2);
    expect(stored).toEqual([settings, settings]);
  });
  it('waits for preferences changed while the unsaved-project decision is pending', async () => {
    const decision = deferred(),
      writeStarted = deferred(),
      writeFinished = deferred();
    const writer = createPreferenceWriter({
      snapshot: () => 'webgpu',
      write: async () => {
        writeStarted.resolve();
        await writeFinished.promise;
      },
      onError: vi.fn(),
    });
    let closed = false;
    const close = guardPreferenceClose(
      writer.flush,
      async () => {
        await decision.promise;
        return true;
      },
      vi.fn(),
    ).then((allowed) => {
      closed = allowed;
    });
    await Promise.resolve();
    void writer.persist();
    await writeStarted.promise;
    decision.resolve();
    await decision.promise;
    expect(closed).toBe(false);
    writeFinished.resolve();
    await close;
    expect(closed).toBe(true);
  });
  it('keeps the window open when a preference changed during project confirmation fails to save', async () => {
    const error = new Error('disk full'),
      onFailure = vi.fn();
    const writer = createPreferenceWriter({
      snapshot: () => 'webgpu',
      write: async () => {
        throw error;
      },
      onError: vi.fn(),
    });
    const close = guardPreferenceClose(
      writer.flush,
      async () => {
        void writer.persist();
        return true;
      },
      onFailure,
    );
    expect(await close).toBe(false);
    expect(onFailure).toHaveBeenCalledExactlyOnceWith(error);
  });
  it('lets a newer successful preference supersede a failed close retry', async () => {
    const release = deferred(),
      started = deferred(),
      error = new Error('temporary write failure');
    let value = 1;
    const written: number[] = [];
    const writer = createPreferenceWriter({
      snapshot: () => value,
      write: async (setting) => {
        if (setting === 1) {
          started.resolve();
          await release.promise;
          throw error;
        }
        written.push(setting);
      },
      onError: vi.fn(),
    });
    const flush = writer.retryAndFlush();
    await started.promise;
    value = 2;
    const successor = writer.persist();
    release.resolve();
    await Promise.all([flush, successor]);
    expect(written).toEqual([2]);
  });
});
