export const PROTOCOL_VERSION = 1 as const;
export const DEFAULT_MAX_REQUEST_BYTES = 4 * 1024 * 1024;
export const DEFAULT_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

export type ProtocolVersion = typeof PROTOCOL_VERSION;
export type ControlMode = 'file' | 'realtime';
export type DirtyPolicy = 'fail' | 'save' | 'discard';

const OPERATION_VALUES = [
  'project.new',
  'project.open',
  'project.save',
  'project.saveAs',
  'project.close',
  'project.inspect',
  'project.validate',
  'project.rename',
  'edit.apply',
  'edit.batch',
  'edit.dryRun',
  'history.undo',
  'history.redo',
  'level.create',
  'level.update',
  'level.delete',
  'wall.create',
  'wall.update',
  'wall.delete',
  'slab.createRectangle',
  'slab.update',
  'slab.delete',
  'opening.place',
  'opening.update',
  'opening.delete',
  'material.set',
  'resource.import',
  'resource.list',
  'continuity.set',
  'environment.set',
  'export.glb',
  'export.gltf',
  'session.get',
  'session.setLevel',
  'session.setTool',
  'session.select',
  'session.setHidden',
  'session.setWholeBuildingPreview',
  'session.setSnapSettings',
  'camera.get',
  'camera.set',
  'camera.focus',
  'camera.orbit',
  'camera.pan',
  'camera.zoom',
  'camera.project',
  'camera.captureState',
  'render.getState',
  'render.setBackend',
  'render.setMode',
  'render.setSamples',
  'render.pause',
  'render.resume',
  'render.setPostProcessing',
  'render.capturePng',
  'render.diagnostics',
  'window.getState',
  'window.show',
  'window.hide',
  'window.focus',
  'window.minimize',
  'window.maximize',
  'window.restore',
  'window.toggleMaximize',
  'window.setSize',
  'window.setPosition',
  'window.center',
  'window.setFullscreen',
  'window.setTitle',
  'window.requestClose',
  'controller_ready',
  'runtime_ready',
  'host.handshake',
] as const;

export type Operation = (typeof OPERATION_VALUES)[number];
const OPERATIONS: ReadonlySet<string> = new Set(OPERATION_VALUES);

const READ_OPERATIONS: ReadonlySet<Operation> = new Set([
  'project.inspect',
  'project.validate',
  'resource.list',
  'session.get',
  'camera.get',
  'camera.captureState',
  'render.getState',
  'render.diagnostics',
  'window.getState',
]);

const HANDSHAKE_OPERATIONS: ReadonlySet<Operation> = new Set([
  'controller_ready',
  'runtime_ready',
  'host.handshake',
]);
const REPLACEMENTS = new Set<Operation>(['project.new', 'project.open', 'project.close']);

export interface ProjectCursor {
  projectId: string;
  revision: number;
  documentEpoch: number;
  runtimeEpoch?: number;
}

export interface RequestOptions {
  dryRun?: boolean;
  ifDirty?: DirtyPolicy;
  timeoutMs?: number;
  idempotencyKey?: string;
  overwrite?: boolean;
}

export interface ControlRequest<TArgs = unknown> {
  protocolVersion: ProtocolVersion;
  requestId: string;
  clientSessionId: string;
  hostInstanceId?: string;
  mode?: ControlMode;
  operation: Operation;
  project?: ProjectCursor;
  args: TArgs;
  options?: RequestOptions;
}

export interface ChangeSet {
  readonly changedIds?: readonly string[];
  readonly addedIds?: readonly string[];
  readonly removedIds?: readonly string[];
  readonly [key: string]: unknown;
}

export interface ProtocolWarning {
  code: string;
  message?: string;
  details?: Readonly<Record<string, unknown>>;
}

export type ProtocolErrorCode =
  | 'invalid_request'
  | 'unknown_field'
  | 'unsupported_protocol'
  | 'request_too_large'
  | 'response_too_large'
  | 'invalid_request_id'
  | 'invalid_session'
  | 'invalid_host'
  | 'missing_project_cursor'
  | 'invalid_project_cursor'
  | 'revision.conflict'
  | 'document_epoch.conflict'
  | 'runtime_epoch.conflict'
  | 'duplicate_request'
  | 'unknown_outcome'
  | 'not_ready'
  | 'queue_full'
  | 'timeout'
  | 'cancelled'
  | 'transport.disconnected'
  | 'transport.error'
  | 'capability.unsupported';

export interface ProtocolErrorShape {
  code: ProtocolErrorCode | string;
  message: string;
  details?: Readonly<Record<string, unknown>>;
  retryable?: boolean;
}

export interface CapabilityStatus {
  name: string;
  available: boolean;
  reason?: string;
}

export interface ControlStatus {
  mode?: ControlMode;
  controllerReady?: boolean;
  runtimeReady?: boolean;
  hostInstanceId?: string;
  capabilities?: readonly CapabilityStatus[];
  [key: string]: unknown;
}

