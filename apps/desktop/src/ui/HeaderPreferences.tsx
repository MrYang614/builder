import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { Cpu, Languages, Moon, Sun } from 'lucide-react';
import {
  Button,
  Select,
  SelectContent,
  SelectIconTrigger,
  SelectItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@building/ui';
import { useTheme } from '@building/ui/theme';
import { useEditor, useSignal } from '../app/services';
import { useLanguage } from './i18n';

function HeaderChoice({
  label,
  value,
  options,
  onChange,
  disabled,
  children,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label;
  const [selectOpen, setSelectOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  return (
    <Select value={value} onValueChange={onChange} onOpenChange={setSelectOpen} disabled={disabled}>
      <Tooltip open={!selectOpen && tooltipOpen} onOpenChange={setTooltipOpen}>
        <TooltipTrigger asChild>
          <SelectIconTrigger aria-label={label}>{children}</SelectIconTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {label}: {selectedLabel}
        </TooltipContent>
      </Tooltip>
      <SelectContent position="popper" align="end">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function HeaderPreferences() {
  const { mode, setMode } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const services = useEditor();
  // Sampling progress is local to the viewport; the Header only observes backend controls.
  const backend = useSyncExternalStore(
    services.renderState.subscribe,
    () => services.renderState.get().backend,
  );
  const switching = useSyncExternalStore(
    services.renderState.subscribe,
    () => services.renderState.get().switching,
  );
  const busy = useSignal(services.busy);
  const preferredBackend = useSignal(services.rendererPreference);
  const ThemeIcon = mode === 'dark' ? Moon : Sun;
  const changeBackend = async (value: string) => {
    const nextBackend = value === 'save-current' ? backend : value;
    if (nextBackend !== 'webgl' && nextBackend !== 'webgpu') {
      return;
    }
    try {
      if (await services.runtimeRef.current?.setRendererBackend(nextBackend)) {
        localStorage.setItem('building-renderer', nextBackend);
        services.rendererPreference.set(nextBackend);
        window.dispatchEvent(new CustomEvent('renderer-preference'));
        services.notice.set({
          key: 'render.backendSaved',
          params: { backend: t(`render.${nextBackend}`) },
          error: false,
        });
      }
    } catch {
      services.notice.set({ key: 'settingsFailure', error: true });
    }
  };
  return (
    <div className="header-preferences">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t('appearance')}
            aria-description={t(mode)}
            aria-pressed={mode === 'dark'}
            onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
          >
            <ThemeIcon aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {t('appearance')}: {t(mode)}
        </TooltipContent>
      </Tooltip>
      <HeaderChoice
        label={t('language')}
        value={language}
        options={[
          { value: 'en', label: t('english') },
          { value: 'zh-CN', label: t('chinese') },
        ]}
        onChange={(value) => setLanguage(value as typeof language)}
      >
        <Languages aria-hidden="true" />
      </HeaderChoice>
      <HeaderChoice
        label={t('render.backend')}
        value={backend}
        options={[
          ...['webgl', 'webgpu'].map((value) => ({ value, label: t(`render.${value}`) })),
          ...(preferredBackend !== backend
            ? [
                {
                  value: 'save-current',
                  label: t('render.saveCurrentBackend', { backend: t(`render.${backend}`) }),
                },
              ]
            : []),
        ]}
        disabled={switching || busy}
        onChange={(value) => void changeBackend(value)}
      >
        <Cpu aria-hidden="true" />
      </HeaderChoice>
    </div>
  );
}
