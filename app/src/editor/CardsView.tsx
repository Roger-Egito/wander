/**
 * The Cards view: every row of the current type as its real card, so what a skill does
 * is visible without opening it. The grid fits as many columns as the screen allows,
 * down to one full-width column on a phone. Each card's "Editar" button opens it in the
 * editing screen. The card itself doesn't react to taps, so reading, scrolling and
 * opening a keyword's popover never open the form by accident.
 */
import { useMemo } from 'react';
import type { ContentType, Problem, Tables } from '@wander/content';
import { loadContent } from '@wander/rules';
import { ConditionCard, ContentProvider, DisciplineCard, KeywordCard, SkillCard, TraitCard, useLanguage } from '@wander/ui';
import { filterRows, type Filters } from './filters.ts';
import { ListTools } from './ListTools.tsx';
import styles from './editor.module.css';

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());

export function CardsView({ type, tables, problems, filters, onFilters, onOpen, onCreate }: {
  type: ContentType;
  tables: Tables;
  problems: Problem[];
  filters: Filters;
  onFilters: (filters: Filters) => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const { t } = useLanguage();
  // Deleted rows load too, so the Trash shows as cards like everything else.
  const content = useMemo(() => loadContent(tables, { includeDeleted: true }), [tables]);
  const rows = filterRows(type, tables, filters);
  const counts = useMemo(() => {
    const byId = new Map<string, number>();
    for (const p of problems) byId.set(p.id, (byId.get(p.id) ?? 0) + 1);
    return byId;
  }, [problems]);

  const card = (id: string) => {
    if (type.id === 'skill') {
      const skill = content.skillsById.get(id);
      return skill && <SkillCard skill={skill} />;
    }
    if (type.id === 'condition') {
      const c = content.condition.find((x) => x.id === id);
      return c && <ConditionCard condition={c} />;
    }
    if (type.id === 'trait') {
      const tr = content.trait.find((x) => x.id === id);
      return tr && <TraitCard trait={tr} />;
    }
    if (type.id === 'keyword') {
      const k = content.keyword.find((x) => x.id === id);
      return k && <KeywordCard keyword={k} />;
    }
    const d = content.discipline.find((x) => x.id === id);
    return d && <DisciplineCard discipline={d} />;
  };

  return (
    <section className={styles.cardsView}>
      <ListTools type={type} tables={tables} filters={filters} onFilters={onFilters} count={rows.length} onCreate={onCreate} />
      <ContentProvider content={content}>
        <ul className={styles.cardGrid}>
          {rows.map((row) => {
            const id = text(row.id);
            const n = counts.get(id) ?? 0;
            return (
              <li key={id} className={styles.cardCell}>
                <div className={styles.cardActions}>
                  {n > 0 && <span className={styles.problemBadge} title={t('editor.problemCount', { count: n })}>{n}</span>}
                  <button type="button" className={styles.secondary} onClick={() => onOpen(id)} aria-label={`${t('editor.edit')} ${text(row[type.nameKey]) || id}`}>
                    {t('editor.edit')}
                  </button>
                </div>
                {card(id)}
              </li>
            );
          })}
        </ul>
      </ContentProvider>
    </section>
  );
}