export interface ControlResponse<TResult = unknown> {
  protocolVersion: ProtocolVersion;
  requestId: string;
  ok: boolean;
  projectId?: string;
  revision?: number;
  documentEpoch?: number;
  runtimeEpoch?: number;
  result?: TResult;
  changeSet?: ChangeSet;
  warnings: readonly ProtocolWarning[];
  error?: ProtocolErrorShape;
  capabilities?: unknown;
  status?: ControlStatus;
}

export class ProtocolError extends Error {
  readonly code: ProtocolErrorCode | string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly retryable: boolean;

  /** Creates a structured protocol error that can cross a transport boundary safely. */
  constructor(
    code: ProtocolErrorCode | string,
    message: string,
    details?: Readonly<Record<string, unknown>>,
    retryable = false,
  ) {
    super(message);
    this.name = 'ProtocolError';
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }

  toShape(): ProtocolErrorShape {
    return {
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
      ...(this.retryable ? { retryable: true } : {}),
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, message: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ProtocolError('invalid_request', message);
  }
}

function assertNoUnknownFields(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  context: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ProtocolError('unknown_field', `Unknown ${context} field: ${key}`, { key });
    }
  }
}
function assertId(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256) {
    throw new ProtocolError('invalid_request', `${field} must be a non-empty string`);
  }
}
function assertCursor(value: unknown): asserts value is ProjectCursor {
  assertRecord(value, 'project must be an object');
  assertNoUnknownFields(
    value,
    new Set(['projectId', 'revision', 'documentEpoch', 'runtimeEpoch']),
    'project',
  );
  assertId(value.projectId, 'project.projectId');
  if (
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 0 ||
    !Number.isSafeInteger(value.documentEpoch) ||
    (value.documentEpoch as number) < 0 ||
    (value.runtimeEpoch !== undefined &&
      (!Number.isSafeInteger(value.runtimeEpoch) || (value.runtimeEpoch as number) < 0))
  ) {
    throw new ProtocolError(
      'invalid_project_cursor',
      'project revision and epochs must be non-negative integers',
    );
  }
}
function validateOptions(value: unknown): RequestOptions | undefined {
  if (value === undefined) {
    return undefined;
  }
  assertRecord(value, 'options must be an object');
  assertNoUnknownFields(
    value,
    new Set(['dryRun', 'ifDirty', 'timeoutMs', 'idempotencyKey', 'overwrite']),
    'options',
  );
  if (value.dryRun !== undefined && typeof value.dryRun !== 'boolean') {
    throw new ProtocolError('invalid_request', 'options.dryRun must be boolean');
  }
  if (value.ifDirty !== undefined && !['fail', 'save', 'discard'].includes(String(value.ifDirty))) {
    throw new ProtocolError('invalid_request', 'options.ifDirty is invalid');
  }
  if (
    value.timeoutMs !== undefined &&
    (!Number.isSafeInteger(value.timeoutMs) ||
      (value.timeoutMs as number) <= 0 ||
      (value.timeoutMs as number) > 600_000)
  ) {
    throw new ProtocolError('invalid_request', 'options.timeoutMs must be between 1 and 600000');
  }
  if (value.idempotencyKey !== undefined) {
    assertId(value.idempotencyKey, 'options.idempotencyKey');
  }
  if (value.overwrite !== undefined && typeof value.overwrite !== 'boolean') {
    throw new ProtocolError('invalid_request', 'options.overwrite must be boolean');
  }
  return value as RequestOptions;
}
/** Whether a command mutates formal project data or history. */
export function isWriteOperation(operation: Operation): boolean {
  return !isReadOperation(operation);
}
/** Whether a command is read-only and may use a document snapshot without a write cursor. */
export function isReadOperation(operation: Operation): boolean {
  return READ_OPERATIONS.has(operation) || HANDSHAKE_OPERATIONS.has(operation);
}
/** Whether a command must carry the current project revision and document epoch. */
export function requiresProject(operation: Operation): boolean {
  return !isReadOperation(operation) && !REPLACEMENTS.has(operation);
}
/** Validates an in-memory request and returns the same typed envelope. */
export function validateControlRequest<TArgs>(request: unknown): ControlRequest<TArgs> {
  assertRecord(request, 'request must be an object');
  assertNoUnknownFields(
    request,
    new Set([
      'protocolVersion',
      'requestId',
      'clientSessionId',
      'hostInstanceId',
      'mode',
      'operation',
      'project',
      'args',
      'options',
    ]),
    'request',
  );
  if (request.protocolVersion !== PROTOCOL_VERSION) {
    throw new ProtocolError(
      'unsupported_protocol',
      `Protocol version ${String(request.protocolVersion)} is not supported`,
    );
  }
  assertId(request.requestId, 'requestId');
  assertId(request.clientSessionId, 'clientSessionId');
  if (request.hostInstanceId !== undefined) {
    assertId(request.hostInstanceId, 'hostInstanceId');
  }
  if (request.mode !== undefined && request.mode !== 'file' && request.mode !== 'realtime') {
    throw new ProtocolError('invalid_request', 'mode must be file or realtime');
  }
  if (request.mode === 'realtime' && request.hostInstanceId === undefined) {
    throw new ProtocolError('invalid_host', 'Realtime requests require hostInstanceId');
  }
  if (typeof request.operation !== 'string' || !OPERATIONS.has(request.operation)) {
    throw new ProtocolError(
      'invalid_request',
      `Unsupported operation: ${String(request.operation)}`,
    );
  }
  const operation = request.operation as Operation;
  if (requiresProject(operation) && request.project === undefined) {
    throw new ProtocolError(
      'missing_project_cursor',
      `Operation ${operation} requires a project cursor`,
    );
  }
  if (request.project !== undefined) {
    assertCursor(request.project);
  }
  if (!('args' in request)) {
    throw new ProtocolError('invalid_request', 'args is required');
  }
  validateOptions(request.options);
  return request as unknown as ControlRequest<TArgs>;
}
/** Parses JSONL payloads while enforcing the bounded request size. */
export function parseControlRequest<TArgs = unknown>(
  payload: string | Uint8Array | unknown,
  maxBytes = DEFAULT_MAX_REQUEST_BYTES,
): ControlRequest<TArgs> {
  let value: unknown = payload;
  if (typeof payload === 'string') {
    if (new TextEncoder().encode(payload).byteLength > maxBytes) {
      throw new ProtocolError('request_too_large', 'Request exceeds the configured byte limit');
    }
    try {
      value = JSON.parse(payload) as unknown;
    } catch {
      throw new ProtocolError('invalid_request', 'Request is not valid JSON');
    }
  } else if (payload instanceof Uint8Array) {
    if (payload.byteLength > maxBytes) {
      throw new ProtocolError('request_too_large', 'Request exceeds the configured byte limit');
    }
    try {
      value = JSON.parse(new TextDecoder().decode(payload)) as unknown;
    } catch {
      throw new ProtocolError('invalid_request', 'Request is not valid UTF-8 JSON');
    }
  }
  return validateControlRequest<TArgs>(value);
}
/** Validates an in-memory response before it is released to a caller. */
export function validateControlResponse<TResult>(response: unknown): ControlResponse<TResult> {
  assertRecord(response, 'response must be an object');
  assertNoUnknownFields(
    response,
    new Set([
      'protocolVersion',
      'requestId',
      'ok',
      'projectId',
      'revision',
      'documentEpoch',
      'runtimeEpoch',
      'result',
      'changeSet',
      'warnings',
      'error',
      'capabilities',
      'status',
    ]),
    'response',
  );
  if (response.protocolVersion !== PROTOCOL_VERSION) {
    throw new ProtocolError('unsupported_protocol', 'Response protocol version is not supported');
  }
  assertId(response.requestId, 'response.requestId');
  if (typeof response.ok !== 'boolean') {
    throw new ProtocolError('invalid_request', 'response.ok must be boolean');
  }
  if (!Array.isArray(response.warnings)) {
    throw new ProtocolError('invalid_request', 'response.warnings must be an array');
  }
  if (!response.ok && !isRecord(response.error)) {
    throw new ProtocolError('invalid_request', 'Failed responses must include an error');
  }
  if (response.projectId !== undefined) {
    assertId(response.projectId, 'response.projectId');
  }
  for (const field of ['revision', 'documentEpoch', 'runtimeEpoch'] as const) {
    const fieldValue = response[field];
    if (
      fieldValue !== undefined &&
      (!Number.isSafeInteger(fieldValue) || (fieldValue as number) < 0)
    ) {
      throw new ProtocolError(
        'invalid_request',
        `response.${field} must be a non-negative integer`,
      );
    }
  }
  return response as unknown as ControlResponse<TResult>;
}
/** Creates a response envelope with a structured error and no result payload. */
export function errorResponse(
  requestId: string,
  error: ProtocolError | ProtocolErrorShape,
  cursor?: Partial<ProjectCursor>,
  status?: ControlStatus,
): ControlResponse<never> {
  const shape = error instanceof ProtocolError ? error.toShape() : error;
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    ok: false,
    warnings: [],
    error: shape,
    ...(cursor?.projectId ? { projectId: cursor.projectId } : {}),
    ...(cursor?.revision !== undefined ? { revision: cursor.revision } : {}),
    ...(cursor?.documentEpoch !== undefined ? { documentEpoch: cursor.documentEpoch } : {}),
    ...(cursor?.runtimeEpoch !== undefined ? { runtimeEpoch: cursor.runtimeEpoch } : {}),
    ...(status ? { status } : {}),
  };
}
/** Returns a deterministic JSON representation for idempotency comparisons. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}
