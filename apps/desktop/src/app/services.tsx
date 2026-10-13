import { createContext, use, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  EditorCore,
  SessionStore,
  createEmptyProject,
  type Command,
  type SurfaceRole,
} from '@building/editor-core';
import {
  initialRenderState,
  type ThreeRuntime,
  type RuntimeSession,
  type RendererBackend,
} from '@building/three-runtime';
import { translate } from '../ui/i18n';
type Notice = { key: string; params?: Record<string, string | number>; error: boolean };
export class Signal<T> {
  private listeners = new Set<() => void>();
  constructor(private value: T) {}
  get = () => this.value;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  /** Publishes to a fixed subscriber scope even when a callback changes subscriptions. */
  set(v: T) {
    this.value = v;
    // oxlint-disable-next-line unicorn/no-useless-spread -- Subscription callbacks may add or remove listeners during dispatch.
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
export function makeServices(initialError?: string) {
  const core = new EditorCore(
    createEmptyProject(
      translate(localStorage.getItem('building-language') === 'en' ? 'en' : 'zh-CN', 'untitled'),
    ),
  );
  const session = new SessionStore(core.getSnapshot().levels[0]!.id);
  const notice = new Signal<Notice>({ key: initialError ?? 'hintSelect', error: !!initialError });
  const snapFeedback = new Signal('');
  const editHint = new Signal('hintSelect');
  const busy = new Signal(false);
  const renderState = new Signal(initialRenderState());
  const rendererPreference = new Signal<RendererBackend>(
    localStorage.getItem('building-renderer') === 'webgpu' ? 'webgpu' : 'webgl',
  );
  let runtime: ThreeRuntime | null = null;
  const runtimeRef = {
    get current() {
      return runtime;
    },
  };
  const attachRuntime = (next: ThreeRuntime) => {
    runtime = next;
    return () => {
      if (runtime === next) {
        runtime = null;
      }
    };
  };
  const camera = new Signal<RuntimeSession['cameraMode']>('edit');
  // Registered before viewport listeners: undo, replace and level deletion also reconcile session IDs.
  core.subscribe(() => session.reconcile(core.getSnapshot()));
  const submit = (command: Command) => {
    if (
      session.getSnapshot().wholeBuildingPreview &&
      !(command.type === 'update-opening' && Object.keys(command.patch).every((k) => k === 'angle'))
    ) {
      notice.set({ key: 'previewError', error: true });
      return false;
    }
    const result = core.execute(command);
    if (!result.ok) {
      notice.set({
        key: result.error.code,
        params: result.error.params
          ? Object.fromEntries(
              Object.entries(result.error.params).map(([k, v]) => [
                k,
                Array.isArray(v) ? v.join(', ') : v,
              ]),
            )
          : undefined,
        error: true,
      });
      return false;
    }
    session.reconcile(core.getSnapshot());
    // A successful correction supersedes the previous command error without losing the tool stage.
    if (notice.get().error) {
      notice.set({ key: editHint.get(), error: false });
    }
    if (result.warnings?.length) {
      notice.set({
        key: result.warnings[0]!.code,
        params: result.warnings[0]!.params
          ? Object.fromEntries(
              Object.entries(result.warnings[0]!.params!).map(([k, v]) => [
                k,
                Array.isArray(v) ? v.join(', ') : v,
              ]),
            )
          : undefined,
        error: false,
      });
    }
    return true;
  };
  const runtimeSession = (): RuntimeSession => {
    const s = session.getSnapshot(),
      doc = core.getSnapshot(),
      level = doc.levels.find((l) => l.id === s.currentLevelId)!;
    return {
      levelId: s.currentLevelId,
      tool: s.tool,
      selectedId: s.selectedId ?? null,
      surface:
        s.selectedSurface ?? (doc.slabs.some((slab) => slab.id === s.selectedId) ? 'top' : 'A'),
      wholeBuilding: s.wholeBuildingPreview,
      hiddenIds: s.hiddenIds,
      slabPurpose: s.slabPurpose,
      roofElevation: s.roofElevation ?? level.elevation + level.height,
      snap: s.snap,
      cameraMode: camera.get(),
    };
  };
  return {
    core,
    session,
    notice,
    snapFeedback,
    editHint,
    busy,
    renderState,
    rendererPreference,
    runtimeRef,
    attachRuntime,
    camera,
    submit,
    runtimeSession,
    select: (id: string | null, surface?: string) =>
      session.set({
        selectedId: id ?? undefined,
        selectedSurface: surface as SurfaceRole | undefined,
      }),
  };
}
export type Services = ReturnType<typeof makeServices>;
const Context = createContext<Services | null>(null);
export function EditorProvider({
  children,
  initialError,
}: {
  children: ReactNode;
  initialError?: string;
}) {
  const [services] = useState(() => makeServices(initialError));
  return <Context value={services}>{children}</Context>;
}
export function useEditor() {
  const s = use(Context);
  if (!s) {
    throw new Error('EditorProvider required');
  }
  return s;
}
export function useDocument() {
  const { core } = useEditor();
  return useSyncExternalStore(core.subscribe, core.getSnapshot);
}
export function useSession() {
  const { session } = useEditor();
  return useSyncExternalStore(session.subscribe, session.getSnapshot);
}
export function useSignal<T>(signal: Signal<T>) {
  return useSyncExternalStore(signal.subscribe, signal.get);
}
