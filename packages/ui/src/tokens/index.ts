import source from './source.json';
export type ResolvedTheme = 'light' | 'dark';
export type ThemeMode = ResolvedTheme;
export type TokenKey = keyof typeof source.light;
export const tokens = source;
export function resolveTokens(theme: ResolvedTheme) {
  return tokens[theme];
}
export function viewportTokens(theme: ResolvedTheme) {
  const t = resolveTokens(theme);
  return {
    background: t['viewport-background'],
    grid: t.grid,
    axis: t.axis,
    selection: t.selection,
    snap: t.snap,
    preview: t.preview,
    invalid: t['preview-invalid'],
  };
}
