import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@building/ui';
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="settings-dialog" showCloseButton={false}>
        <DialogTitle>{t('settings')}</DialogTitle>
        <DialogDescription>{t('render.settingsDescription')}</DialogDescription>
        <RenderingSettings />
        <SnappingSettings />
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{t('close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
