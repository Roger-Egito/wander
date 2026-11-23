/**
 * A description with its keywords turned into popovers. Tapping or clicking a keyword
 * opens a small card with its explanation and, for keywords, a link to the rules
 * section. Popovers open on tap, not hover, so they work the same on a phone.
 *
 * Line breaks in the text are kept. The popover's own text is plain: nesting popovers
 * inside popovers would make a phone screen unusable.
 */
import * as Popover from '@radix-ui/react-popover';
import { useMemo } from 'react';
import { inLanguage } from '@wander/rules';
import { useContent } from './ContentProvider.tsx';
import { useLanguage } from './i18n/LanguageProvider.tsx';
import { keywordTerms, splitKeywords, type Term } from './keywords.ts';
import styles from './RichText.module.css';

export function RichText({ text, exclude }: { text: string; /** The row's own ID, so its name doesn't link to itself. */ exclude?: string }) {
  const content = useContent();
  const { language } = useLanguage();
  const terms = useMemo(() => keywordTerms(content, language), [content, language]);
  const segments = useMemo(() => splitKeywords(text, terms, exclude), [text, terms, exclude]);
  return (
    <span className={styles.text}>
      {segments.map((segment, i) =>
        typeof segment === 'string' ? segment : <KeywordPopover key={i} term={segment.term} label={segment.text} />,
      )}
    </span>
  );
}

function KeywordPopover({ term, label }: { term: Term; label: string }) {
  const content = useContent();
  const { language, t } = useLanguage();
  const info = describe(term);

  function describe({ type, id }: Term): { title: string; body: string; url: string } {
    if (type === 'keyword') {
      const k = content.keyword.find((row) => row.id === id)!;
      return {
        title: language === 'en' && k.name_en ? k.name_en : k.name_pt,
        body: language === 'en' && k.description_en ? k.description_en : k.description_pt,
        url: language === 'en' && k.url_en ? k.url_en : k.url_pt,
      };
    }
    if (type === 'condition') {
      const c = content.condition.find((row) => row.id === id)!;
      return {
        title: inLanguage(content, language, { tab: 'Conditions', id, field: 'name' }, c.name, c.name_en),
        body: inLanguage(content, language, { tab: 'Conditions', id, field: 'description' }, c.description, c.description_en),
        url: c.rule_url,
      };
    }
    const s = content.skillsById.get(id)!;
    return {
      title: inLanguage(content, language, { tab: 'Skills', id, field: 'name' }, s.name, s.name_en),
      body: inLanguage(content, language, { tab: 'Skills', id, field: 'description' }, s.description, s.description_en),
      url: '',
    };
  }

  return (
    <Popover.Root>
      <Popover.Trigger className={styles.keyword} data-type={term.type}>
        {label}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={styles.popover} sideOffset={6} collisionPadding={12}>
          <strong className={styles.title}>{info.title}</strong>
          {info.body && <p className={styles.body}>{info.body}</p>}
          {info.url && (
            <a className={styles.link} href={info.url} target="_blank" rel="noreferrer">
              {t('card.rules')}
            </a>
          )}
          <Popover.Arrow className={styles.arrow} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
