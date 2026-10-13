import { Focus, Move, Rotate3d } from 'lucide-react';
import {
  Button,
  Toggle,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@building/ui';
import { useEditor, useDocument, useSession, useSignal } from '../app/services';
import { Choice, Numeric } from './fields';
import { RenderControls } from './RenderControls';
import { useLanguage } from './i18n';

// ToolOptions groups camera, editing, preview, and slab controls.
export function ToolOptions({
  renderOpen,
  onRenderOpenChange,
}: {
  renderOpen: boolean;
  onRenderOpenChange: (open: boolean) => void;
}) {
  const { session, camera, runtimeRef, renderState } = useEditor(),
    s = useSession(),
    doc = useDocument(),
    { t } = useLanguage(),
    mode = useSignal(camera),
    rendering = useSignal(renderState);
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
      <RenderControls open={renderOpen} onOpenChange={onRenderOpenChange} />
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Toggle
              size="sm"
              variant="outline"
              pressed={s.snap.enabled}
              aria-label={t('snap')}
              aria-pressed={s.snap.enabled}
              disabled={s.wholeBuildingPreview || rendering.mode === 'pathtrace'}
              onPressedChange={(enabled) => session.set({ snap: { ...s.snap, enabled } })}
            >
              {s.snap.enabled ? t('snapOn') : t('snapOff')}
            </Toggle>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {s.snap.enabled ? t('snapOn') : t('snapOff')} · {t('snapHint')}
        </TooltipContent>
      </Tooltip>
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
