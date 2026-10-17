import { useState } from 'react';
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
  PanelLeft,
  PanelRight,
  Menu,
} from 'lucide-react';
import { Button, ToggleGroup, Alert, DropdownMenu } from '@building/ui';
import type { Tool } from '@building/editor-core';
import { ViewportHost } from './integration/ViewportHost';
import { useEditor, useDocument, useSession, useSignal } from './app/services';
import { useProjectActions } from './app/use-project-actions';
import { Inspector } from './ui/Inspector';
import { Floors } from './ui/Floors';
import { SettingsDialog } from './ui/SettingsDialog';
import { ToolOptions } from './ui/ToolOptions';
import { HeaderPreferences } from './ui/HeaderPreferences';
import { HeaderWindow } from './ui/WindowControls';
import { WorkspacePanels } from './ui/WorkspacePanels';
import { useLanguage } from './ui/i18n';
import './editor.css';

/** Workspace chrome owns only presentation state; the mounted viewport owns its runtime. */
export default function App(preferences: {
  flushPreferences: () => Promise<void>;
  settlePreferences: () => Promise<void>;
}) {
  const services = useEditor(),
    doc = useDocument(),
    s = useSession(),
    { t } = useLanguage();
  const { save, replace, open, exportModel, status } = useProjectActions(preferences);
  const notice = useSignal(services.notice),
    busy = useSignal(services.busy);
  const snapFeedback = useSignal(services.snapFeedback),
    editHint = useSignal(services.editHint);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [renderOpen, setRenderOpen] = useState(false);
  const [sceneOpen, setSceneOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
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
            <Button.Icon
              size="md"
              label={t('export')}
              icon={Download}
              disabled={busy}
              onClick={() => void exportModel()}
            />
            <HeaderPreferences />
            <Button.Icon
              label={t('settings')}
              icon={Settings}
              size="md"
              onClick={() => setSettingsOpen(true)}
            />
          </div>
        }
      >
        <div className="header-project-actions">
          <DropdownMenu
            trigger={<Button.Icon label={t('projectActions')} icon={Menu} />}
            items={[
              {
                id: 'new',
                label: t('new'),
                icon: Plus,
                disabled: busy,
                onSelect: () => void replace(),
              },
              {
                id: 'open',
                label: t('open'),
                icon: FolderOpen,
                disabled: busy,
                onSelect: () => void open(),
              },
              { type: 'separator', id: 'files' },
              {
                id: 'save',
                label: t('save'),
                icon: Save,
                shortcut: 'Ctrl/⌘ S',
                disabled: busy,
                onSelect: () => void save(),
              },
              {
                id: 'saveAs',
                label: t('saveAs'),
                icon: SaveAll,
                disabled: busy,
                onSelect: () => void save(true),
              },
              { type: 'separator', id: 'output' },
              {
                id: 'export',
                label: t('export'),
                icon: Download,
                disabled: busy,
                onSelect: () => void exportModel(),
              },
            ]}
          />
          <fieldset className="file-actions" aria-label={t('projectActions')}>
            <Button.Icon
              size="md"
              label={t('new')}
              icon={Plus}
              disabled={busy}
              onClick={() => void replace()}
            />
            <Button.Icon
              size="md"
              label={t('open')}
              icon={FolderOpen}
              disabled={busy}
              onClick={() => void open()}
            />
            <Button.Icon
              size="md"
              label={t('save')}
              tooltip={t('save') + ' (Ctrl/⌘ S)'}
              icon={Save}
              disabled={busy}
              onClick={() => void save()}
            />
            <Button.Icon
              size="md"
              label={t('saveAs')}
              icon={SaveAll}
              disabled={busy}
              onClick={() => void save(true)}
            />
            <span className="toolbar-divider" />
            <Button.Icon
              size="md"
              label={t('undo')}
              tooltip={t('undo') + ' (Ctrl/⌘ Z)'}
              icon={Undo2}
              disabled={s.wholeBuildingPreview || !status.canUndo}
              onClick={() => services.commands.undo()}
            />
            <Button.Icon
              size="md"
              label={t('redo')}
              tooltip={t('redo') + ' (Ctrl/⌘ Shift Z)'}
              icon={Redo2}
              disabled={s.wholeBuildingPreview || !status.canRedo}
              onClick={() => services.commands.redo()}
            />
          </fieldset>
          <span className={status.isDirty ? 'dirty-state' : 'muted'} data-testid="dirty-state">
            {t(status.isDirty ? 'unsaved' : 'saved')}
          </span>
        </div>
        <div className="project-label">
          <span className="project-name">{doc.name}</span>
        </div>
      </HeaderWindow>
      <div className="workspace-controls">
        <Button
          size="sm"
          variant="ghost"
          icon={PanelLeft}
          aria-pressed={sceneOpen}
          aria-controls="scene-panel"
          onClick={() => setSceneOpen(!sceneOpen)}
        >
          {t('workspace.scene')}
        </Button>
        <span className="active-tool-name">{t(s.tool)}</span>
        <span className="muted boundary-hint">{t('boundary')}</span>
        <Button
          size="sm"
          variant="ghost"
          icon={PanelRight}
          aria-pressed={inspectorOpen}
          aria-controls="inspector-panel"
          onClick={() => setInspectorOpen(!inspectorOpen)}
        >
          {t('properties')}
        </Button>
      </div>
      <div className="workspace-body">
        <nav className="tools-bar" aria-label={t('select')}>
          <ToggleGroup
            label={t('select')}
            value={s.tool}
            size="sm"
            orientation="vertical"
            iconOnly
            tooltip
            options={tools.map(([tool, icon]) => ({
              value: tool,
              label: t(tool),
              icon,
              disabled: s.wholeBuildingPreview,
            }))}
            onValueChange={(value) => {
              if (!value) {
                return;
              }
              services.session.set({ tool: value as Tool });
              const key =
                value === 'select'
                  ? 'hintSelect'
                  : value === 'material'
                    ? 'hintMaterial'
                    : value === 'door' || value === 'window'
                      ? 'hintPlace'
                      : 'hintStart';
              services.notice.set({ key, error: false });
              services.editHint.set(key);
            }}
          />
          <div className="starter-action">
            <Button.Icon
              label={t('example')}
              icon={Blocks}
              disabled={busy}
              onClick={() => void replace(true)}
            />
          </div>
        </nav>
        <WorkspacePanels
          sceneOpen={sceneOpen}
          inspectorOpen={inspectorOpen}
          scene={<Floors />}
          inspector={<Inspector />}
        >
          <section className="viewport-region">
            <ToolOptions renderOpen={renderOpen} onRenderOpenChange={setRenderOpen} />
            <ViewportHost />
            {notice.error && !settingsOpen && !renderOpen && (
              <div className="error-notice">
                <Alert
                  variant="destructive"
                  title={t('error')}
                  action={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        services.notice.set({ key: services.editHint.get(), error: false })
                      }
                    >
                      {t('dismiss')}
                    </Button>
                  }
                >
                  {t(notice.key, notice.params)}
                </Alert>
              </div>
            )}
          </section>
        </WorkspacePanels>
      </div>
      <output className="status-bar">
        <span className={notice.error ? 'status-error' : undefined}>
          {busy ? t('busy') : notice.error ? t(editHint) : t(notice.key, notice.params)}
        </span>
        {snapFeedback && <span data-testid="snap-feedback">{t(snapFeedback)}</span>}
        <span>
          {doc.levels.find((level) => level.id === s.currentLevelId)?.name} / {t('meters')}
        </span>
      </output>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </main>
  );
}
