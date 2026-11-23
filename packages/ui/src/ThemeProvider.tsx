/**
 * The current theme and a way to change it. The first paint already has the right
 * theme (themeScript in theme.ts sets data-theme before React runs), so this only reads
 * what that script chose and keeps it in sync from then on.
 */
import { useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ThemeContext } from './contexts.ts';
import { THEME_STORAGE_KEY, type ThemeName } from './theme.ts';

const current = (): ThemeName => (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setState] = useState<ThemeName>(current);

  const setTheme = useCallback((next: ThemeName) => {
    document.documentElement.dataset.theme = next;
    setState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Not remembered, but the switch still happens.
    }
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const state = useContext(ThemeContext);
  if (!state) throw new Error('useTheme needs a <ThemeProvider> above it');
  return state;
}
