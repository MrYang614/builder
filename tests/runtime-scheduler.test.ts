import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  RuntimeScheduler,
  type RuntimeFrameResult,
} from '../packages/three-runtime/src/runtime-scheduler';

let frames: FrameRequestCallback[];
let request: ReturnType<typeof vi.fn<(callback: FrameRequestCallback) => number>>;
let cancel: ReturnType<typeof vi.fn<(handle: number) => void>>;

beforeEach(() => {
  frames = [];
  request = vi.fn((callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  cancel = vi.fn();
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', cancel);
});
afterEach(() => vi.unstubAllGlobals());

function deferred() {
  let resolve!: (value: RuntimeFrameResult) => void;
  const promise = new Promise<RuntimeFrameResult>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function run(time = 1000) {
  const callback = frames.shift();
  expect(callback).toBeDefined();
  await callback!(time);
}

test('multiple inputs coalesce before rendering and during one awaited GPU frame', async () => {
  const pending = deferred();
  const render = vi.fn(() => pending.promise);
  const scheduler = new RuntimeScheduler(render);
  scheduler.invalidate();
  scheduler.invalidate();
  expect(request).toHaveBeenCalledTimes(1);
  const running = run();
  expect(render).toHaveBeenCalledTimes(1);
  expect(scheduler.diagnostics()).toEqual({ frameCount: 0, pendingFrame: true });
  scheduler.invalidate();
  scheduler.invalidate();
  expect(scheduler.diagnostics()).toEqual({ frameCount: 0, pendingFrame: true });
  expect(request).toHaveBeenCalledTimes(1);
  pending.resolve({ rendered: true, continueRendering: false });
  await running;
  expect(request).toHaveBeenCalledTimes(2);
  expect(scheduler.diagnostics()).toEqual({ frameCount: 1, pendingFrame: true });
  render.mockResolvedValue({ rendered: true, continueRendering: false });
  await run(1100);
  expect(request).toHaveBeenCalledTimes(2);
  expect(scheduler.diagnostics()).toEqual({ frameCount: 2, pendingFrame: false });
});

test('sampling explicitly continues but stale owner completion does not count as a rendered frame', async () => {
  const render = vi.fn(async () => ({ rendered: false, continueRendering: true }));
  const scheduler = new RuntimeScheduler(render);
  scheduler.invalidate();
  await run();
  expect(scheduler.diagnostics()).toEqual({ frameCount: 0, pendingFrame: true });
  render.mockResolvedValue({ rendered: true, continueRendering: false });
  await run();
  expect(scheduler.diagnostics()).toEqual({ frameCount: 1, pendingFrame: false });
  expect(request).toHaveBeenCalledTimes(2);
});

test('disposing queued work is idempotent and a delivered late RAF cannot draw', async () => {
  const render = vi.fn(async () => ({ rendered: true, continueRendering: false }));
  const scheduler = new RuntimeScheduler(render);
  scheduler.invalidate();
  scheduler.dispose();
  scheduler.dispose();
  scheduler.invalidate();
  expect(cancel).toHaveBeenCalledExactlyOnceWith(1);
  await run();
  expect(render).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledTimes(1);
  expect(scheduler.diagnostics()).toEqual({ frameCount: 0, pendingFrame: false });
});

test('disposing an in-flight frame suppresses both queued input and sampling continuation', async () => {
  const pending = deferred();
  const scheduler = new RuntimeScheduler(() => pending.promise);
  scheduler.invalidate();
  const running = run();
  scheduler.invalidate();
  scheduler.dispose();
  pending.resolve({ rendered: false, continueRendering: true });
  await running;
  expect(request).toHaveBeenCalledTimes(1);
  expect(cancel).not.toHaveBeenCalled();
  expect(scheduler.diagnostics()).toEqual({ frameCount: 0, pendingFrame: false });
});

test('a hidden viewport cancels queued frames and coalesces updates into one resumed draw', async () => {
  const render = vi.fn(async () => ({ rendered: true, continueRendering: false }));
  const scheduler = new RuntimeScheduler(render);
  scheduler.invalidate();
  scheduler.setActive(false);
  scheduler.invalidate();
  scheduler.invalidate();
  expect(cancel).toHaveBeenCalledExactlyOnceWith(1);
  await run();
  expect(render).not.toHaveBeenCalled();
  expect(scheduler.diagnostics()).toEqual({ frameCount: 0, pendingFrame: false });
  scheduler.setActive(true);
  scheduler.setActive(true);
  expect(request).toHaveBeenCalledTimes(2);
  await run();
  expect(render).toHaveBeenCalledOnce();
  expect(scheduler.diagnostics()).toEqual({ frameCount: 1, pendingFrame: false });
});

test('suspending an awaited GPU frame suppresses continuation until the viewport is active', async () => {
  const pending = deferred();
  const render = vi.fn(() => pending.promise);
  const scheduler = new RuntimeScheduler(render);
  scheduler.invalidate();
  const running = run();
  scheduler.setActive(false);
  scheduler.invalidate();
  pending.resolve({ rendered: true, continueRendering: true });
  await running;
  expect(request).toHaveBeenCalledTimes(1);
  expect(scheduler.diagnostics().pendingFrame).toBe(false);
  scheduler.setActive(true);
  expect(request).toHaveBeenCalledTimes(2);
  scheduler.dispose();
});
