import { invoke, isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  validateDocument,
  type EnvironmentResource,
  type ProjectDocument,
  type Resource,
} from '@building/editor-core';
import {
  browserResource,
  browserEnvironmentResource,
  validateEnvironmentBytes,
  decodeProjectContainer,
  encodeProjectContainer,
} from './container';
export { decodeProjectContainer, encodeProjectContainer } from './container';
export type { PlatformError } from './container';

export type ThemeMode = 'light' | 'dark';
export type Language = 'zh-CN' | 'en';
export interface AppSettings {
  themeMode: ThemeMode;
  language: Language;
  rendererBackend: 'webgl' | 'webgpu';
}
export const SETTINGS_CACHE_KEY = 'building-editor.settings.v1';
export const isDesktop = (): boolean => isTauri();
const defaultSettings: AppSettings = {
  themeMode: 'dark',
  language: 'zh-CN',
  rendererBackend: 'webgl',
};
function normalizeSettings(value: unknown): AppSettings {
  const input = (value && typeof value === 'object' ? value : {}) as Partial<AppSettings>;
  return {
    themeMode: input.themeMode === 'light' || input.themeMode === 'dark' ? input.themeMode : 'dark',
    language: input.language === 'en' ? 'en' : 'zh-CN',
    rendererBackend: input.rendererBackend === 'webgpu' ? 'webgpu' : 'webgl',
  };
}
function assertDocument(document: unknown): asserts document is ProjectDocument {
  const result = validateDocument(document);
  if (!result.ok) {
    throw result.error;
  }
}
function extension(path: string, suffix: string): string {
  return path.toLowerCase().endsWith(`.${suffix}`) ? path : `${path}.${suffix}`;
}
function safeName(name: string): string {
  // oxlint-disable-next-line eslint/no-control-regex -- Windows filenames must replace ASCII control characters as well as reserved punctuation.
  return (name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'Building').slice(0, 120);
}
function download(bytes: ArrayBuffer | Uint8Array, name: string, mime: string): void {
  const data = bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes).buffer;
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // The browser must finish consuming the Blob before its object URL is released.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function chooseFile(accept: string, testId: string): Promise<File | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.hidden = true;
    input.dataset.testid = testId;
    const clean = () => input.remove();
    input.addEventListener(
      'change',
      () => {
        const file = input.files?.[0] ?? null;
        clean();
        resolve(file);
      },
      { once: true },
    );
    input.addEventListener(
      'cancel',
      () => {
        clean();
        resolve(null);
      },
      { once: true },
    );
    document.body.append(input);
    try {
      input.click();
    } catch (error) {
      clean();
      reject(error);
    }
  });
}

/** Validates a chosen portable file before handing its detached document to EditorCore. */
export async function openProject(): Promise<{ doc: ProjectDocument; path: string } | null> {
  if (isDesktop()) {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Building Editor', extensions: ['building'] }],
    });
    if (!path || Array.isArray(path)) {
      return null;
    }
    const bytes = await invoke<ArrayBuffer>('open_project', { path });
    const doc = await decodeProjectContainer(new Uint8Array(bytes));
    assertDocument(doc);
    return { doc, path };
  }
  const file = await chooseFile('.building', 'project-file-input');
  if (!file) {
    return null;
  }
  return {
    doc: await decodeProjectContainer(new Uint8Array(await file.arrayBuffer())),
    path: file.name,
  };
}

/** Opens a known path for automation without presenting a native file dialog. */
export async function openProjectAtPath(
  path: string,
): Promise<{ doc: ProjectDocument; path: string }> {
  if (!isDesktop()) {
    throw {
      code: 'capability.unsupported',
      details: 'Path-based project IO requires the desktop host',
    };
  }
  const bytes = await invoke<ArrayBuffer>('open_project', { path });
  const doc = await decodeProjectContainer(new Uint8Array(bytes));
  assertDocument(doc);
  return { doc, path };
}

/** Captures the revision before dialogs or IO so concurrent edits cannot alter this save. */
export async function saveProject(
  document: ProjectDocument,
  currentPath?: string,
): Promise<string | null> {
  // A versioned snapshot is detached before any asynchronous dialog/IO begins.
  const snapshot = structuredClone(document);
  assertDocument(snapshot);
  if (isDesktop()) {
    const chosen =
      currentPath ??
      (await save({
        defaultPath: `${safeName(snapshot.name)}.building`,
        filters: [{ name: 'Building Editor', extensions: ['building'] }],
      }));
    if (!chosen) {
      return null;
    }
    const path = extension(chosen, 'building');
    const bytes = await encodeProjectContainer(snapshot);
    await invoke<void>('save_project', bytes, {
      headers: { 'X-File-Path': encodeURIComponent(path) },
    });
    return path;
  }
  const name = `${safeName(snapshot.name)}.building`;
  download(await encodeProjectContainer(snapshot), name, 'application/zip');
  return name;
}

