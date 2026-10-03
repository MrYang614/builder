import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerCloseGuard } from '../platform';
import { createPreferenceWriter, guardPreferenceClose } from './preferences';

const native = vi.hoisted(() => ({
  destroy: vi.fn(async () => {}),
  onCloseRequested: vi.fn(async (_handler: (event: { preventDefault(): void }) => Promise<void>) =>
    vi.fn(),
  ),
}));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => native }));

describe('native close hook with pending local preferences (mock host)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());
  it('prevents immediate native close and destroys only after the queued write finishes', async () => {
    let release!: () => void;
    let started!: () => void;
    const writeStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const writeFinished = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writer = createPreferenceWriter({
      snapshot: () => ({ rendererBackend: 'webgpu' }),
      write: async () => {
        started();
        await writeFinished;
      },
      onError: vi.fn(),
    });
    void writer.persist();
    await writeStarted;
    const projectGuard = vi.fn(async () => true),
      onFailure = vi.fn();
    const cleanup = await registerCloseGuard(() =>
      guardPreferenceClose(writer.flush, projectGuard, onFailure),
    );
    const handler = native.onCloseRequested.mock.calls[0]![0];
    const preventDefault = vi.fn();
    const close = handler({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(native.destroy).not.toHaveBeenCalled();
    expect(projectGuard).not.toHaveBeenCalled();
    // A second close request does not bypass the in-flight guard.
    await handler({ preventDefault: vi.fn() });
    expect(native.destroy).not.toHaveBeenCalled();
    release();
    await close;
    expect(projectGuard).toHaveBeenCalledOnce();
    expect(native.destroy).toHaveBeenCalledOnce();
    expect(onFailure).not.toHaveBeenCalled();
    cleanup();
  });

  it('keeps the native window open and reports settings failure when saving preferences fails', async () => {
    const error = new Error('permission denied');
    const writer = createPreferenceWriter({
      snapshot: () => ({ rendererBackend: 'webgpu' }),
      write: async () => {
        throw error;
      },
      onError: vi.fn(),
    });
    void writer.persist();
    const projectGuard = vi.fn(async () => true),
      onFailure = vi.fn();
    await registerCloseGuard(() => guardPreferenceClose(writer.flush, projectGuard, onFailure));
    await native.onCloseRequested.mock.calls[0]![0]({ preventDefault: vi.fn() });
    expect(native.destroy).not.toHaveBeenCalled();
    expect(projectGuard).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledExactlyOnceWith(error);
  });
});
