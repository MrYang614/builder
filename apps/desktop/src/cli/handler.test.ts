import { describe, expect, it, vi } from 'vitest';
import { createEmptyProject, createWall, EditorCore, SessionStore } from '@building/editor-core';
import { CommandGateway } from '../app/command-gateway';
import { ProjectController } from '../app/project-controller';
import { RuntimeGateway } from '../app/runtime-gateway';
import type { Services } from '../app/services';
import { handleControlRequest } from './handler';
import { PROTOCOL_VERSION, type ControlRequest, type Operation } from './protocol';

function services(): Services {
  const core = new EditorCore(createEmptyProject());
  const commands = new CommandGateway(core);
  const project = new ProjectController(core, commands);
  return {
    core,
    commands,
    project,
    runtimeGateway: new RuntimeGateway(),
    session: new SessionStore(core.getSnapshot().levels[0]!.id),
  } as unknown as Services;
}

function request(
  current: Services,
  operation: Operation,
  args: unknown,
  overrides: Partial<ControlRequest> = {},
): ControlRequest {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId: `request-${Math.random()}`,
    clientSessionId: 'client-1',
    operation,
    project: current.project.getCursor(),
    args,
    ...overrides,
  } as ControlRequest;
}

describe('CLI control handler', () => {
  it('returns a structured error for malformed null input', async () => {
    const result = await handleControlRequest(null as never, services());
    expect(result).toMatchObject({ ok: false, requestId: 'invalid-request' });
    expect(result.error?.code).toBe('invalid_request');
  });

  it('checks a stale cursor before dirty replacement policy', async () => {
    const current = services();
    const levelId = current.core.getSnapshot().levels[0]!.id;
    current.commands.execute({
      type: 'add-wall',
      wall: createWall(levelId, { x: 0, z: 0 }, { x: 2, z: 0 }),
    });
    const stale = request(
      current,
      'project.new',
      { name: 'new' },
      {
        project: { ...current.project.getCursor(), revision: 0 },
        options: { ifDirty: 'discard' },
      },
    );
    const result = await handleControlRequest(stale, current);
    expect(result.error?.code).toBe('revision.conflict');
    expect(result.projectId).toBe(current.project.getCursor().projectId);
    expect(result.documentEpoch).toBe(current.project.getCursor().documentEpoch);
    expect(result.status).toMatchObject({ controllerReady: true, runtimeReady: false });
    expect(current.core.getSnapshot().name).toBe('Untitled');
  });

  it('rejects malformed session tool and object IDs without mutating session', async () => {
    const current = services();
    const invalidTool = await handleControlRequest(
      request(current, 'session.setTool', { tool: 'not-a-tool' }),
      current,
    );
    expect(invalidTool.error?.code).toBe('invalid_request');
    expect(current.session.getSnapshot().tool).toBe('select');

    const invalidSelection = await handleControlRequest(
      request(current, 'session.select', { id: 'missing-object' }),
      current,
    );
    expect(invalidSelection.error?.code).toBe('invalid_request');
    expect(current.session.getSnapshot().selectedId).toBeUndefined();
  });

  it('reports handshake cursor and a false runtime readiness without a canvas', async () => {
    const current = services();
    const result = await handleControlRequest(
      request(current, 'host.handshake', {}, { project: undefined }),
      current,
    );
    expect(result.ok).toBe(true);
    expect(result.result).toMatchObject({ controllerReady: true, runtimeReady: false });
    expect(result.projectId).toBe(current.project.getCursor().projectId);
    expect(result.documentEpoch).toBe(current.project.getCursor().documentEpoch);
  });

  it('creates the validated courtyard template through project.new', async () => {
    const current = services();
    const result = await handleControlRequest(
      request(
        current,
        'project.new',
        { name: 'CLI Courtyard House', template: 'courtyard' },
        { project: undefined, options: { ifDirty: 'discard' } },
      ),
      current,
    );
    expect(result.ok).toBe(true);
    const snapshot = current.core.getSnapshot();
    expect(snapshot.name).toBe('CLI Courtyard House');
    expect(snapshot.levels).toHaveLength(2);
    expect(snapshot.walls).toHaveLength(16);
    expect(snapshot.slabs).toHaveLength(13);
    expect(snapshot.openings).toHaveLength(16);
    expect(snapshot.resources).toHaveLength(4);
  });

  it('rejects an unknown project template without replacing the current document', async () => {
    const current = services();
    const result = await handleControlRequest(
      request(
        current,
        'project.new',
        { name: 'Unknown', template: 'castle' },
        { project: undefined, options: { ifDirty: 'discard' } },
      ),
      current,
    );
    expect(result.error?.code).toBe('template.unsupported');
    expect(current.core.getSnapshot().name).toBe('Untitled');
  });

  it('dry-runs without consuming a pointer preview', async () => {
    const current = services();
    const levelId = current.core.getSnapshot().levels[0]!.id;
    const active = createWall(levelId, { x: 0, z: 0 }, { x: 2, z: 0 });
    const candidate = createWall(levelId, { x: 0, z: 1 }, { x: 2, z: 1 });
    const token = current.commands.beginPreview();
    expect(current.commands.preview(token, { type: 'add-wall', wall: active }).ok).toBe(true);
    const result = await handleControlRequest(
      request(current, 'edit.dryRun', { command: { type: 'add-wall', wall: candidate } }),
      current,
    );
    expect(result.ok).toBe(true);
    expect(current.commands.commitPreview(token).ok).toBe(true);
    expect(current.core.getSnapshot().walls.map((wall) => wall.id)).toEqual([active.id]);
  });
});

vi.mock('../platform', () => ({
  openProjectAtPath: vi.fn(),
  saveProjectAtPath: vi.fn(),
}));
