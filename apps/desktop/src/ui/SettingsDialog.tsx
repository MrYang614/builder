import { Button, Dialog } from '@building/ui';
import { RenderingSettings } from './RenderingSettings';
import { SnappingSettings } from './SnappingSettings';
import { useLanguage } from './i18n';

// SettingsDialog hosts runtime, environment and session snapping configuration.
export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLanguage();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('settings')}
      description={t('render.settingsDescription')}
      closeLabel={t('close')}
      showCloseButton={false}
      footer={<Button onClick={() => onOpenChange(false)}>{t('close')}</Button>}
    >
      <RenderingSettings />
      <SnappingSettings />
    </Dialog>
  );
}
