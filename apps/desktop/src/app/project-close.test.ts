import { describe, expect, it, vi } from 'vitest';
import { guardProjectClose } from './project-close';

describe('project approval while final preferences are written', () => {
  it('requires another decision when a clean project changes during the final flush', async () => {
    let snapshot = { revision: 0 };
    let release = () => {};
    const finalWrite = new Promise<void>((resolve) => {
      release = resolve;
    });
    const guard = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const settlePreferences = vi.fn().mockReturnValueOnce(finalWrite);
    const pending = guardProjectClose({
      flushPreferences: async () => {},
      settlePreferences,
      getSnapshot: () => snapshot,
      guard,
      onError: vi.fn(),
    });
    await vi.waitFor(() => expect(settlePreferences).toHaveBeenCalledOnce());
    snapshot = { revision: 1 };
    release();
    expect(await pending).toBe(false);
    expect(guard).toHaveBeenCalledTimes(2);
  });

  it('can close after a new snapshot is separately approved and its settings settle', async () => {
    let snapshot = { revision: 0 };
    const guard = vi.fn(async () => true);
    const settlePreferences = vi.fn(async () => {
      if (snapshot.revision === 0) {
        snapshot = { revision: 1 };
      }
    });
    expect(
      await guardProjectClose({
        flushPreferences: async () => {},
        settlePreferences,
        getSnapshot: () => snapshot,
        guard,
        onError: vi.fn(),
      }),
    ).toBe(true);
    expect(guard).toHaveBeenCalledTimes(2);
    expect(settlePreferences).toHaveBeenCalledTimes(2);
  });

  it('preserves the window when the final settings write fails', async () => {
    const failure = new Error('settings write failed');
    const onError = vi.fn();
    const snapshot = { revision: 0 };
    expect(
      await guardProjectClose({
        flushPreferences: async () => {},
        settlePreferences: async () => {
          throw failure;
        },
        getSnapshot: () => snapshot,
        guard: async () => true,
        onError,
      }),
    ).toBe(false);
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
  });
});
