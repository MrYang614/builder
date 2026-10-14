import { describe, expect, it } from 'vitest';
import {
  assertCapability,
  capabilityStatus,
  createCapabilitySnapshot,
  hasCapability,
  negotiateCapabilities,
} from './capabilities';

describe('capability negotiation', () => {
  it('creates mode-aware defaults and status summaries', () => {
    const snapshot = createCapabilitySnapshot({
      mode: 'file',
      controllerReady: true,
      runtimeReady: true,
    });
    expect(hasCapability(snapshot, 'project')).toBe(true);
    expect(hasCapability(snapshot, 'window.os')).toBe(false);
    expect(capabilityStatus(snapshot).find((entry) => entry.name === 'project')).toEqual({
      name: 'project',
      available: true,
    });
  });

  it('reports required capabilities missing on the remote host', () => {
    const local = createCapabilitySnapshot({ mode: 'realtime', hostInstanceId: 'host' });
    const remote = createCapabilitySnapshot({
      mode: 'realtime',
      hostInstanceId: 'host',
      capabilities: [
        {
          name: 'project',
          availability: 'available',
          modes: ['realtime'],
        },
      ],
    });
    const result = negotiateCapabilities(local, remote, {
      required: ['render.webgpu'],
      mode: 'realtime',
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['render.webgpu']);
    expect(() => assertCapability(remote, 'render.webgpu')).toThrow(/unavailable/);
  });
});
