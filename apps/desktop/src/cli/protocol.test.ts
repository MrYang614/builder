import { describe, expect, it } from 'vitest';
import {
  ProtocolError,
  PROTOCOL_VERSION,
  parseControlRequest,
  stableStringify,
  isReadOperation,
  isWriteOperation,
  requiresProject,
  validateControlRequest,
  validateControlResponse,
} from './protocol';

const project = { projectId: 'project-1', revision: 2, documentEpoch: 1 };

function request(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId: 'request-1',
    clientSessionId: 'session-1',
    operation: 'edit.apply',
    project,
    args: { command: 'noop' },
    ...overrides,
  };
}

describe('control protocol validation', () => {
  it('accepts a valid request and parses JSONL payloads', () => {
    const parsed = parseControlRequest(JSON.stringify(request()));
    expect(parsed.operation).toBe('edit.apply');
    expect(parsed.project).toEqual(project);
    expect(validateControlRequest(parsed)).toBe(parsed);
  });

  it('rejects unknown fields and unsupported versions', () => {
    expect(() => validateControlRequest(request({ unexpected: true }))).toThrow(ProtocolError);
    expect(() => validateControlRequest(request({ protocolVersion: 99 }))).toThrow(/not supported/);
    expect(() => validateControlRequest(request({ mode: 'realtime' }))).toThrow(/hostInstanceId/);
  });

  it('requires a cursor for formal edits and bounds payload size', () => {
    expect(() => validateControlRequest(request({ project: undefined }))).toThrow(
      /requires a project cursor/,
    );
    expect(() =>
      validateControlRequest(request({ operation: 'project.new', project: undefined })),
    ).toThrow(/requires a project cursor/);
    expect(() =>
      validateControlRequest(request({ operation: 'project.open', project: undefined })),
    ).toThrow(/requires a project cursor/);
    expect(() => validateControlRequest(request({ options: { timeoutMs: 600001 } }))).toThrow(
      /600000/,
    );
    expect(() => parseControlRequest(JSON.stringify(request()), 8)).toThrow(/byte limit/);
  });

  it('classifies read, handshake, and formal write operations consistently', () => {
    expect(isReadOperation('project.inspect')).toBe(true);
    expect(isReadOperation('host.handshake')).toBe(true);
    expect(isWriteOperation('project.new')).toBe(true);
    expect(requiresProject('project.new')).toBe(true);
    expect(requiresProject('session.get')).toBe(false);
  });

  it('validates failure responses and keeps deterministic idempotency fingerprints', () => {
    expect(() =>
      validateControlResponse({
        protocolVersion: PROTOCOL_VERSION,
        requestId: 'r',
        ok: false,
        warnings: [],
      }),
    ).toThrow(/include an error/);
    expect(stableStringify({ b: 2, a: [3, { d: 1, c: 0 }] })).toBe('{"a":[3,{"c":0,"d":1}],"b":2}');
  });
});
