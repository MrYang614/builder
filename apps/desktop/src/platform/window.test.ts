import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWindowControls, registerCloseGuard } from './index';

const native = vi.hoisted(() => ({
  desktop: true,
  getCurrentWindow: vi.fn(),
  minimize: vi.fn(async () => {}),
  toggleMaximize: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  startDragging: vi.fn(async () => {}),
  destroy: vi.fn(async () => {}),
  isMaximized: vi.fn(async (): Promise<boolean> => false),
  resizeUnlisten: vi.fn(),
  closeUnlisten: vi.fn(),
  onResized: vi.fn(async (_handler: () => void) => () => {}),
  onCloseRequested: vi.fn(
    async (_handler: (event: { preventDefault(): void }) => Promise<void>) => () => {},
  ),
}));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => native.desktop, invoke: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: native.getCurrentWindow }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('native Header window controls', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    native.desktop = true;
    native.getCurrentWindow.mockReturnValue(native);
    native.isMaximized.mockResolvedValue(false);
    native.onResized.mockResolvedValue(native.resizeUnlisten);
    native.onCloseRequested.mockResolvedValue(native.closeUnlisten);
  });

  it('omits desktop controls in browser previews without accessing the native window', async () => {
    native.desktop = false;
    expect(await createWindowControls()).toBeNull();
    expect(native.getCurrentWindow).not.toHaveBeenCalled();
  });

  it('routes Header operations to the main window and propagates native failures', async () => {
    const controls = (await createWindowControls())!;
    await controls.minimize();
    await controls.toggleMaximize();
    await controls.startDragging();
    expect(native.minimize).toHaveBeenCalledOnce();
    expect(native.toggleMaximize).toHaveBeenCalledOnce();
    expect(native.startDragging).toHaveBeenCalledOnce();
    const failure = new Error('window permission failure');
    native.minimize.mockRejectedValueOnce(failure);
    await expect(controls.minimize()).rejects.toBe(failure);
  });

  it('sends custom close through the existing project guard instead of destroying directly', async () => {
    const guard = vi.fn(async () => false);
    const cleanup = await registerCloseGuard(guard);
    const preventDefault = vi.fn();
    native.close.mockImplementation(async () => {
      await native.onCloseRequested.mock.calls[0]![0]({ preventDefault });
    });
    const controls = (await createWindowControls())!;
    await controls.close();
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(guard).toHaveBeenCalledOnce();
    expect(native.destroy).not.toHaveBeenCalled();
    guard.mockResolvedValueOnce(true);
    await controls.close();
    expect(native.destroy).toHaveBeenCalledOnce();
    cleanup();
    expect(native.closeUnlisten).toHaveBeenCalledOnce();
  });

  it('reports the initial maximized state and only changes after resize events', async () => {
    const controls = (await createWindowControls())!;
    const onChange = vi.fn();
    const onError = vi.fn();
    const cleanup = await controls.subscribeMaximized(onChange, onError);
    expect(native.onResized.mock.invocationCallOrder[0]).toBeLessThan(
      native.isMaximized.mock.invocationCallOrder[0]!,
    );
    expect(onChange.mock.calls).toEqual([[false]]);
    native.isMaximized.mockResolvedValue(true);
    native.onResized.mock.calls[0]![0]();
    await vi.waitFor(() => expect(onChange.mock.calls).toEqual([[false], [true]]));
    native.onResized.mock.calls[0]![0]();
    await vi.waitFor(() => expect(native.isMaximized).toHaveBeenCalledTimes(3));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
    cleanup();
  });

  it('keeps the latest state when native resize queries complete out of order', async () => {
    const controls = (await createWindowControls())!;
    const onChange = vi.fn();
    const cleanup = await controls.subscribeMaximized(onChange, vi.fn());
    const oldQuery = deferred<boolean>();
    const newQuery = deferred<boolean>();
    native.isMaximized.mockReturnValueOnce(oldQuery.promise).mockReturnValueOnce(newQuery.promise);
    const resize = native.onResized.mock.calls[0]![0];
    resize();
    resize();
    newQuery.resolve(true);
    await vi.waitFor(() => expect(onChange.mock.calls).toEqual([[false], [true]]));
    oldQuery.resolve(false);
    await oldQuery.promise;
    expect(onChange.mock.calls).toEqual([[false], [true]]);
    cleanup();
  });

  it('cleans up once and suppresses in-flight queries after the Header unmounts', async () => {
    const controls = (await createWindowControls())!;
    const onChange = vi.fn();
    const onError = vi.fn();
    const cleanup = await controls.subscribeMaximized(onChange, onError);
    const query = deferred<boolean>();
    native.isMaximized.mockReturnValueOnce(query.promise);
    native.onResized.mock.calls[0]![0]();
    cleanup();
    cleanup();
    query.resolve(true);
    await query.promise;
    expect(onChange.mock.calls).toEqual([[false]]);
    expect(onError).not.toHaveBeenCalled();
    expect(native.resizeUnlisten).toHaveBeenCalledOnce();
  });

  it('suppresses in-flight failures and queued resize work after disposal', async () => {
    const controls = (await createWindowControls())!;
    const onError = vi.fn();
    const cleanup = await controls.subscribeMaximized(vi.fn(), onError);
    const query = deferred<boolean>();
    native.isMaximized.mockReturnValueOnce(query.promise);
    const resize = native.onResized.mock.calls[0]![0];
    resize();
    cleanup();
    const failure = new Error('window removed');
    query.reject(failure);
    await expect(query.promise).rejects.toBe(failure);
    resize();
    expect(native.isMaximized).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
  });

  it('cleans up the resize listener when the initial maximized query fails', async () => {
    const controls = (await createWindowControls())!;
    const failure = new Error('initial window state unavailable');
    native.isMaximized.mockRejectedValueOnce(failure);
    await expect(controls.subscribeMaximized(vi.fn(), vi.fn())).rejects.toBe(failure);
    expect(native.resizeUnlisten).toHaveBeenCalledOnce();
  });

  it('reports resize query failures to the caller and can recover on a later event', async () => {
    const controls = (await createWindowControls())!;
    const onChange = vi.fn();
    const onError = vi.fn();
    const cleanup = await controls.subscribeMaximized(onChange, onError);
    const failure = new Error('window state unavailable');
    native.isMaximized.mockRejectedValueOnce(failure);
    const resize = native.onResized.mock.calls[0]![0];
    resize();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
    native.isMaximized.mockResolvedValue(true);
    resize();
    await vi.waitFor(() => expect(onChange.mock.calls).toEqual([[false], [true]]));
    cleanup();
  });
});
