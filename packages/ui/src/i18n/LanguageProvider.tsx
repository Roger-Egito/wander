/**
 * The interface language: Portuguese or English. The first visit follows the browser
 * (Portuguese for any pt-* language, English otherwise), and a choice made with the
 * toggle is remembered in this browser.
 *
 * These are the interface's own words (buttons, labels). Content text comes from Wander
 * Data in the same language through @wander/rules (inLanguage).
 *
 * This file exports only the provider and its hook: React Fast Refresh can hot-swap a
 * file like that. The message tables and helpers live in messages.ts.
 */
import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Language } from '@wander/rules';
import { LanguageContext, type LanguageState } from '../contexts.ts';
import { initialLanguage, interpolate, LANGUAGE_STORAGE_KEY, MESSAGES } from './messages.ts';

export function LanguageProvider({ children, initial }: { children: ReactNode; initial?: Language }) {
  const [language, setState] = useState<Language>(() => initial ?? initialLanguage());

  useEffect(() => {
    document.documentElement.lang = language === 'pt' ? 'pt-BR' : 'en';
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setState(next);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // Not remembered, but the switch still happens.
    }
  }, []);

  const value = useMemo<LanguageState>(
    () => ({ language, setLanguage, t: (key, vars) => interpolate(MESSAGES[language][key] ?? key, vars) }),
    [language, setLanguage],
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const state = useContext(LanguageContext);
  if (!state) throw new Error('useLanguage needs a <LanguageProvider> above it');
  return state;
}
