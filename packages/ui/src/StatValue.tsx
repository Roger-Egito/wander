/**
 * A stat as a character sheet shows it: emoji, abbreviation and final value, tinted
 * green when modifiers raise it and red when they lower it. Tapping it opens the sum,
 * "Base 5, Bom +1, Queimando −1, Total 5", so a player can see where a number came from.
 */
import * as Popover from '@radix-ui/react-popover';
import { useContent } from './ContentProvider.tsx';
import { useLanguage } from './i18n/LanguageProvider.tsx';
import styles from './StatValue.module.css';

export interface StatPart {
  /** Where it comes from, already in the reader's language: "Senso de Direção Bom". */
  label: string;
  value: number;
  temporary?: boolean;
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

export function StatValue({ code, base, parts = [] }: { code: string; base: number; parts?: StatPart[] }) {
  const content = useContent();
  const { language, t } = useLanguage();
  const stat = content.stats.find((s) => s.code === code);
  const abbr = stat ? (language === 'en' ? stat.abbr_en || stat.abbr_pt : stat.abbr_pt) : code;
  const name = stat ? (language === 'en' ? stat.name_en || stat.name_pt : stat.name_pt) : code;
  const total = parts.reduce((sum, part) => sum + part.value, base);
  const trend = total > base ? 'up' : total < base ? 'down' : 'flat';

  return (
    <Popover.Root>
      <Popover.Trigger className={styles.stat} data-trend={trend} aria-label={`${name}: ${total}`}>
        <span className={styles.label}>{stat?.emoji} {abbr}</span>
        <span className={styles.value}>{total}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={styles.popover} sideOffset={6} collisionPadding={12}>
          <strong>{name}</strong>
          <table className={styles.sum}>
            <tbody>
              <tr><td>{t('stat.base')}</td><td>{base}</td></tr>
              {parts.map((part, i) => (
                <tr key={i} data-sign={part.value >= 0 ? 'up' : 'down'}>
                  <td>{part.label}{part.temporary && ` (${t('card.temporary')})`}</td>
                  <td>{signed(part.value)}</td>
                </tr>
              ))}
              <tr className={styles.total}><td>{t('stat.total')}</td><td>{total}</td></tr>
            </tbody>
          </table>
          <Popover.Arrow className={styles.arrow} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
