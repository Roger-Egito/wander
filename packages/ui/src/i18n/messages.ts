/**
 * The interface's words in each language, and the helpers around them. Kept apart from
 * LanguageProvider.tsx so that file exports only React components and hooks.
 */
import type { Language } from '@wander/rules';
import en from './en.json' with { type: 'json' };
import pt from './pt-BR.json' with { type: 'json' };

export type MessageKey = keyof typeof pt;

export const MESSAGES: Record<Language, Record<MessageKey, string>> = { pt, en };
export const LANGUAGE_STORAGE_KEY = 'wander-language';

/**
 * The message for `key` in `language`, variables filled. A message with a count can have
 * a singular form under `${key}_one`, used when the count is exactly 1 ("1 item", "2
 * itens"). Not Intl.PluralRules: for pt-BR it puts 0 in the singular too ("0 item"),
 * and the screens say "0 itens".
 */
export function translate(language: Language, key: MessageKey, vars?: Record<string, string | number>) {
  const one = vars?.count === 1 ? MESSAGES[language][`${key}_one` as MessageKey] : undefined;
  return interpolate(one ?? MESSAGES[language][key] ?? key, vars);
}

/** "Nível {level}" with { level: 3 } → "Nível 3". A missing variable stays as written. */
export function interpolate(message: string, vars: Record<string, string | number> = {}) {
  return message.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** The remembered choice, else the browser's languages, else Portuguese. */
export function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved === 'pt' || saved === 'en') return saved;
  } catch {
    // Storage can be blocked (private windows). The browser language still works.
  }
  if (typeof navigator === 'undefined') return 'pt';
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
  return preferred.some((l) => l?.toLowerCase().startsWith('pt')) ? 'pt' : preferred.some(Boolean) ? 'en' : 'pt';
}
