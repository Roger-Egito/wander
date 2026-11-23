/**
 * The React contexts, each created once, in a file that imports no data. A provider's
 * file re-runs when something it imports changes (a locale file, theme.ts), and if the
 * context were created there, a re-run would make a second context that the components
 * already holding the first one can't see. Here, edits elsewhere never recreate them.
 */
import { createContext } from 'react';
import type { Content, Language } from '@wander/rules';
import type { MessageKey } from './i18n/messages.ts';
import type { ThemeName } from './theme.ts';

export interface LanguageState {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

export interface ThemeState {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

export const LanguageContext = createContext<LanguageState | null>(null);
export const ThemeContext = createContext<ThemeState | null>(null);
export const ContentContext = createContext<Content | null>(null);
