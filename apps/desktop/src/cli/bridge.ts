import {
  DEFAULT_MAX_RESPONSE_BYTES,
  PROTOCOL_VERSION,
  ProtocolError,
  errorResponse,
  isWriteOperation,
  stableStringify,
  validateControlRequest,
  validateControlResponse,
  type ControlMode,
  type ControlRequest,
  type ControlResponse,
  type ControlStatus,
  type Operation,
  type ProjectCursor,
  type ProtocolErrorShape,
  type RequestOptions,
} from './protocol';

export interface BridgeTransport {
  send(request: ControlRequest): Promise<unknown>;
  onDisconnect?(listener: (reason?: unknown) => void): (() => void) | void;
  close?(): Promise<void> | void;
}

export interface CliBridgeOptions {
  mode?: ControlMode;
  clientSessionId: string;
  hostInstanceId?: string;
  initialCursor?: ProjectCursor;
  maxQueueLength?: number;
  maxCacheEntries?: number;
  defaultTimeoutMs?: number;
  maxResponseBytes?: number;
  status?: ControlStatus;
}

export interface InvokeOptions extends RequestOptions {
  requestId?: string;
  project?: ProjectCursor;
}

interface CachedResponse {
  fingerprint: string;
  response: ControlResponse;
}

interface QueueEntry {
  request: ControlRequest;
  fingerprint: string;
  resolve: (response: ControlResponse) => void;
}

const DEFAULT_QUEUE_LENGTH = 64;
const DEFAULT_CACHE_ENTRIES = 128;
const DEFAULT_TIMEOUT_MS = 120_000;

