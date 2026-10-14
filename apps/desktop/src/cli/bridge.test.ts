import { describe, expect, it, vi } from 'vitest';
import { CliBridge, type BridgeTransport } from './bridge';
import { PROTOCOL_VERSION, type ControlRequest } from './protocol';

const cursor = { projectId: 'p', revision: 0, documentEpoch: 1 };

function response(request: ControlRequest, revision = cursor.revision) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId: request.requestId,
    ok: true,
    projectId: cursor.projectId,
    revision,
    documentEpoch: cursor.documentEpoch,
    warnings: [],
    result: { operation: request.operation },
  };
}

describe('CliBridge', () => {
  it('serializes requests and caches duplicate request IDs', async () => {
    const order: string[] = [];
    const transport: BridgeTransport = {
      send: vi.fn(async (request) => {
        order.push(`start:${request.requestId}`);
        await Promise.resolve();
        order.push(`end:${request.requestId}`);
        return response(request, request.requestId === 'one' ? 0 : 1);
      }),
    };
    const bridge = new CliBridge(transport, {
      clientSessionId: 'session',
      initialCursor: cursor,
    });
    const first = bridge.invoke('edit.apply', { command: 'a' }, { requestId: 'one' });
    const second = bridge.invoke(
      'edit.apply',
      { command: 'b' },
      { requestId: 'two', project: cursor },
    );
    await Promise.all([first, second]);
    expect(order).toEqual(['start:one', 'end:one', 'start:two', 'end:two']);
    await bridge.invoke('edit.apply', { command: 'b' }, { requestId: 'two', project: cursor });
    expect(transport.send).toHaveBeenCalledTimes(2);
  });

  it('rejects a stale local cursor before transport dispatch', async () => {
    const transport: BridgeTransport = { send: vi.fn() };
    const bridge = new CliBridge(transport, { clientSessionId: 'session', initialCursor: cursor });
    const result = await bridge.invoke(
      'edit.apply',
      { command: 'stale' },
      { project: { ...cursor, revision: 4 } },
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('revision.conflict');
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('returns unknown_outcome for an in-flight write after disconnect', async () => {
    let disconnect!: () => void;
    const transport: BridgeTransport = {
      send: vi.fn(() => new Promise(() => {})),
      onDisconnect: (listener) => {
        disconnect = () => listener(new Error('pipe closed'));
      },
    };
    const bridge = new CliBridge(transport, { clientSessionId: 'session', initialCursor: cursor });
    const pending = bridge.invoke('edit.apply', { command: 'write' });
    disconnect();
    const result = await pending;
    expect(result.error?.code).toBe('unknown_outcome');
  });
});
