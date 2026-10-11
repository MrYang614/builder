import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Group } from 'three';
import { createEmptyProject } from '@building/editor-core';
import { exportGLB } from '@building/three-runtime/export';

const boundary = vi.hoisted(() => ({ ready: vi.fn(), dispose: vi.fn(), parse: vi.fn() }));
vi.mock('../packages/three-runtime/src/scene', () => ({
  buildBuilding: () => ({
    root: new Group(),
    animations: [],
    resources: { ready: boundary.ready },
    dispose: boundary.dispose,
  }),
}));
vi.mock('three/addons/exporters/GLTFExporter.js', () => ({
  GLTFExporter: class {
    parseAsync() {
      return boundary.parse();
    }
  },
}));
beforeEach(() => {
  boundary.ready.mockReset().mockResolvedValue(undefined);
  boundary.dispose.mockReset();
  boundary.parse.mockReset().mockResolvedValue(new ArrayBuffer(16));
});
afterEach(() => vi.restoreAllMocks());

describe('public export failure precedence', () => {
  test.each(['ready', 'parse'] as const)(
    '%s failure remains the rejection cause when owned snapshot cleanup also fails',
    async (stage) => {
      const primary = new Error(`${stage} primary failure`);
      const cleanup = new Error('cleanup failure');
      boundary[stage].mockRejectedValue(primary);
      boundary.dispose.mockImplementation(() => {
        throw cleanup;
      });
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await expect(exportGLB(createEmptyProject())).rejects.toBe(primary);
      expect(boundary.dispose).toHaveBeenCalledOnce();
      expect(warning).toHaveBeenCalledExactlyOnceWith(
        'Resource cleanup failed after an earlier operation failure.',
        cleanup,
      );
    },
  );

  test('successful export still rejects a snapshot cleanup failure instead of reporting success', async () => {
    const cleanup = new Error('cleanup failure');
    boundary.dispose.mockImplementation(() => {
      throw cleanup;
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(exportGLB(createEmptyProject())).rejects.toBe(cleanup);
    expect(boundary.dispose).toHaveBeenCalledOnce();
    expect(warning).not.toHaveBeenCalled();
  });
});
