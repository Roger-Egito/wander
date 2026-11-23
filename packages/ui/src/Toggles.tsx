/**
 * The theme and language switches, as two-button segmented controls. Every screen's top
 * bar uses these, so the choice looks and works the same everywhere.
 */
import type { Language } from '@wander/rules';
import { useLanguage } from './i18n/LanguageProvider.tsx';
import { useTheme } from './ThemeProvider.tsx';
import type { ThemeName } from './theme.ts';
import styles from './Toggles.module.css';

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (value: T) => void }) {
  return (
    <div className={styles.group} role="group" aria-label={label}>
      {options.map(([option, text]) => (
        <button key={option} type="button" className={styles.option} aria-pressed={option === value} onClick={() => onChange(option)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useLanguage();
  return <Segmented<ThemeName> label={t('theme.label')} value={theme} onChange={setTheme} options={[['dark', t('theme.dark')], ['light', t('theme.light')]]} />;
}

export function LanguageToggle() {
  const { language, setLanguage, t } = useLanguage();
  return <Segmented<Language> label={t('language.label')} value={language} onChange={setLanguage} options={[['pt', 'PT'], ['en', 'EN']]} />;
}
