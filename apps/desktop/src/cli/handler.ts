import { createSlab, createWall, validateDocument, type Command } from '@building/editor-core';
import type { Services } from '../app/services';
import { openProjectAtPath, saveProjectAtPath } from '../platform';
import { sessionPatch } from './handler-session';
import { createProjectTemplate } from './templates';
import {
  errorResponse,
  PROTOCOL_VERSION,
  validateControlRequest,
  type ControlRequest,
  type ControlResponse,
  type Operation,
  type ProjectCursor,
} from './protocol';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cursor(services: Services): ProjectCursor {
  return services.project.getCursor();
}

function success<T>(
  request: ControlRequest,
  services: Services,
  result: T,
  changeSet?: unknown,
): ControlResponse<T> {
  const current = cursor(services);
  const runtime = services.runtimeGateway.getRuntime();
  const runtimeState = runtime?.getRenderState();
  const canvas = runtime?.renderer.domElement as { width?: number; height?: number } | undefined;
  const runtimeReady =
    !!runtime &&
    Number(canvas?.width) > 0 &&
    Number(canvas?.height) > 0 &&
    runtimeState?.switching === false;
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId: request.requestId,
    ok: true,
    projectId: current.projectId,
    revision: current.revision,
    documentEpoch: current.documentEpoch,
    warnings: [],
    result,
    ...(changeSet ? { changeSet: { ...(changeSet as Record<string, unknown>) } } : {}),
    runtimeEpoch: services.runtimeGateway.getEpoch(),
    status: {
      controllerReady: true,
      runtimeReady,
      capabilities: [
        { name: 'project', available: true },
        { name: 'edit', available: true },
        { name: 'session', available: true },
        { name: 'render', available: runtimeReady },
      ],
      ...(runtime
        ? {
            canvas: { width: Number(canvas?.width ?? 0), height: Number(canvas?.height ?? 0) },
          }
        : {}),
    },
  };
}

function failure(
  request: { requestId?: unknown } | null | undefined,
  code: string,
  message: string,
  services?: Services,
): ControlResponse<never> {
  const requestId =
    typeof request?.requestId === 'string' && request.requestId
      ? request.requestId
      : 'invalid-request';
  const current = services
    ? { ...cursor(services), runtimeEpoch: services.runtimeGateway.getEpoch() }
    : undefined;
  return errorResponse(
    requestId,
    { code, message },
    current,
    services
      ? {
          controllerReady: true,
          runtimeReady: runtimeReady(services),
        }
      : undefined,
  );
}

function failureFromError(
  request: { requestId?: unknown } | null | undefined,
  error: unknown,
  services?: Services,
): ControlResponse<never> {
  if (error && typeof error === 'object') {
    const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
    if (typeof candidate.code === 'string') {
      return failure(
        request,
        candidate.code,
        typeof candidate.message === 'string'
          ? candidate.message
          : typeof candidate.details === 'string'
            ? candidate.details
            : 'Control operation failed',
        services,
      );
    }
  }
  return failure(
    request,
    'transport.error',
    error instanceof Error ? error.message : 'Control operation failed',
    services,
  );
}

async function saveCurrentProject(
  services: Services,
  requestedPath?: string,
): Promise<{ path: string; revision: number; saved: boolean }> {
  const target = requestedPath ?? services.project.getPath();
  if (!target) {
    throw { code: 'project.pathRequired', message: 'A project path is required for save' };
  }
  const captured = services.project.captureSave();
  const path = await saveProjectAtPath(captured.snapshot, target);
  const saved = services.project.completeSave(captured.cursor, path);
  if (!saved) {
    throw {
      code: 'document_epoch.conflict',
      message: 'Project changed while saving; the file was written but remains dirty',
    };
  }
  return { path, revision: captured.cursor.revision, saved };
}

async function prepareProjectReplacement(
  request: ControlRequest,
  services: Services,
): Promise<ControlResponse | undefined> {
  if (!services.core.isDirty()) {
    return undefined;
  }
  const policy = request.options?.ifDirty ?? 'fail';
  if (policy === 'fail') {
    return failure(request, 'dirty.reject', 'Project has unsaved changes', services);
  }
  if (policy === 'discard') {
    return undefined;
  }
  try {
    const saved = await saveCurrentProject(services);
    if (!saved.saved) {
      return failure(request, 'document_epoch.conflict', 'Project changed while saving', services);
    }
    return undefined;
  } catch (error) {
    return failureFromError(request, error, services);
  }
}

