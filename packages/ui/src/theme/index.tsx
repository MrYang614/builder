import { createContext, use, useState, useEffect, type ReactNode } from 'react';
import type { ThemeMode, ResolvedTheme } from '../tokens';
export const validTheme = (value: unknown): ThemeMode =>
  value === 'light' || value === 'dark' ? value : 'dark';
export function resolvedTheme(mode: ThemeMode): ResolvedTheme {
  return mode;
}
const ThemeContext = createContext<{
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (m: ThemeMode) => void;
} | null>(null);
/** Owns only local appearance; theme updates never touch the editor document or renderer lifecycle. */
export function ThemeProvider({
  children,
  onPreference,
}: {
  children: ReactNode;
  onPreference?: (m: ThemeMode) => void;
}) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    try {
      return validTheme(localStorage.getItem('building-theme'));
    } catch {
      return 'dark';
    }
  });
  const resolved = mode;
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);
  return (
    <ThemeContext
      value={{
        mode,
        resolved,
        setMode: (m) => {
          const next = validTheme(m);
          setMode(next);
          try {
            localStorage.setItem('building-theme', next);
          } catch {
            // The selected appearance remains usable when the optional startup cache is unavailable.
          }
          onPreference?.(next);
        },
      }}
    >
      {children}
    </ThemeContext>
  );
}
export function useTheme() {
  const value = use(ThemeContext);
  if (!value) {
    throw new Error('ThemeProvider required');
  }
  return value;
}
