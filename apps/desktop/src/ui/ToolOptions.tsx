import { Focus, Move, Rotate3d, Layers, Scan, View, MousePointer2, Magnet } from 'lucide-react';
import { Button, Checkbox, Toggle, ToggleGroup } from '@building/ui';
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
        <Button.Icon
          label={t('focus')}
          icon={Focus}
          size="sm"
          variant="ghost"
          onClick={() => runtimeRef.current?.focus('selected')}
          disabled={!s.selectedId}
        />
        <Button.Icon
          label={t('current')}
          icon={Layers}
          size="sm"
          onClick={() => runtimeRef.current?.focus('level')}
        />
        <Button.Icon
          label={t('all')}
          icon={Scan}
          size="sm"
          onClick={() => runtimeRef.current?.focus('all')}
        />
        <Button.Icon
          label={t('topView')}
          icon={View}
          size="sm"
          onClick={() => runtimeRef.current?.focus('top')}
        />
      </div>
      <RenderControls open={renderOpen} onOpenChange={onRenderOpenChange} />
      <div className="view-options">
        <Toggle
          tooltip={
            s.snap.enabled
              ? t('snapOn') + ' · ' + t('snapHint')
              : t('snapOff') + ' · ' + t('snapHint')
          }
          size="sm"
          variant="outline"
          pressed={s.snap.enabled}
          label={t('snap')}
          icon={Magnet}
          aria-pressed={s.snap.enabled}
          disabled={s.wholeBuildingPreview || rendering.mode === 'pathtrace'}
          onPressedChange={(enabled) => session.set({ snap: { ...s.snap, enabled } })}
        >
          {s.snap.enabled ? t('snapOn') : t('snapOff')}
        </Toggle>
        <ToggleGroup
          value={mode}
          onValueChange={(v) => {
            if (v) {
              camera.set(v as typeof mode);
            }
          }}
          label={t('edit')}
          size="sm"
          variant="outline"
          iconOnly
          tooltip
          options={[
            { value: 'edit', label: t('edit'), icon: MousePointer2 },
            { value: 'rotate', label: t('rotate'), icon: Rotate3d },
            { value: 'pan', label: t('pan'), icon: Move },
          ]}
        />
        <Checkbox
          label={t('preview')}
          checked={s.wholeBuildingPreview}
          onCheckedChange={(checked) => session.set({ wholeBuildingPreview: checked })}
        />
      </div>
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