function commandFor(operation: Operation, args: Record<string, unknown>): Command | undefined {
  if (operation === 'edit.apply' || operation === 'edit.dryRun') {
    return args.command as Command | undefined;
  }
  if (operation === 'edit.batch') {
    return {
      type: 'batch',
      commands: args.commands as Command[],
      label: String(args.label ?? 'batch'),
    };
  }
  if (operation === 'project.rename' && typeof args.name === 'string') {
    return { type: 'rename-project', name: args.name };
  }
  if (operation === 'wall.create' && args.levelId && args.start && args.end) {
    return {
      type: 'add-wall',
      wall: createWall(String(args.levelId), args.start as never, args.end as never),
    };
  }
  if (operation === 'slab.createRectangle' && args.levelId && args.start && args.end) {
    return {
      type: 'add-slab',
      slab: createSlab(
        String(args.levelId),
        args.start as never,
        args.end as never,
        Number(args.elevation ?? 0),
      ),
    };
  }
  return undefined;
}

function sessionResult(services: Services): Record<string, unknown> {
  return services.session.getSnapshot() as unknown as Record<string, unknown>;
}

function runtimeReady(services: Services): boolean {
  const runtime = services.runtimeGateway.getRuntime();
  const canvas = runtime?.renderer.domElement as { width?: number; height?: number } | undefined;
  return (
    !!runtime &&
    Number(canvas?.width) > 0 &&
    Number(canvas?.height) > 0 &&
    runtime.getRenderState().switching === false
  );
}

