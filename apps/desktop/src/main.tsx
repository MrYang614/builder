import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider, validTheme } from '@building/ui/theme';
import { TooltipProvider } from '@building/ui';
import '@building/ui/styles.css';
import { EditorProvider } from './app/services';
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
              <ConfirmProvider>
                <App flushPreferences={preferenceWrites.retryAndFlush} />
              </ConfirmProvider>
            </EditorProvider>
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </React.StrictMode>,
  );
}
void start();
