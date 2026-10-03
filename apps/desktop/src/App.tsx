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
  Focus,
  Move,
  Rotate3d,
  SaveAll,
  Blocks,
} from 'lucide-react';
import {
  Button,
  IconButton,
  Input,
  Field,
  FieldGroup,
  FieldLabel,
  ToggleGroup,
  ToggleGroupItem,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  createId,
  keyboardIntent,
  type Tool,
  type Command,
} from '@building/editor-core';
import { exportGLB } from '@building/three-runtime';
import { ViewportHost } from './integration/ViewportHost';
import { useEditor, useDocument, useSession, useSignal } from './app/services';
import { builtInResources } from './app/materials';
import { openProject, saveProject, saveGLB, registerCloseGuard } from './platform';
import { deletionContents } from './app/deletion';
import { guardPreferenceClose } from './app/preferences';
import { Inspector } from './ui/Inspector';
import { RenderingSettings } from './ui/RenderingSettings';
import { HeaderPreferences } from './ui/HeaderPreferences';
import { HeaderWindow } from './ui/WindowControls';
import { Choice, Numeric } from './ui/fields';
import { useConfirm } from './ui/confirm';
import { useLanguage } from './ui/i18n';
import './editor.css';

function Floors() {
  const { core, session, submit } = useEditor(),
    doc = useDocument(),
    s = useSession(),
    { t } = useLanguage(),
    confirm = useConfirm();
  const level = doc.levels.find((l) => l.id === s.currentLevelId)!;
  const add = () => {
    const last = [...doc.levels].sort((a, b) => a.elevation - b.elevation).at(-1)!;
    const id = createId('level');
    if (
      submit({
        type: 'add-level',
        level: {
          id,
          name: String(doc.levels.length + 1),
          elevation: last.elevation + last.height,
          height: 3,
        },
      })
    ) {
      session.set({ currentLevelId: id, selectedId: undefined, selectedSurface: undefined });
    }
  };
  const remove = async () => {
    if ((await confirm('deleteImpact', false, deletionContents(doc, level.id))) === 'confirm') {
      submit({ type: 'delete-level', id: level.id });
    }
  };
  const objects = [...doc.walls, ...doc.slabs, ...doc.openings].filter(
    (o) => o.levelId === s.currentLevelId,
  );
  return (
    <aside className="floors" aria-label={t('levels')}>
      <div className="panel-heading">
        <h2>{t('levels')}</h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t('addLevel')}
              onClick={add}
              disabled={s.wholeBuildingPreview}
            >
              <Plus />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('addLevel')}</TooltipContent>
        </Tooltip>
      </div>
      <div className="floor-list">
        {doc.levels.map((l) => (
          <Button
            key={l.id}
            variant={l.id === level.id ? 'secondary' : 'ghost'}
            className="floor-item"
            onClick={() => {
              session.set({
                currentLevelId: l.id,
                selectedId: undefined,
                selectedSurface: undefined,
              });
            }}
          >
            <span>{l.name}</span>
            <span className="muted">{l.elevation.toFixed(2)} m</span>
          </Button>
        ))}
      </div>
      <section className="level-fields" key={level.id}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="level-name">{t('name')}</FieldLabel>
            <Input
              id="level-name"
              defaultValue={level.name}
              onBlur={(e) => {
                if (e.target.value !== level.name) {
                  submit({ type: 'update-level', id: level.id, patch: { name: e.target.value } });
                }
              }}
            />
          </Field>
          <Numeric
            label={t('levelElevation')}
            value={level.elevation}
            onCommit={(v) =>
              submit({ type: 'update-level', id: level.id, patch: { elevation: v } })
            }
          />
          <Numeric
            label={t('levelHeight')}
            value={level.height}
            onCommit={asyncLevelHeight(submit, level.id)}
          />
          <p className="muted">{t('levelShift')}</p>
          <Button
            variant="outline"
            disabled={doc.levels.length === 1 || s.wholeBuildingPreview}
            onClick={() => void remove()}
          >
            {t('deleteLevel')}
          </Button>
        </FieldGroup>
      </section>
      <section className="object-list">
        <h3>{t('objects')}</h3>
        <p className="muted">{t('objectCount', { count: objects.length })}</p>
        {objects.map((o, i) => (
          <Button
            key={o.id}
            size="sm"
            variant={s.selectedId === o.id ? 'secondary' : 'ghost'}
            className="object-item"
            onClick={() => session.set({ selectedId: o.id, selectedSurface: undefined })}
          >
            {t(
              'start' in o
                ? 'wall'
                : 'polygon' in o
                  ? o.purpose === 'roof'
                    ? 'roof'
                    : 'slab'
                  : o.kind,
            )}{' '}
            {i + 1}
          </Button>
        ))}
      </section>
      <span className="muted floor-version">
        {core.getSnapshot().schemaVersion === 1 ? t('schema') : ''}
      </span>
    </aside>
  );
}
function asyncLevelHeight(submit: (c: Command) => boolean, id: string) {
  return (height: number) =>
    submit({ type: 'update-level', id, patch: { height }, moveAbove: true });
}
function ToolOptions() {
  const { session, camera, runtimeRef } = useEditor(),
    s = useSession(),
    doc = useDocument(),
    { t } = useLanguage(),
    mode = useSignal(camera);
  const level = doc.levels.find((l) => l.id === s.currentLevelId)!;
  return (
    <div className="viewport-toolbar">
      <div className="camera-tools">
        <Button
          size="sm"
          variant="outline"
          onClick={() => runtimeRef.current?.focus('selected')}
          disabled={!s.selectedId}
        >
          <Focus data-icon="inline-start" />
          {t('focus')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => runtimeRef.current?.focus('level')}>
          {t('current')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => runtimeRef.current?.focus('all')}>
          {t('all')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => runtimeRef.current?.focus('top')}>
          {t('topView')}
        </Button>
      </div>
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(v) => {
          if (v) {
            camera.set(v as typeof mode);
          }
        }}
        aria-label={t('edit')}
        size="sm"
        variant="outline"
      >
        <ToggleGroupItem value="edit">{t('edit')}</ToggleGroupItem>
        <ToggleGroupItem value="rotate">
          <Rotate3d />
          {t('rotate')}
        </ToggleGroupItem>
        <ToggleGroupItem value="pan">
          <Move />
          {t('pan')}
        </ToggleGroupItem>
      </ToggleGroup>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={s.wholeBuildingPreview}
          onChange={(e) => session.set({ wholeBuildingPreview: e.target.checked })}
        />
        {t('preview')}
      </label>
      {s.tool === 'slab' && (
        <div className="slab-options">
          <Choice
            label={t('purpose')}
            value={s.slabPurpose}
            options={['floor', 'roof'].map((value) => ({ value, label: t(value) }))}
            onChange={(v) => session.set({ slabPurpose: v as 'floor' | 'roof' })}
          />
          {s.slabPurpose === 'roof' && (
            <Numeric
              label={t('roofHeight')}
              value={s.roofElevation ?? level.elevation + level.height}
              onCommit={(v) => {
                session.set({ roofElevation: v });
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLanguage();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="settings-dialog" showCloseButton={false}>
        <DialogTitle>{t('settings')}</DialogTitle>
        <DialogDescription>{t('render.settingsDescription')}</DialogDescription>
        <RenderingSettings />
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{t('close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function App({ flushPreferences }: { flushPreferences: () => Promise<void> }) {
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
    const snapshot = services.runtimeRef.current?.snapshot() ?? services.core.getSnapshot();
    try {
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
    if (busy || !(await guard())) {
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
    if (busy || !(await guard())) {
      return;
    }
    services.busy.set(true);
    try {
      const result = await openProject();
      if (result) {
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
    if (busy) {
      return;
    }
    services.busy.set(true);
    const snapshot = services.runtimeRef.current?.snapshot() ?? services.core.getSnapshot();
    try {
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
    void registerCloseGuard(() =>
      guardPreferenceClose(
        flushPreferences,
        () => callbacks.current.guard(),
        () => services.notice.set({ key: 'settingsFailure', error: true }),
      ),
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
  }, [services, flushPreferences]);
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
          {notice.error && (
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