/** Handles automation requests using the same Core, SessionStore and runtime owners as the UI. */
async function handleControlRequestImpl(
  raw: ControlRequest,
  services: Services,
): Promise<ControlResponse> {
  let request: ControlRequest;
  try {
    request = validateControlRequest(raw);
  } catch (error) {
    return failureFromError(raw, error, services);
  }
  if (request.project) {
    const current = cursor(services);
    if (
      request.project.projectId !== current.projectId ||
      request.project.documentEpoch !== current.documentEpoch ||
      request.project.revision !== current.revision
    ) {
      return failure(request, 'revision.conflict', 'Project cursor is stale', services);
    }
    if (
      request.project.runtimeEpoch !== undefined &&
      request.project.runtimeEpoch !== services.runtimeGateway.getEpoch()
    ) {
      return failure(request, 'runtime_epoch.conflict', 'Runtime cursor is stale', services);
    }
  }
  if (request.operation === 'controller_ready') {
    return success(request, services, {
      status: request.operation,
      runtimeReady: runtimeReady(services),
    });
  }
  if (request.operation === 'runtime_ready') {
    if (!runtimeReady(services)) {
      return failure(request, 'runtime.notReady', 'ThreeRuntime is not ready', services);
    }
    const runtime = services.runtimeGateway.getRuntime()!;
    return success(request, services, {
      status: request.operation,
      canvas: {
        width: runtime.renderer.domElement.width,
        height: runtime.renderer.domElement.height,
      },
      diagnostics: runtime.diagnostics(),
    });
  }
  if (request.operation === 'host.handshake') {
    const runtime = services.runtimeGateway.getRuntime();
    return success(request, services, {
      controllerReady: true,
      runtimeReady: runtimeReady(services),
      hostInstanceId: request.hostInstanceId,
      canvas: runtime
        ? { width: runtime.renderer.domElement.width, height: runtime.renderer.domElement.height }
        : undefined,
      diagnostics: runtime?.diagnostics(),
      capabilities: [
        'project.inspect',
        'project.validate',
        'edit.apply',
        'edit.batch',
        'edit.dryRun',
      ],
    });
  }
  const args = record(request.args);
  if (request.operation === 'project.open') {
    const path = typeof args.path === 'string' ? args.path : '';
    if (!path) {
      return failure(request, 'project.pathRequired', 'project.open requires args.path', services);
    }
    const blocked = await prepareProjectReplacement(request, services);
    if (blocked) {
      return blocked;
    }
    const approved = services.project.captureSave();
    try {
      const opened = await openProjectAtPath(path);
      if (!services.project.matches(approved.cursor)) {
        return failure(
          request,
          'document_epoch.conflict',
          'Project changed while opening',
          services,
        );
      }
      const replaced = services.project.replace(opened.doc, opened.path);
      if (!replaced.ok) {
        return failure(request, replaced.error.code, 'Project installation failed', services);
      }
      services.session.set({
        currentLevelId: opened.doc.levels[0]?.id ?? '',
        selectedId: undefined,
        tool: 'select',
        hiddenIds: [],
        wholeBuildingPreview: false,
      });
      return success(
        request,
        services,
        { path: opened.path, projectId: opened.doc.id },
        replaced.changeSet,
      );
    } catch (error) {
      return failureFromError(request, error, services);
    }
  }
  if (request.operation === 'project.save' || request.operation === 'project.saveAs') {
    const requestedPath =
      request.operation === 'project.saveAs'
        ? typeof args.path === 'string'
          ? args.path
          : undefined
        : undefined;
    if (request.operation === 'project.saveAs' && !requestedPath) {
      return failure(
        request,
        'project.pathRequired',
        'project.saveAs requires args.path',
        services,
      );
    }
    try {
      const saved = await saveCurrentProject(services, requestedPath);
      if (!saved.saved) {
        return failure(
          request,
          'document_epoch.conflict',
          'Project changed while saving',
          services,
        );
      }
      return success(request, services, saved);
    } catch (error) {
      return failureFromError(request, error, services);
    }
  }
  if (request.operation === 'project.close') {
    const blocked = await prepareProjectReplacement(request, services);
    if (blocked) {
      return blocked;
    }
    const closed = services.project.close();
    return closed.ok
      ? success(request, services, { closed: true }, closed.changeSet)
      : failure(request, closed.error.code, 'Project close failed', services);
  }
  if (request.operation === 'project.inspect') {
    const document = services.core.getSnapshot();
    return success(request, services, {
      id: document.id,
      name: document.name,
      revision: document.revision,
      levels: document.levels.length,
      walls: document.walls.length,
      slabs: document.slabs.length,
      openings: document.openings.length,
      resources: document.resources.length,
    });
  }
  if (request.operation === 'project.validate') {
    const result = validateDocument(services.core.getSnapshot());
    return result.ok
      ? success(request, services, { valid: true })
      : failure(request, result.error.code, 'Project validation failed', services);
  }
  if (request.operation === 'project.new') {
    const blocked = await prepareProjectReplacement(request, services);
    if (blocked) {
      return blocked;
    }
    if (args.template !== undefined && args.template !== 'courtyard') {
      return failure(request, 'template.unsupported', 'Unknown project template', services);
    }
    const result = services.project.replace(
      createProjectTemplate(String(args.name ?? 'Untitled'), args.template),
    );
    return result.ok
      ? success(request, services, { projectId: cursor(services).projectId }, result.changeSet)
      : failure(request, result.error.code, 'Project creation failed', services);
  }
  if (request.operation === 'history.undo' || request.operation === 'history.redo') {
    const historyOptions = {
      projectId: request.project?.projectId,
      baseRevision: request.project?.revision,
      documentEpoch: request.project?.documentEpoch,
    };
    const result =
      request.operation === 'history.undo'
        ? services.commands.undo(historyOptions)
        : services.commands.redo(historyOptions);
    return result.ok
      ? success(request, services, { revision: cursor(services).revision }, result.changeSet)
      : failure(request, result.error.code, 'History operation failed', services);
  }
  if (request.operation.startsWith('session.')) {
    if (request.operation === 'session.get') {
      return success(request, services, sessionResult(services));
    }
    const patch = sessionPatch(request, services, args);
    if (!patch.ok) {
      return failure(request, 'invalid_request', patch.message, services);
    }
    services.session.set(patch.patch as never);
    return success(request, services, sessionResult(services));
  }
  if (request.operation.startsWith('render.')) {
    const runtime = services.runtimeGateway.getRuntime();
    if (!runtime || !runtimeReady(services)) {
      return failure(request, 'runtime.notReady', 'ThreeRuntime is not ready', services);
    }
    if (request.operation === 'render.getState') {
      return success(request, services, runtime.getRenderState());
    }
    if (request.operation === 'render.diagnostics') {
      return success(request, services, runtime.diagnostics());
    }
    if (request.operation === 'render.setBackend') {
      const actual = await runtime.setRendererBackend(args.backend as 'webgl' | 'webgpu');
      return success(request, services, { actualBackend: actual ? args.backend : 'webgl' });
    }
    if (request.operation === 'render.setMode') {
      await runtime.setPathTracing(args.mode === 'pathtrace');
      return success(request, services, { mode: args.mode });
    }
    if (request.operation === 'render.setSamples') {
      runtime.setPathSamples(Number(args.samples));
      return success(request, services, runtime.getRenderState());
    }
    if (request.operation === 'render.pause' || request.operation === 'render.resume') {
      runtime.pausePathTracing(request.operation === 'render.pause');
      return success(request, services, runtime.getRenderState());
    }
    if (request.operation === 'render.setPostProcessing') {
      runtime.setPostProcessing(args as never);
      return success(request, services, runtime.getRenderState());
    }
  }
  const command = commandFor(request.operation, args);
  if (!command) {
    return failure(
      request,
      'capability.unsupported',
      `Operation is not wired: ${request.operation}`,
      services,
    );
  }
  const result = services.commands.execute(command, {
    dryRun: request.operation === 'edit.dryRun' || request.options?.dryRun,
    label: request.operation,
    projectId: request.project?.projectId,
    baseRevision: request.project?.revision,
    documentEpoch: request.project?.documentEpoch,
  });
  return result.ok
    ? success(request, services, { revision: cursor(services).revision }, result.changeSet)
    : failure(request, result.error.code, 'Command rejected', services);
}

/** Converts handler failures into a response so a disconnected or malformed host never strands a request. */
export async function handleControlRequest(
  raw: ControlRequest,
  services: Services,
): Promise<ControlResponse> {
  try {
    return await handleControlRequestImpl(raw, services);
  } catch (error) {
    return failureFromError(raw, error, services);
  }
}
