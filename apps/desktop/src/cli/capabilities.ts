import {
  PROTOCOL_VERSION,
  ProtocolError,
  type CapabilityStatus,
  type ControlMode,
  type ProtocolVersion,
} from './protocol';

export type CapabilityName =
  | 'project'
  | 'edit'
  | 'history'
  | 'session'
  | 'camera'
  | 'render'
  | 'render.webgpu'
  | 'render.pathtrace'
  | 'export.glb'
  | 'export.gltf'
  | 'resource'
  | 'window'
  | 'window.os'
  | 'automation.host'
  | 'transport.stdio'
  | 'transport.named-pipe'
  | 'transport.uds';

export type CapabilityAvailability = 'available' | 'degraded' | 'unavailable';

export interface Capability {
  name: CapabilityName | string;
  availability: CapabilityAvailability;
  modes: readonly ControlMode[];
  reason?: string;
  constraints?: Readonly<Record<string, unknown>>;
}

export interface CapabilitySnapshot {
  protocolVersion: ProtocolVersion;
  mode: ControlMode;
  appVersion?: string;
  hostInstanceId?: string;
  controllerReady: boolean;
  runtimeReady: boolean;
  capabilities: readonly Capability[];
}

export interface CapabilityNegotiation {
  ok: boolean;
  protocolVersion: ProtocolVersion;
  mode: ControlMode;
  accepted: readonly Capability[];
  missing: readonly CapabilityName[];
  warnings: readonly string[];
}

const DEFAULT_CAPABILITIES: readonly CapabilityName[] = [
  'project',
  'edit',
  'history',
  'session',
  'camera',
  'render',
  'render.webgpu',
  'render.pathtrace',
  'export.glb',
  'export.gltf',
  'resource',
  'window',
  'window.os',
  'automation.host',
  'transport.stdio',
  'transport.named-pipe',
  'transport.uds',
];

function defaultModeCapabilities(mode: ControlMode): Capability[] {
  return DEFAULT_CAPABILITIES.map((name) => {
    const modes: readonly ControlMode[] =
      name === 'transport.stdio'
        ? ['file']
        : name === 'transport.named-pipe' || name === 'transport.uds' || name === 'window.os'
          ? ['realtime']
          : ['file', 'realtime'];
    const available = modes.includes(mode);
    return {
      name,
      availability: available ? 'available' : 'unavailable',
      modes,
      ...(available ? {} : { reason: `Capability is unavailable in ${mode} mode` }),
    };
  });
}

export interface CapabilitySnapshotInput {
  mode: ControlMode;
  appVersion?: string;
  hostInstanceId?: string;
  controllerReady?: boolean;
  runtimeReady?: boolean;
  capabilities?: readonly Capability[];
}

/** Builds a bounded capability snapshot for handshake and status responses. */
export function createCapabilitySnapshot(input: CapabilitySnapshotInput): CapabilitySnapshot {
  if (input.mode === 'realtime' && !input.hostInstanceId) {
    throw new ProtocolError('invalid_host', 'Realtime capability snapshots require hostInstanceId');
  }
  const capabilities = input.capabilities
    ? input.capabilities.map((capability) => ({ ...capability, modes: [...capability.modes] }))
    : defaultModeCapabilities(input.mode);
  return {
    protocolVersion: PROTOCOL_VERSION,
    mode: input.mode,
    ...(input.appVersion ? { appVersion: input.appVersion } : {}),
    ...(input.hostInstanceId ? { hostInstanceId: input.hostInstanceId } : {}),
    controllerReady: input.controllerReady ?? false,
    runtimeReady: input.runtimeReady ?? false,
    capabilities,
  };
}

/** Converts a snapshot to the small status summary carried by every response. */
export function capabilityStatus(snapshot: CapabilitySnapshot): readonly CapabilityStatus[] {
  return snapshot.capabilities.map((capability) => ({
    name: capability.name,
    available: capability.availability !== 'unavailable',
    ...(capability.reason ? { reason: capability.reason } : {}),
  }));
}

function capabilityMap(snapshot: CapabilitySnapshot): Map<string, Capability> {
  return new Map(snapshot.capabilities.map((capability) => [capability.name, capability]));
}

export interface NegotiateOptions {
  required?: readonly CapabilityName[];
  mode?: ControlMode;
}

/** Intersects local and remote capabilities without granting unsupported host behavior. */
export function negotiateCapabilities(
  local: CapabilitySnapshot,
  remote: CapabilitySnapshot,
  options: NegotiateOptions = {},
): CapabilityNegotiation {
  if (local.protocolVersion !== remote.protocolVersion) {
    throw new ProtocolError('unsupported_protocol', 'Capability protocol versions do not match', {
      local: local.protocolVersion,
      remote: remote.protocolVersion,
    });
  }
  const mode = options.mode ?? remote.mode;
  const localByName = capabilityMap(local);
  const remoteByName = capabilityMap(remote);
  const required = options.required ?? [];
  const missing: CapabilityName[] = [];
  const accepted: Capability[] = [];
  const warnings: string[] = [];
  const names = new Set<string>([...localByName.keys(), ...remoteByName.keys(), ...required]);
  for (const name of names) {
    const left = localByName.get(name);
    const right = remoteByName.get(name);
    const compatible =
      left !== undefined &&
      right !== undefined &&
      left.availability !== 'unavailable' &&
      right.availability !== 'unavailable' &&
      left.modes.includes(mode) &&
      right.modes.includes(mode);
    if (compatible) {
      accepted.push({
        name,
        availability:
          left.availability === 'degraded' || right.availability === 'degraded'
            ? 'degraded'
            : 'available',
        modes: [mode],
        ...(left.reason || right.reason ? { reason: left.reason ?? right.reason } : {}),
      });
      continue;
    }
    if (required.includes(name as CapabilityName)) {
      missing.push(name as CapabilityName);
    } else {
      warnings.push(`Optional capability unavailable: ${name}`);
    }
  }
  return {
    ok: missing.length === 0,
    protocolVersion: local.protocolVersion,
    mode,
    accepted,
    missing,
    warnings,
  };
}

/** Returns true only when a capability is available for the requested mode. */
export function hasCapability(
  snapshot: CapabilitySnapshot,
  name: CapabilityName | string,
  mode = snapshot.mode,
): boolean {
  const capability = snapshot.capabilities.find((entry) => entry.name === name);
  return (
    capability !== undefined &&
    capability.availability !== 'unavailable' &&
    capability.modes.includes(mode)
  );
}

/** Requires a capability and reports a structured error that can cross the bridge. */
export function assertCapability(
  snapshot: CapabilitySnapshot,
  name: CapabilityName | string,
  mode = snapshot.mode,
): void {
  if (!hasCapability(snapshot, name, mode)) {
    const capability = snapshot.capabilities.find((entry) => entry.name === name);
    throw new ProtocolError('capability.unsupported', `Capability is unavailable: ${name}`, {
      mode,
      reason: capability?.reason,
    });
  }
}
