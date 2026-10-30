import { Copy, Focus, LocateFixed, Magnet, Move, Scan } from 'lucide-react';
import { Button, Checkbox, Toggle } from '@building/ui';
import { useEditor, useSession, useSignal } from '../app/services';
import { useLanguage } from '../ui/i18n';

/** Plan navigation stays in session signals and never changes formal geometry. */
export function PlanToolbar() {
  const services = useEditor(),
    s = useSession(),
    { t } = useLanguage();
  const pan = useSignal(services.planPan);
  return (
    <div className="viewport-toolbar">
      <div className="camera-tools">
        <Button.Icon
          label={t('focus')}
          icon={Focus}
          size="sm"
          disabled={!s.selectedId}
          onClick={() => services.planFocus.set('selected')}
        />
        <Button.Icon
          label={t('plan.fit')}
          icon={Scan}
          size="sm"
          onClick={() => services.planFocus.set('level')}
        />
        <Button.Icon
          label={t('plan.origin')}
          icon={LocateFixed}
          size="sm"
          onClick={() => services.planFocus.set('origin')}
        />
      </div>
      <div className="view-options">
        <Toggle
          label={t('plan.pan')}
          tooltip={t('plan.pan')}
          size="sm"
          icon={Move}
          pressed={pan}
          onPressedChange={(value) => services.planPan.set(value)}
        >
          {t('pan')}
        </Toggle>
        <Toggle
          label={t('snap')}
          tooltip={t('snapHint')}
          size="sm"
          icon={Magnet}
          pressed={s.snap.enabled}
          disabled={s.wholeBuildingPreview}
          onPressedChange={(enabled) => services.session.set({ snap: { ...s.snap, enabled } })}
        >
          {t(s.snap.enabled ? 'snapOn' : 'snapOff')}
        </Toggle>
        <Button.Icon
          label={t('plan.duplicate')}
          icon={Copy}
          size="sm"
          disabled={!s.selectedId || s.wholeBuildingPreview}
          onClick={() => services.planFocus.set('duplicate')}
        />
        <Checkbox
          label={t('plan.preview')}
          checked={s.wholeBuildingPreview}
          onCheckedChange={(checked) => services.session.set({ wholeBuildingPreview: checked })}
        />
      </div>
    </div>
  );
}
