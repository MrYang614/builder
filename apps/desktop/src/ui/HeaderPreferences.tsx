import { useSyncExternalStore } from 'react';
import { Cpu, Languages, Moon, Sun } from 'lucide-react';
import { Button, Select } from '@building/ui';
import { useTheme } from '@building/ui/theme';
import { useEditor, useSignal } from '../app/services';
import { useLanguage } from './i18n';

function HeaderChoice({
  label,
  value,
  options,
  onChange,
  disabled,
  icon,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  icon: typeof Languages;
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label;
  return (
    <Select
      value={value}
      options={options}
      onValueChange={(next) => {
        if (next !== undefined) {
          onChange(next);
        }
      }}
      disabled={disabled}
      appearance="icon"
      icon={icon}
      aria-label={label}
      tooltip={label + ': ' + selectedLabel}
      width="auto"
    />
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
      <Button.Icon
        variant="ghost"
        label={t('appearance')}
        icon={ThemeIcon}
        tooltip={t('appearance') + ': ' + t(mode)}
        aria-description={t(mode)}
        aria-pressed={mode === 'dark'}
        onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
      />
      <HeaderChoice
        label={t('language')}
        icon={Languages}
        value={language}
        options={[
          { value: 'en', label: t('english') },
          { value: 'zh-CN', label: t('chinese') },
        ]}
        onChange={(value) => setLanguage(value as typeof language)}
      />
      <HeaderChoice
        label={t('render.backend')}
        icon={Cpu}
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
      />
    </div>
  );
}