/** Saves a detached snapshot to an explicit automation path through native atomic IO. */
export async function saveProjectAtPath(
  document: ProjectDocument,
  requestedPath: string,
): Promise<string> {
  if (!isDesktop()) {
    throw {
      code: 'capability.unsupported',
      details: 'Path-based project IO requires the desktop host',
    };
  }
  const snapshot = structuredClone(document);
  assertDocument(snapshot);
  const path = extension(requestedPath, 'building');
  const bytes = await encodeProjectContainer(snapshot);
  await invoke<void>('save_project', bytes, {
    headers: { 'X-File-Path': encodeURIComponent(path) },
  });
  return path;
}
/** Saves an independently built model through native atomic IO or a browser download. */
export async function saveGLB(buffer: ArrayBuffer): Promise<string | null> {
  if (isDesktop()) {
    const chosen = await save({
      defaultPath: 'Building.glb',
      filters: [{ name: 'glTF 2.0', extensions: ['glb'] }],
    });
    if (!chosen) {
      return null;
    }
    const path = extension(chosen, 'glb');
    await invoke<void>('save_glb', new Uint8Array(buffer), {
      headers: { 'X-File-Path': encodeURIComponent(path) },
    });
    return path;
  }
  download(buffer, 'Building.glb', 'model/gltf-binary');
  return 'Building.glb';
}
/** Decodes the render export before showing a destination dialog or starting a download. */
export async function savePNG(buffer: ArrayBuffer): Promise<string | null> {
  const bytes = new Uint8Array(buffer);
  if ((await validateEnvironmentBytes(bytes)).mime !== 'image/png') {
    throw { code: 'invalid_png', details: 'Render export requires PNG bytes' };
  }
  if (isDesktop()) {
    const chosen = await save({
      defaultPath: 'Building.png',
      filters: [{ name: 'PNG', extensions: ['png'] }],
    });
    if (!chosen) {
      return null;
    }
    const path = extension(chosen, 'png');
    await invoke<void>('save_render_png', bytes, {
      headers: { 'X-File-Path': encodeURIComponent(path) },
    });
    return path;
  }
  download(buffer, 'Building.png', 'image/png');
  return 'Building.png';
}
/** Imports embedded panorama bytes; formal environment settings remain owned by EditorCore. */
export async function importEnvironment(): Promise<EnvironmentResource | null> {
  if (isDesktop()) {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Environment panorama', extensions: ['hdr', 'exr', 'png', 'jpg', 'jpeg'] }],
    });
    if (!path || Array.isArray(path)) {
      return null;
    }
    const bytes = await invoke<ArrayBuffer>('import_environment', { path });
    return browserEnvironmentResource(
      new File([bytes], path.split(/[\\/]/).pop() ?? 'Environment'),
    );
  }
  const file = await chooseFile('.hdr,.exr,image/png,image/jpeg', 'environment-file-input');
  return file ? browserEnvironmentResource(file) : null;
}
/** Validates dropped panoramas with the browser decoder and, on desktop, the native boundary. */
export async function importEnvironmentFile(file: File): Promise<EnvironmentResource> {
  const resource = await browserEnvironmentResource(file);
  if (isDesktop()) {
    await invoke<void>('import_environment_bytes', new Uint8Array(await file.arrayBuffer()), {
      headers: { 'X-File-Name': encodeURIComponent(file.name) },
    });
  }
  return resource;
}
/** Imports a self-contained PNG/JPEG without retaining a dependency on its original file. */
export async function importImage(): Promise<Resource | null> {
  if (isDesktop()) {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'PNG / JPEG', extensions: ['png', 'jpg', 'jpeg'] }],
    });
    if (!path || Array.isArray(path)) {
      return null;
    }
    const bytes = await invoke<ArrayBuffer>('import_image', { path });
    return browserResource(new File([bytes], path.split(/[\\/]/).pop() ?? 'Image'));
  }
  const file = await chooseFile('image/png,image/jpeg', 'image-file-input');
  return file ? browserResource(file) : null;
}
/** Infers and decodes surface bytes before requesting native metadata for a dropped file. */
export async function importImageFile(file: File): Promise<Resource> {
  // A dropped file may omit its MIME; use the same decoded resource in both host adapters.
  const resource = await browserResource(file);
  if (!isDesktop()) {
    return resource;
  }
  const metadata = await invoke<Omit<Resource, 'dataUrl'>>(
    'import_image_bytes',
    new Uint8Array(await file.arrayBuffer()),
    {
      headers: {
        'X-File-Name': encodeURIComponent(file.name),
        'X-File-Mime': encodeURIComponent(resource.mime),
      },
    },
  );
  return { ...resource, ...metadata };
}
/** Normalizes legacy local preferences, preferring the native file in the desktop host. */
export async function loadSettings(): Promise<AppSettings> {
  if (isDesktop()) {
    return normalizeSettings(await invoke<unknown>('load_settings'));
  }
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_CACHE_KEY) ?? 'null'));
  } catch {
    return { ...defaultSettings };
  }
}
/** Persists local preferences; the native file is authoritative and its cache is optional. */
export async function saveSettings(settings: AppSettings): Promise<void> {
  const normalized = normalizeSettings(settings);
  if (isDesktop()) {
    await invoke<void>('save_settings', { settings: normalized });
    // The native file is authoritative; an unavailable startup cache must not block close.
    try {
      localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(normalized));
    } catch {
      // loadSettings restores the native preferences on the next desktop startup.
    }
    return;
  }
  localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(normalized));
}

/** Owns one native close listener; guard/destroy failures keep the window open and reach onError. */
export async function registerCloseGuard(
  guard: () => Promise<boolean>,
  onError: (error: unknown) => void = (error) => console.error(error),
): Promise<() => void> {
  if (!isDesktop()) {
    return () => {};
  }
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const window = getCurrentWindow();
  let pending = false;
  let active = true;
  const unlisten = await window.onCloseRequested(async (event) => {
    if (!active) {
      return;
    }
    event.preventDefault();
    if (pending) {
      return;
    }
    pending = true;
    try {
      if ((await guard()) && active) {
        await window.destroy();
      }
    } catch (error) {
      if (active) {
        try {
          onError(error);
        } catch {
          // Tauri does not await event callbacks; notification failures cannot escape as rejections.
        }
      }
    } finally {
      pending = false;
    }
  });
  return () => {
    if (active) {
      active = false;
      unlisten();
    }
  };
}

export { createWindowControls } from './window';
export type { WindowControls } from './window';
