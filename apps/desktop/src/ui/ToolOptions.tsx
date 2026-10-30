import { Focus, Move, Rotate3d, Layers, Scan, View, MousePointer2, Magnet } from 'lucide-react';
import { Button, Checkbox, Toggle, ToggleGroup } from '@building/ui';
import { useEditor, useSession, useSignal } from '../app/services';
import { RenderControls } from './RenderControls';
import { useLanguage } from './i18n';
import { PlanToolbar } from '../plan-view/PlanToolbar';
import { SlabOptions } from './SlabOptions';

type ToolOptionsProps = { renderOpen: boolean; onRenderOpenChange: (open: boolean) => void };

/** Stacked toolbars reserve one stable viewport boundary; only the active layer owns input. */
export function ToolOptions(props: ToolOptionsProps) {
  const { viewMode, viewTransition } = useEditor(),
    view = useSignal(viewMode),
    transitioning = useSignal(viewTransition).phase !== 'idle';
  return (
    <div className="view-tools">
      <div className="view-toolbars">
        <div
          className="view-toolbar-layer"
          data-active={view === '3d'}
          aria-hidden={view !== '3d' || transitioning}
          inert={view !== '3d' || transitioning}
        >
          <SceneToolbar {...props} />
        </div>
        <div
          className="view-toolbar-layer"
          data-active={view === 'plan'}
          aria-hidden={view !== 'plan' || transitioning}
          inert={view !== 'plan' || transitioning}
        >
          <PlanToolbar />
        </div>
      </div>
      <SlabOptions />
    </div>
  );
}

/** Scene controls issue runtime commands; their mounted identity survives a plan-view transition. */
function SceneToolbar({ renderOpen, onRenderOpenChange }: ToolOptionsProps) {
  const { session, camera, runtimeRef, renderState } = useEditor(),
    s = useSession(),
    { t } = useLanguage(),
    mode = useSignal(camera),
    rendering = useSignal(renderState);
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
    </div>
  );
}