function requestId(prefix: string, counter: number): string {
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

function protocolErrorShape(error: unknown, fallback: ProtocolErrorCode): ProtocolErrorShape {
  if (error instanceof ProtocolError) {
    return error.toShape();
  }
  return {
    code: fallback,
    message: error instanceof Error ? error.message : String(error),
  };
}

type ProtocolErrorCode =
  | 'transport.error'
  | 'transport.disconnected'
  | 'unknown_outcome'
  | 'timeout';

/** Serializes control requests and owns bounded idempotency state for one host connection. */
export class CliBridge {
  private readonly mode: ControlMode;
  private readonly clientSessionId: string;
  private readonly hostInstanceId?: string;
  private readonly maxQueueLength: number;
  private readonly maxCacheEntries: number;
  private readonly defaultTimeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly transport: BridgeTransport;
  private readonly queue: QueueEntry[] = [];
  private readonly pending = new Map<
    string,
    { fingerprint: string; promise: Promise<ControlResponse> }
  >();
  private readonly cache = new Map<string, CachedResponse>();
  private disconnectWaiter!: { promise: Promise<void>; resolve: () => void };
  private unsubscribeDisconnect?: () => void;
  private active = false;
  private closed = false;
  private idCounter = 0;
  private cursor?: ProjectCursor;
  private status?: ControlStatus;

  constructor(transport: BridgeTransport, options: CliBridgeOptions) {
    if (!options.clientSessionId) {
      throw new ProtocolError('invalid_session', 'clientSessionId is required');
    }
    if (options.mode === 'realtime' && !options.hostInstanceId) {
      throw new ProtocolError('invalid_host', 'Realtime bridge requires hostInstanceId');
    }
    this.transport = transport;
    this.mode = options.mode ?? 'file';
    this.clientSessionId = options.clientSessionId;
    this.hostInstanceId = options.hostInstanceId;
    this.maxQueueLength = options.maxQueueLength ?? DEFAULT_QUEUE_LENGTH;
    this.maxCacheEntries = options.maxCacheEntries ?? DEFAULT_CACHE_ENTRIES;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    this.cursor = options.initialCursor;
    this.status = options.status;
    this.resetDisconnectWaiter();
    const unsubscribe = transport.onDisconnect?.((reason) => this.handleDisconnect(reason));
    this.unsubscribeDisconnect = typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }

  /** Sends a pre-built envelope; queued requests are always processed one at a time. */
  request<TArgs, TResult>(request: ControlRequest<TArgs>): Promise<ControlResponse<TResult>> {
    const checked = validateControlRequest<TArgs>(request);
    if (checked.clientSessionId !== this.clientSessionId) {
      return Promise.resolve(
        errorResponse(
          checked.requestId,
          new ProtocolError('invalid_session', 'Client session does not match this bridge'),
        ),
      ) as Promise<ControlResponse<TResult>>;
    }
    if (this.mode === 'realtime' && checked.hostInstanceId !== this.hostInstanceId) {
      return Promise.resolve(
        errorResponse(
          checked.requestId,
          new ProtocolError('invalid_host', 'Host instance does not match this bridge'),
        ),
      ) as Promise<ControlResponse<TResult>>;
    }
    if (checked.mode !== undefined && checked.mode !== this.mode) {
      return Promise.resolve(
        errorResponse(
          checked.requestId,
          new ProtocolError('invalid_request', 'Request mode does not match this bridge'),
        ),
      ) as Promise<ControlResponse<TResult>>;
    }
    const fingerprint = stableStringify(checked);
    const cached = this.cache.get(checked.requestId);
    if (cached) {
      if (cached.fingerprint !== fingerprint) {
        return Promise.resolve(
          errorResponse(
            checked.requestId,
            new ProtocolError('duplicate_request', 'requestId was reused with different content'),
          ),
        ) as Promise<ControlResponse<TResult>>;
      }
      return Promise.resolve(cached.response as ControlResponse<TResult>);
    }
    const existing = this.pending.get(checked.requestId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return Promise.resolve(
          errorResponse(
            checked.requestId,
            new ProtocolError(
              'duplicate_request',
              'requestId is already in flight with different content',
            ),
          ),
        ) as Promise<ControlResponse<TResult>>;
      }
      return existing.promise as Promise<ControlResponse<TResult>>;
    }
    const conflict = this.localCursorConflict(checked);
    if (conflict) {
      return Promise.resolve(
        errorResponse(checked.requestId, conflict, this.cursor, this.status),
      ) as Promise<ControlResponse<TResult>>;
    }
    if (this.closed || this.queue.length >= this.maxQueueLength) {
      const error = new ProtocolError(
        this.closed ? 'transport.disconnected' : 'queue_full',
        this.closed ? 'Bridge is disconnected' : 'Bridge request queue is full',
        undefined,
        !this.closed,
      );
      return Promise.resolve(
        errorResponse(checked.requestId, error, this.cursor, this.status),
      ) as Promise<ControlResponse<TResult>>;
    }
    let resolve!: (response: ControlResponse) => void;
    const promise = new Promise<ControlResponse>((resolvePromise) => {
      resolve = resolvePromise;
    });
    this.pending.set(checked.requestId, { fingerprint, promise });
    this.queue.push({ request: checked, fingerprint, resolve });
    void this.processQueue();
    return promise as Promise<ControlResponse<TResult>>;
  }

  /** Builds a request envelope for callers that only have an operation and arguments. */
  invoke<TArgs, TResult>(
    operation: Operation,
    args: TArgs,
    options: InvokeOptions = {},
  ): Promise<ControlResponse<TResult>> {
    const { requestId: explicitId, project, ...requestOptions } = options;
    const id = explicitId ?? requestId(this.clientSessionId, ++this.idCounter);
    const request: ControlRequest<TArgs> = {
      protocolVersion: PROTOCOL_VERSION,
      requestId: id,
      clientSessionId: this.clientSessionId,
      ...(this.hostInstanceId ? { hostInstanceId: this.hostInstanceId } : {}),
      mode: this.mode,
      operation,
      ...(project ? { project } : this.cursor ? { project: this.cursor } : {}),
      args,
      ...(Object.keys(requestOptions).length ? { options: requestOptions } : {}),
    };
    return this.request<TArgs, TResult>(request);
  }

  /** Alias for request, retained for transports that expose send semantics. */
  send<TArgs, TResult>(request: ControlRequest<TArgs>): Promise<ControlResponse<TResult>> {
    return this.request<TArgs, TResult>(request);
  }

  /** Reads the latest formal project cursor observed from a successful response. */
  getCursor(): ProjectCursor | undefined {
    return this.cursor ? { ...this.cursor } : undefined;
  }

  /** Replaces the expected cursor after an external open/new operation. */
  setCursor(cursor: ProjectCursor | undefined): void {
    this.cursor = cursor ? { ...cursor } : undefined;
  }

  /** Returns the most recent host status summary for UI or CLI diagnostics. */
  getStatus(): ControlStatus | undefined {
    return this.status ? { ...this.status } : undefined;
  }

  /** Marks the connection unavailable and resolves the active request as unknown outcome. */
  disconnect(reason?: unknown): void {
    this.handleDisconnect(reason);
  }

  /** Closes the transport and disposes the disconnect listener. */
  async close(): Promise<void> {
    this.handleDisconnect();
    this.unsubscribeDisconnect?.();
    this.unsubscribeDisconnect = undefined;
    await this.transport.close?.();
  }

  private localCursorConflict(request: ControlRequest): ProtocolError | undefined {
    const expected = this.cursor;
    const actual = request.project;
    if (!expected || !actual || actual.projectId !== expected.projectId) {
      return undefined;
    }
    if (actual.documentEpoch !== expected.documentEpoch) {
      return new ProtocolError('document_epoch.conflict', 'Request document epoch is stale', {
        expected: expected.documentEpoch,
        actual: actual.documentEpoch,
      });
    }
    if (actual.revision !== expected.revision) {
      return new ProtocolError('revision.conflict', 'Request revision is stale', {
        expected: expected.revision,
        actual: actual.revision,
      });
    }
    if (
      actual.runtimeEpoch !== undefined &&
      expected.runtimeEpoch !== undefined &&
      actual.runtimeEpoch !== expected.runtimeEpoch
    ) {
      return new ProtocolError('runtime_epoch.conflict', 'Request runtime epoch is stale', {
        expected: expected.runtimeEpoch,
        actual: actual.runtimeEpoch,
      });
    }
    return undefined;
  }

  private async processQueue(): Promise<void> {
    if (this.active) {
      return;
    }
    this.active = true;
    try {
      while (this.queue.length > 0) {
        const entry = this.queue.shift()!;
        let response: ControlResponse;
        if (this.closed) {
          response = errorResponse(
            entry.request.requestId,
            new ProtocolError('transport.disconnected', 'Bridge is disconnected'),
            this.cursor,
            this.status,
          );
        } else {
          response = await this.sendOne(entry.request);
        }
        this.pending.delete(entry.request.requestId);
        this.remember(entry.request.requestId, entry.fingerprint, response);
        entry.resolve(response);
      }
    } finally {
      this.active = false;
    }
  }

  private async sendOne(request: ControlRequest): Promise<ControlResponse> {
    const timeoutMs = request.options?.timeoutMs ?? this.defaultTimeoutMs;
    const sendPromise = Promise.resolve().then(() => this.transport.send(request));
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () =>
          reject(new ProtocolError('timeout', 'Control request timed out', { timeoutMs }, true)),
        timeoutMs,
      );
    });
    try {
      const raw = await Promise.race([
        sendPromise,
        timeout,
        this.disconnectWaiter.promise.then(() => {
          throw new ProtocolError(
            isWriteOperation(request.operation) ? 'unknown_outcome' : 'transport.disconnected',
            isWriteOperation(request.operation)
              ? 'Connection lost after the request was sent; outcome is unknown'
              : 'Connection lost before the response arrived',
            undefined,
            false,
          );
        }),
      ]);
      const response = validateControlResponse(raw);
      if (response.requestId !== request.requestId) {
        throw new ProtocolError('transport.error', 'Response requestId does not match request');
      }
      this.updateState(response);
      return this.limitResponse(response);
    } catch (failure) {
      const shape = protocolErrorShape(
        failure,
        this.closed
          ? isWriteOperation(request.operation)
            ? 'unknown_outcome'
            : 'transport.disconnected'
          : 'transport.error',
      );
      return errorResponse(request.requestId, shape, this.cursor, this.status);
    } finally {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private limitResponse(response: ControlResponse): ControlResponse {
    const encoded = new TextEncoder().encode(stableStringify(response));
    if (encoded.byteLength > this.maxResponseBytes) {
      return errorResponse(
        response.requestId,
        new ProtocolError('response_too_large', 'Response exceeds the configured byte limit'),
        this.cursor,
        this.status,
      );
    }
    return response;
  }

  private updateState(response: ControlResponse): void {
    if (response.status) {
      this.status = { ...response.status };
    }
    if (
      response.projectId !== undefined &&
      response.revision !== undefined &&
      response.documentEpoch !== undefined
    ) {
      this.cursor = {
        projectId: response.projectId,
        revision: response.revision,
        documentEpoch: response.documentEpoch,
        ...(response.runtimeEpoch !== undefined ? { runtimeEpoch: response.runtimeEpoch } : {}),
      };
    }
  }

  private remember(requestIdValue: string, fingerprint: string, response: ControlResponse): void {
    this.cache.delete(requestIdValue);
    this.cache.set(requestIdValue, { fingerprint, response });
    while (this.cache.size > this.maxCacheEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.cache.delete(oldest);
    }
  }

  private resetDisconnectWaiter(): void {
    let resolve!: () => void;
    const promise = new Promise<void>((resolvePromise) => {
      resolve = resolvePromise;
    });
    this.disconnectWaiter = { promise, resolve };
  }

  private handleDisconnect(reason?: unknown): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.disconnectWaiter.resolve();
    while (this.queue.length > 0) {
      const entry = this.queue.shift()!;
      this.pending.delete(entry.request.requestId);
      const response = errorResponse(
        entry.request.requestId,
        isWriteOperation(entry.request.operation)
          ? new ProtocolError(
              'unknown_outcome',
              'Connection closed before a queued write was sent',
              {
                reason: reason instanceof Error ? reason.message : reason,
              },
            )
          : new ProtocolError('transport.disconnected', 'Bridge is disconnected'),
        this.cursor,
        this.status,
      );
      this.remember(entry.request.requestId, entry.fingerprint, response);
      entry.resolve(response);
    }
  }
}
