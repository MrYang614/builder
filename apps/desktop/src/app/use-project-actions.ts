import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { createEmptyProject, createExampleProject, keyboardIntent } from '@building/editor-core';
import { exportGLB } from '@building/three-runtime';
import { useEditor, useDocument, useSession } from './services';
import { builtInResources } from './materials';
import { openProject, saveProject, saveGLB, registerCloseGuard } from '../platform';
import { guardProjectClose } from './project-close';
import { deletionContents } from './deletion';
import { useConfirm } from '../ui/confirm';
import { useLanguage } from '../ui/i18n';

/** Owns guarded file transitions and stable shortcut listeners independently of workspace chrome. */
export function useProjectActions({
  flushPreferences,
  settlePreferences,
}: {
  flushPreferences: () => Promise<void>;
  settlePreferences: () => Promise<void>;
}) {
  const services = useEditor(),
    doc = useDocument(),
    s = useSession(),
    { t } = useLanguage(),
    confirm = useConfirm();
  const status = useSyncExternalStore(
    services.core.subscribeStatus,
    services.core.getStatusSnapshot,
  );
  const failure = (error: unknown) => {
    services.notice.set({
      key: typeof error === 'object' && error && 'code' in error ? String(error.code) : 'fileWrite',
      error: true,
    });
  };
  const save = async (asNew = false) => {
    if (services.busy.get()) {
      return false;
    }
    services.busy.set(true);
    try {
      const captured = services.project.captureSave();
      const result = await saveProject(
        captured.snapshot,
        asNew ? undefined : services.project.getPath(),
      );
      if (!result) {
        return false;
      }
      if (!services.project.completeSave(captured.cursor, result)) {
        services.notice.set({ key: 'openChanged', error: true });
        return false;
      }
      services.notice.set({ key: 'savedMessage', error: false });
      return true;
    } catch (error) {
      failure(error);
      return false;
    } finally {
      services.busy.set(false);
    }
  };
  const guard = async () => {
    if (!services.core.isDirty()) {
      return true;
    }
    const decision = await confirm('confirmUnsaved', true);
    // An edit made during async file IO must not be discarded by New/Open/Close.
    return (
      decision === 'discard' || (decision === 'save' && (await save()) && !services.core.isDirty())
    );
  };
  const replace = async (example = false) => {
    if (services.busy.get() || !(await guard()) || services.busy.get()) {
      return;
    }
    const next = example ? createExampleProject() : createEmptyProject(t('new'));
    if (example) {
      next.resources = [...builtInResources];
      next.walls.forEach((w) => {
        w.materials.A.resourceId = 'builtin_brick';
        w.materials.B.resourceId = 'builtin_plaster';
      });
      next.slabs.forEach((b) => {
        b.materials.top.resourceId = 'builtin_wood';
      });
    }
    const result = services.project.replace(next);
    if (!result.ok) {
      failure(result.error);
      return;
    }
    services.session.set({
      currentLevelId: next.levels[0]!.id,
      selectedId: undefined,
      tool: 'select',
      wholeBuildingPreview: false,
      hiddenIds: [],
    });
    services.runtimeRef.current?.focus('all');
  };
  const open = async () => {
    if (services.busy.get() || !(await guard()) || services.busy.get()) {
      return;
    }
    services.busy.set(true);
    try {
      // File decoding yields to live edits; approval only covers this immutable snapshot.
      const approved = services.project.captureSave();
      const result = await openProject();
      if (result) {
        if (!services.project.matches(approved.cursor)) {
          services.notice.set({ key: 'openChanged', error: true });
          return;
        }
        const replaced = services.project.replace(result.doc, result.path);
        if (!replaced.ok) {
          failure(replaced.error);
          return;
        }
        services.session.set({
          currentLevelId: result.doc.levels[0]!.id,
          selectedId: undefined,
          tool: 'select',
          hiddenIds: [],
          wholeBuildingPreview: false,
        });
        services.runtimeRef.current?.focus('all');
        services.notice.set({ key: 'loadMessage', error: false });
      }
    } catch (error) {
      failure(error);
    } finally {
      services.busy.set(false);
    }
  };
  const exportModel = async () => {
    if (services.busy.get()) {
      return;
    }
    services.busy.set(true);
    try {
      const snapshot = services.runtimeRef.current?.snapshot() ?? services.core.getSnapshot();
      const bytes = await exportGLB(snapshot);
      if (await saveGLB(bytes)) {
        services.notice.set({ key: 'exported', error: false });
      }
    } catch (error) {
      failure(error);
    } finally {
      services.busy.set(false);
    }
  };
  const remove = async () => {
    const object = [...doc.walls, ...doc.slabs, ...doc.openings].find((o) => o.id === s.selectedId);
    if (
      !object ||
      (await confirm('deleteImpact', false, deletionContents(doc, object.id))) !== 'confirm'
    ) {
      return;
    }
    services.submit({
      type:
        'start' in object ? 'delete-wall' : 'polygon' in object ? 'delete-slab' : 'delete-opening',
      id: object.id,
    });
  };
  const callbacks = useRef({ save: () => save(), remove: () => void remove(), guard });
  // Stable listeners use only callbacks from the latest committed UI state.
  useLayoutEffect(() => {
    callbacks.current = { save: () => save(), remove: () => void remove(), guard };
  });
  useEffect(() => {
    const preferencesError = () => services.notice.set({ key: 'settingsFailure', error: true });
    window.addEventListener('preferences-error', preferencesError);
    return () => window.removeEventListener('preferences-error', preferencesError);
  }, [services]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) {
        return;
      }
      const target = e.target as HTMLElement;
      const text = target.matches('input,textarea,[contenteditable=true]');
      const overlay = !!document.querySelector('[role="dialog"],[role="listbox"],[role="menu"]');
      const intent = keyboardIntent(
        e.key,
        { control: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey },
        {
          modal: false,
          text,
          composing: e.isComposing,
          activeDrag: false,
        },
      );
      if (overlay) {
        // Native historyUndo can retarget a blurred input from a focused menu and commit it again.
        // Text fields retain native editing; non-text overlays own editor shortcuts and Escape.
        if (intent && intent !== 'cancel') {
          e.preventDefault();
        }
        return;
      }
      if (!intent) {
        return;
      }
      e.preventDefault();
      // The reference view sequence owns input until the camera and model have settled.
      if (services.viewTransition.get().phase !== 'idle') {
        return;
      }
      if (
        (intent === 'undo' || intent === 'redo') &&
        services.session.getSnapshot().wholeBuildingPreview
      ) {
        return;
      }
      if (intent === 'save') {
        void callbacks.current.save();
      } else if (intent === 'undo') {
        services.commands.undo();
      } else if (intent === 'redo') {
        services.commands.redo();
      } else if (intent === 'delete') {
        callbacks.current.remove();
      } else {
        services.runtimeRef.current?.cancel();
      }
    };
    window.addEventListener('keydown', handler);
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (services.core.isDirty()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    let cleanup: (() => void) | undefined;
    let active = true;
    void registerCloseGuard(
      () =>
        guardProjectClose({
          flushPreferences,
          settlePreferences,
          getSnapshot: services.core.getSnapshot,
          guard: () => callbacks.current.guard(),
          onError: () => services.notice.set({ key: 'settingsFailure', error: true }),
        }),
      () => services.notice.set({ key: 'closeGuardFailure', error: true }),
    )
      .then((fn) => {
        if (active) {
          cleanup = fn;
        } else {
          fn();
        }
      })
      .catch(() => services.notice.set({ key: 'closeGuardFailure', error: true }));
    return () => {
      active = false;
      cleanup?.();
      window.removeEventListener('keydown', handler);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [services, flushPreferences, settlePreferences]);
  return { save, replace, open, exportModel, status };
}
