import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider, validTheme } from '@building/ui/theme';
import { TooltipProvider } from '@building/ui';
import '@building/ui/styles.css';
import { EditorProvider, useEditor } from './app/services';
import { startTauriControlBridge } from './cli/tauri-transport';
import { ConfirmProvider } from './ui/confirm';
import { LanguageProvider } from './ui/i18n';
import { loadSettings, saveSettings, type AppSettings } from './platform';
import { createPreferenceWriter } from './app/preferences';

const preferenceWrites = createPreferenceWriter<AppSettings>({
  snapshot: () => ({
    themeMode: validTheme(localStorage.getItem('building-theme')),
    language: localStorage.getItem('building-language') === 'en' ? 'en' : 'zh-CN',
    rendererBackend: localStorage.getItem('building-renderer') === 'webgpu' ? 'webgpu' : 'webgl',
  }),
  write: saveSettings,
  onError: () => window.dispatchEvent(new CustomEvent('preferences-error')),
});
const persist = () => void preferenceWrites.persist();
window.addEventListener('renderer-preference', persist);
async function start() {
  let initialError: string | undefined;
  try {
    const settings = await loadSettings();
    localStorage.setItem('building-theme', settings.themeMode);
    localStorage.setItem('building-language', settings.language);
    localStorage.setItem('building-renderer', settings.rendererBackend);
    document.documentElement.dataset.theme = settings.themeMode;
  } catch {
    initialError = 'settingsFailure';
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ThemeProvider onPreference={persist}>
        <LanguageProvider onPreference={persist}>
          <TooltipProvider>
            <EditorProvider initialError={initialError}>
              <AutomationBridge />
              <ConfirmProvider>
                <App
                  flushPreferences={preferenceWrites.retryAndFlush}
                  settlePreferences={preferenceWrites.flush}
                />
              </ConfirmProvider>
            </EditorProvider>
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </React.StrictMode>,
  );
}
function AutomationBridge() {
  const services = useEditor();
  React.useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void startTauriControlBridge(services, () => !disposed)
      .then((dispose) => {
        if (disposed) {
          dispose();
        } else {
          cleanup = dispose;
        }
      })
      .catch((error: unknown) => {
        console.error('[automation] bridge start failed', error);
      });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [services]);
  return null;
}
void start();
