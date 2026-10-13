import { createContext, createElement, use, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { translate } from './i18n';
import type { Language } from './i18n';

const Context = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
} | null>(null);

/** Owns the local language preference; switching changes presentation without editing the project. */
export function LanguageProvider({
  children,
  onPreference,
}: {
  children: ReactNode;
  onPreference?: (language: Language) => void;
}) {
  const [language, setLanguage] = useState<Language>(() =>
    localStorage.getItem('building-language') === 'en' ? 'en' : 'zh-CN',
  );
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = translate(language, 'app');
  }, [language]);
  return createElement(
    Context,
    {
      value: {
        language,
        setLanguage: (next) => {
          setLanguage(next);
          localStorage.setItem('building-language', next);
          onPreference?.(next);
        },
        t: (key, params) => translate(language, key, params),
      },
    },
    children,
  );
}

export function useLanguage() {
  const context = use(Context);
  if (!context) {
    throw new Error('LanguageProvider required');
  }
  return context;
}

/** Fields retain localized validation when hosted in the app and remain independently renderable. */
export function useOptionalLanguage() {
  return use(Context);
}
