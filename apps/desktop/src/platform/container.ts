/** Browser development adapter uses the same content-addressed ZIP as the Rust host. */
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { FloatType } from 'three';
import {
  validateDocument,
  environmentResourceBytes,
  inspectEnvironmentBytes,
  environmentExtension,
  ENVIRONMENT_LIMITS,
  type EnvironmentResource,
  type ProjectDocument,
  type Resource,
} from '@building/editor-core';

const MAX_PROJECT_BYTES = 256 * 1024 * 1024;
const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_JSON_BYTES = 32 * 1024 * 1024;
export interface PlatformError {
  code: string;
  details?: string;
}
function error(code: string, details: string): PlatformError {
  return { code, details };
}
function checked(document: unknown): asserts document is ProjectDocument {
  const result = validateDocument(document);
  if (!result.ok) {
    throw result.error;
  }
}
async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function bytesFromResource(resource: Resource): Uint8Array {
  const encoded = resource.dataUrl.slice(`data:${resource.mime};base64,`.length);
  let data: string;
  try {
    data = atob(encoded);
  } catch {
    throw error('invalid_image', resource.name);
  }
  if (!data.length || data.length > MAX_IMAGE_BYTES) {
    throw error('resource_too_large', resource.name);
  }
  return Uint8Array.from(data, (character) => character.charCodeAt(0));
}
function dataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 8192) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}
function imageSignature(bytes: Uint8Array, mime: string): boolean {
  if (mime === 'image/png') {
    return (
      bytes.length >= 8 &&
      bytes[0] === 137 &&
      bytes[1] === 80 &&
      bytes[2] === 78 &&
      bytes[3] === 71 &&
      bytes[4] === 13 &&
      bytes[5] === 10 &&
      bytes[6] === 26 &&
      bytes[7] === 10
    );
  }
  return (
    mime === 'image/jpeg' &&
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  );
}
async function validateImage(
  bytes: Uint8Array,
  mime: string,
  maxBytes = MAX_IMAGE_BYTES,
): Promise<void> {
  if (!bytes.length || bytes.length > maxBytes) {
    throw error('resource_too_large', 'Image limit is 32 MiB');
  }
  if (!imageSignature(bytes, mime)) {
    throw error('invalid_image', 'Image format does not match its contents');
  }
  // Decoding checks dimensions and corrupt image data, independently of the extension.
  if (typeof createImageBitmap === 'function') {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes).buffer], { type: mime }));
    } catch {
      throw error('invalid_image', 'Unable to decode image');
    }
    const valid = bitmap.width <= 8192 && bitmap.height <= 8192;
    bitmap.close();
    if (!valid) {
      throw error('invalid_image', 'Maximum image dimensions are 8192 by 8192');
    }
  }
}
/** Validates actual decoded HDR/EXR pixels, after bounded domain header inspection. */
export async function validateEnvironmentBytes(
  bytes: Uint8Array,
  expectedMime?: EnvironmentResource['mime'],
): Promise<ReturnType<typeof inspectEnvironmentBytes>> {
  const metadata = inspectEnvironmentBytes(bytes);
  if (expectedMime && metadata.mime !== expectedMime) {
    throw error('environment.invalidAsset', 'Environment MIME does not match its bytes');
  }
  if (metadata.mime === 'image/png' || metadata.mime === 'image/jpeg') {
    await validateImage(bytes, metadata.mime, ENVIRONMENT_LIMITS.maxBytes);
    return metadata;
  }
  try {
    const buffer = new Uint8Array(bytes).buffer;
    const decoded =
      metadata.mime === 'image/vnd.radiance'
        ? new (await import('three/examples/jsm/loaders/HDRLoader.js')).HDRLoader()
            .setDataType(FloatType)
            .parse(buffer)
        : new (await import('three/examples/jsm/loaders/EXRLoader.js')).EXRLoader()
            .setDataType(FloatType)
            .parse(buffer);
    if (
      decoded.width !== metadata.width ||
      decoded.height !== metadata.height ||
      !decoded.data ||
      decoded.data.length !== metadata.width * metadata.height * 4
    ) {
      throw new Error('Decoded panorama dimensions or payload do not match');
    }
    for (const component of decoded.data) {
      if (!Number.isFinite(component)) {
        throw new Error('Non-finite environment pixels');
      }
    }
  } catch (failure) {
    throw error(
      'environment.invalidAsset',
      failure instanceof Error ? failure.message : 'Unable to decode panorama',
    );
  }
  return metadata;
}
/** Decodes panorama bytes and retains the original file contents for portable save/export. */
export async function browserEnvironmentResource(file: File): Promise<EnvironmentResource> {
  if (file.size > ENVIRONMENT_LIMITS.maxBytes) {
    throw error('environment.assetTooLarge', file.name);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const metadata = await validateEnvironmentBytes(bytes);
  return {
    id: `environment_${await digest(bytes)}`,
    name: file.name,
    mime: metadata.mime,
    dataUrl: dataUrl(bytes, metadata.mime),
  };
}
/** Validates surface image bytes and gives identical content a stable hash-based identity. */
export async function browserResource(file: File): Promise<Resource> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw error('resource_too_large', file.name);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = file.type || (imageSignature(bytes, 'image/png') ? 'image/png' : 'image/jpeg');
  await validateImage(bytes, mime);
  return {
    id: `image_${await digest(bytes)}`,
    name: file.name,
    mime,
    dataUrl: dataUrl(bytes, mime),
  };
}
/** Serializes a detached snapshot; both deduplicated ZIP bytes and alias expansion stay bounded. */
export async function encodeProjectContainer(document: ProjectDocument): Promise<Uint8Array> {
  checked(document);
  const snapshot = structuredClone(document);
  const files: Record<string, Uint8Array> = {};
  let total = 0;
  let expandedTotal = 0;
  const storedResources = [];
  for (const resource of snapshot.resources) {
    const bytes = bytesFromResource(resource);
    expandedTotal += bytes.length;
    if (expandedTotal > MAX_PROJECT_BYTES) {
      throw error('file_too_large', 'Expanded project resources exceed 256 MiB');
    }
    await validateImage(bytes, resource.mime);
    const hash = await digest(bytes);
    const path = `resources/${hash}.${resource.mime === 'image/png' ? 'png' : 'jpg'}`;
    if (!files[path]) {
      total += bytes.length;
      files[path] = bytes;
    }
    if (total > MAX_PROJECT_BYTES) {
      throw error('file_too_large', 'Project resource limit is 256 MiB');
    }
    storedResources.push({
      id: resource.id,
      name: resource.name,
      mime: resource.mime,
      path,
      sha256: hash,
    });
  }
  const storedDocument = { ...snapshot, resources: storedResources };
  if (snapshot.environmentResources !== undefined) {
    const storedEnvironments = [];
    for (const resource of snapshot.environmentResources) {
      const bytes = environmentResourceBytes(resource);
      expandedTotal += bytes.length;
      if (expandedTotal > MAX_PROJECT_BYTES) {
        throw error('file_too_large', 'Expanded project resources exceed 256 MiB');
      }
      await validateEnvironmentBytes(bytes, resource.mime);
      const hash = await digest(bytes);
      const path = `environment-resources/${hash}.${environmentExtension(resource.mime)}`;
      if (!files[path]) {
        total += bytes.length;
        files[path] = bytes;
      }
      if (total > MAX_PROJECT_BYTES) {
        throw error('file_too_large', 'Project resource limit is 256 MiB');
      }
      storedEnvironments.push({
        id: resource.id,
        name: resource.name,
        mime: resource.mime,
        path,
        sha256: hash,
      });
    }
    Object.assign(storedDocument, { environmentResources: storedEnvironments });
  }
  files['project.json'] = strToU8(JSON.stringify(storedDocument));
  if (files['project.json'].length > MAX_JSON_BYTES) {
    throw error('file_too_large', 'Project data limit is 32 MiB');
  }
  const container = zipSync(files, { level: 6 });
  if (container.length > MAX_PROJECT_BYTES) {
    throw error('file_too_large', 'Project container limit is 256 MiB');
  }
  return container;
}
/** Bounds the manifest and resource expansion before materializing validated formal data. */
export async function decodeProjectContainer(bytes: Uint8Array): Promise<ProjectDocument> {
  if (bytes.length > MAX_PROJECT_BYTES) {
    throw error('file_too_large', 'Project limit is 256 MiB');
  }
  let total = 0;
  const archiveNames = new Set<string>();
  const archiveSizes = new Map<string, number>();
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        total += file.originalSize;
        const entryLimit =
          file.name === 'project.json'
            ? MAX_JSON_BYTES
            : file.name.startsWith('environment-resources/')
              ? ENVIRONMENT_LIMITS.maxBytes
              : MAX_IMAGE_BYTES;
        // Inspect declared sizes before fflate allocates each decompressed entry.
        if (file.originalSize > entryLimit) {
          throw error('file_too_large', 'Archive entry exceeds its supported byte limit');
        }
        if (
          total > MAX_PROJECT_BYTES + MAX_JSON_BYTES ||
          archiveNames.size > 20_000 ||
          archiveNames.has(file.name) ||
          file.name.startsWith('/') ||
          file.name.includes('..') ||
          file.name.includes('\\') ||
          file.name.endsWith('/')
        ) {
          throw error('corrupt_project', 'Unsafe archive entry');
        }
        archiveNames.add(file.name);
        archiveSizes.set(file.name, file.originalSize);
        // Decompress only the manifest until its alias expansion has also been bounded.
        return file.name === 'project.json';
      },
    });
  } catch (failure) {
    if (
      failure &&
      typeof failure === 'object' &&
      'code' in failure &&
      typeof failure.code === 'string'
    ) {
      throw failure;
    }
    throw error('corrupt_project', 'Invalid project container');
  }
  const json = files['project.json'];
  if (!json || json.length > MAX_JSON_BYTES) {
    throw error('corrupt_project', 'Missing or oversized project data');
  }
  let document: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(strFromU8(json));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw error('corrupt_project', 'Project JSON must contain an object');
    }
    document = parsed as Record<string, unknown>;
  } catch {
    throw error('corrupt_project', 'Invalid project JSON');
  }
  if (document.schemaVersion !== 1) {
    throw error('unsupported_version', 'Only project schema version 1 is supported');
  }
  if (!Array.isArray(document.resources)) {
    throw error('invalid_project', 'Missing resource list');
  }
  if (document.resources.length > 1000) {
    throw error('file_too_large', 'Too many surface resources');
  }
  if (
    document.environmentResources !== undefined &&
    (!Array.isArray(document.environmentResources) ||
      document.environmentResources.length > ENVIRONMENT_LIMITS.maxResources)
  ) {
    throw error('environment.invalid', 'Invalid environment resource list');
  }
  const manifestPaths = new Set<string>();
  let expandedTotal = 0;
  for (const entry of [
    ...document.resources,
    ...(Array.isArray(document.environmentResources) ? document.environmentResources : []),
  ]) {
    if (entry && typeof entry === 'object' && 'path' in entry && typeof entry.path === 'string') {
      manifestPaths.add(entry.path);
      expandedTotal += archiveSizes.get(entry.path) ?? 0;
      if (expandedTotal > MAX_PROJECT_BYTES) {
        throw error('file_too_large', 'Expanded project resources exceed 256 MiB');
      }
    }
  }
  try {
    Object.assign(files, unzipSync(bytes, { filter: (file) => manifestPaths.has(file.name) }));
  } catch {
    throw error('corrupt_project', 'Invalid project resource data');
  }
  const expectedFiles = new Set(['project.json']);
  const resources: Resource[] = [];
  for (const entry of document.resources as Record<string, unknown>[]) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      Object.keys(entry).some((key) => !['id', 'name', 'mime', 'path', 'sha256'].includes(key)) ||
      typeof entry.id !== 'string' ||
      typeof entry.name !== 'string' ||
      typeof entry.path !== 'string' ||
      typeof entry.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(entry.sha256) ||
      !['image/png', 'image/jpeg'].includes(String(entry.mime))
    ) {
      throw error('corrupt_project', 'Invalid resource manifest');
    }
    const extension = entry.mime === 'image/png' ? 'png' : 'jpg';
    if (entry.path !== `resources/${entry.sha256}.${extension}`) {
      throw error('corrupt_project', 'Invalid resource path');
    }
    expectedFiles.add(entry.path);
    const resourceBytes = files[entry.path];
    if (!resourceBytes) {
      throw error('missing_resource', entry.id);
    }
    if ((await digest(resourceBytes)) !== entry.sha256) {
      throw error('corrupt_project', 'Resource checksum does not match');
    }
    const mime = String(entry.mime);
    await validateImage(resourceBytes, mime);
    resources.push({ id: entry.id, name: entry.name, mime, dataUrl: dataUrl(resourceBytes, mime) });
  }
  document.resources = resources;
  if (document.environmentResources !== undefined) {
    if (
      !Array.isArray(document.environmentResources) ||
      document.environmentResources.length > ENVIRONMENT_LIMITS.maxResources
    ) {
      throw error('environment.invalid', 'Invalid environment resource list');
    }
    const environments: EnvironmentResource[] = [];
    for (const entry of document.environmentResources as Record<string, unknown>[]) {
      if (
        !entry ||
        typeof entry !== 'object' ||
        Object.keys(entry).some((key) => !['id', 'name', 'mime', 'path', 'sha256'].includes(key)) ||
        typeof entry.id !== 'string' ||
        typeof entry.name !== 'string' ||
        typeof entry.path !== 'string' ||
        typeof entry.sha256 !== 'string' ||
        !/^[0-9a-f]{64}$/.test(entry.sha256) ||
        !['image/vnd.radiance', 'image/x-exr', 'image/png', 'image/jpeg'].includes(
          String(entry.mime),
        )
      ) {
        throw error('corrupt_project', 'Invalid environment manifest');
      }
      const mime = entry.mime as EnvironmentResource['mime'];
      if (entry.path !== `environment-resources/${entry.sha256}.${environmentExtension(mime)}`) {
        throw error('corrupt_project', 'Invalid environment resource path');
      }
      expectedFiles.add(entry.path);
      const data = files[entry.path];
      if (!data) {
        throw error('missing_resource', entry.id);
      }
      if ((await digest(data)) !== entry.sha256) {
        throw error('corrupt_project', 'Environment checksum does not match');
      }
      await validateEnvironmentBytes(data, mime);
      environments.push({ id: entry.id, name: entry.name, mime, dataUrl: dataUrl(data, mime) });
    }
    document.environmentResources = environments;
  }
  if ([...archiveNames].some((path) => !expectedFiles.has(path))) {
    throw error('unknown_fields', 'Unrecognized project files');
  }
  checked(document);
  return document;
}
