import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  MousePointer2,
  BrickWall,
  Square,
  DoorOpen,
  RectangleHorizontal,
  Paintbrush,
  Save,
  FolderOpen,
  Undo2,
  Redo2,
  Download,
  Plus,
  Settings,
  SaveAll,
  Blocks,
} from 'lucide-react';
import {
  Button,
  IconButton,
  ToggleGroup,
  ToggleGroupItem,
  Alert,
  AlertTitle,
  AlertDescription,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@building/ui';
import {
  createEmptyProject,
  createExampleProject,
  keyboardIntent,
  type Tool,
} from '@building/editor-core';
import { exportGLB } from '@building/three-runtime';
import { ViewportHost } from './integration/ViewportHost';
import { useEditor, useDocument, useSession, useSignal } from './app/services';
import { builtInResources } from './app/materials';
import { openProject, saveProject, saveGLB, registerCloseGuard } from './platform';
import { guardProjectClose } from './app/project-close';
import { deletionContents } from './app/deletion';
import { Inspector } from './ui/Inspector';
import { Floors } from './ui/Floors';
import { SettingsDialog } from './ui/SettingsDialog';
import { ToolOptions } from './ui/ToolOptions';
import { HeaderPreferences } from './ui/HeaderPreferences';
import { HeaderWindow } from './ui/WindowControls';
import { useConfirm } from './ui/confirm';
import { useLanguage } from './ui/i18n';
import './editor.css';

export default function App({
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
  const notice = useSignal(services.notice),
    busy = useSignal(services.busy),
    [settingsOpen, setSettingsOpen] = useState(false),
    [path, setPath] = useState<string | undefined>();
  const status = useStatus();
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
      const snapshot = services.runtimeRef.current?.snapshot() ?? services.core.getSnapshot();
      const result = await saveProject(snapshot, asNew ? undefined : path);
      if (!result) {
        return false;
      }
      if (services.core.getSnapshot().id === snapshot.id) {
        setPath(result);
        services.core.markSaved(snapshot.revision);
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
    const result = services.core.replace(next);
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
    setPath(undefined);
    services.runtimeRef.current?.focus('all');
  };
  const open = async () => {
    if (services.busy.get() || !(await guard()) || services.busy.get()) {
      return;
    }
    services.busy.set(true);
    try {
      // File decoding yields to live edits; approval only covers this immutable snapshot.
      const approved = services.core.getSnapshot();
      const result = await openProject();
      if (result) {
        if (services.core.getSnapshot() !== approved) {
          services.notice.set({ key: 'openChanged', error: true });
          return;
        }
        const replaced = services.core.replace(result.doc);
        if (!replaced.ok) {
          failure(replaced.error);
          return;
        }
        setPath(result.path);
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
      const intent = keyboardIntent(
        e.key,
        { control: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey },
        {
          modal: !!document.querySelector('[role="dialog"],[role="listbox"]'),
          text,
          composing: e.isComposing,
          activeDrag: false,
        },
      );
      if (!intent) {
        return;
      }
      e.preventDefault();
      if (intent === 'save') {
        void callbacks.current.save();
      } else if (intent === 'undo') {
        services.core.undo();
      } else if (intent === 'redo') {
        services.core.redo();
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
  const tools: [Tool, typeof MousePointer2][] = [
    ['select', MousePointer2],
    ['wall', BrickWall],
    ['slab', Square],
    ['door', DoorOpen],
    ['window', RectangleHorizontal],
    ['material', Paintbrush],
  ];
  return (
    <main className="editor">
      <HeaderWindow
        actions={
          <div className="header-actions">
            <IconButton label={t('export')} disabled={busy} onClick={() => void exportModel()}>
              <Download aria-hidden="true" />
            </IconButton>
            <HeaderPreferences />
            <IconButton label={t('settings')} onClick={() => setSettingsOpen(true)}>
              <Settings aria-hidden="true" />
            </IconButton>
          </div>
        }
      >
        <div className="header-project-actions">
          <fieldset className="file-actions" aria-label={t('projectActions')}>
            <IconButton label={t('new')} disabled={busy} onClick={() => void replace()}>
              <Plus aria-hidden="true" />
            </IconButton>
            <IconButton label={t('open')} disabled={busy} onClick={() => void open()}>
              <FolderOpen aria-hidden="true" />
            </IconButton>
            <IconButton
              label={t('save')}
              variant="outline"
              disabled={busy}
              onClick={() => void save()}
            >
              <Save aria-hidden="true" />
            </IconButton>
            <IconButton label={t('saveAs')} disabled={busy} onClick={() => void save(true)}>
              <SaveAll aria-hidden="true" />
            </IconButton>
            <IconButton
              label={t('undo')}
              disabled={!status.canUndo}
              onClick={() => services.core.undo()}
            >
              <Undo2 aria-hidden="true" />
            </IconButton>
            <IconButton
              label={t('redo')}
              disabled={!status.canRedo}
              onClick={() => services.core.redo()}
            >
              <Redo2 aria-hidden="true" />
            </IconButton>
          </fieldset>
          <span className={status.isDirty ? 'dirty-state' : 'muted'} data-testid="dirty-state">
            {t(status.isDirty ? 'unsaved' : 'saved')}
          </span>
        </div>
        <div className="project-label">
          <span className="project-name">{doc.name}</span>
        </div>
      </HeaderWindow>
      <nav className="tools-bar" aria-label={t('select')}>
        <ToggleGroup
          type="single"
          value={s.tool}
          size="sm"
          variant="outline"
          onValueChange={(v) => {
            if (v) {
              services.session.set({ tool: v as Tool });
              services.notice.set({
                key:
                  v === 'select'
                    ? 'hintSelect'
                    : v === 'material'
                      ? 'hintMaterial'
                      : v === 'door' || v === 'window'
                        ? 'hintPlace'
                        : 'hintStart',
                error: false,
              });
            }
          }}
        >
          {tools.map(([tool, Icon]) => (
            <Tooltip key={tool}>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <ToggleGroupItem
                    value={tool}
                    aria-label={t(tool)}
                    disabled={s.wholeBuildingPreview}
                  >
                    <Icon aria-hidden="true" />
                  </ToggleGroupItem>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                {t(tool)}
              </TooltipContent>
            </Tooltip>
          ))}
        </ToggleGroup>
        <IconButton label={t('example')} disabled={busy} onClick={() => void replace(true)}>
          <Blocks aria-hidden="true" />
        </IconButton>
        <span className="muted boundary-hint">{t('boundary')}</span>
      </nav>
      <div className="work-area">
        <Floors />
        <section className="viewport-region">
          <ToolOptions />
          <ViewportHost />
          {notice.error && !settingsOpen && (
            <div className="error-notice">
              <Alert variant="destructive">
                <AlertTitle>{t('error')}</AlertTitle>
                <AlertDescription>
                  {t(notice.key, notice.params)}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => services.notice.set({ key: 'hintSelect', error: false })}
                  >
                    {t('dismiss')}
                  </Button>
                </AlertDescription>
              </Alert>
            </div>
          )}
        </section>
        <Inspector />
      </div>
      <output className="status-bar">
        <span>{busy ? t('busy') : t(notice.key, notice.params)}</span>
        <span>
          {doc.levels.find((l) => l.id === s.currentLevelId)?.name} / {t('meters')}
        </span>
      </output>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </main>
  );
}
function useStatus() {
  const { core } = useEditor();
  return useSyncExternalStore(core.subscribeStatus, core.getStatusSnapshot);
}
