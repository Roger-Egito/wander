/**
 * Search, filters, Trash and "+ Novo": the bar above both Editor views, so the list and
 * the cards always show the same rows.
 */
import { useState } from 'react';
import type { ContentType, Field, Tables } from '@wander/content';
import { useLanguage } from '@wander/ui';
import { optionsFor } from './fields.tsx';
import { activeFilters, type Filters } from './filters.ts';
import styles from './editor.module.css';

export function ListTools({ type, tables, filters, onFilters, count, onCreate }: {
  type: ContentType;
  tables: Tables;
  filters: Filters;
  onFilters: (filters: Filters) => void;
  count: number;
  onCreate: () => void;
}) {
  const { language, t } = useLanguage();
  // Open on wide screens, folded on a phone, where the rows matter more than the filters.
  const [open, setOpen] = useState(() => typeof matchMedia === 'undefined' || matchMedia('(min-width: 901px)').matches);
  const has = (key: string) => type.fields.some((f) => f.key === key);
  const field = (key: string) => type.fields.find((f) => f.key === key) as Field;
  const set = (patch: Partial<Filters>) => onFilters({ ...filters, ...patch });
  const active = activeFilters(filters);

  const select = (key: string, value: string, patch: (v: string) => Partial<Filters>, all: string) => (
    <select className={styles.input} value={value} onChange={(e) => set(patch(e.target.value))} aria-label={field(key).label[language]}>
      <option value="">{all}</option>
      {(optionsFor(field(key), tables) ?? []).filter((o) => o.value !== 'deleted').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  return (
    <div className={styles.listTools}>
      <input className={styles.input} type="search" placeholder={t('editor.search')} value={filters.search} onChange={(e) => set({ search: e.target.value })} />
      <details className={styles.filterBox} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>{active ? t('editor.filtersActive', { count: active }) : t('editor.filters')}</summary>
        <div className={styles.filters}>
          {has('discipline_id') && select('discipline_id', filters.discipline, (v) => ({ discipline: v }), t('editor.allDisciplines'))}
          {has('status') && !filters.trash && select('status', filters.status, (v) => ({ status: v }), t('editor.allStatuses'))}
          {has('source') && select('source', filters.source, (v) => ({ source: v }), t('editor.allSources'))}
        </div>
      </details>
      <div className={styles.listActions}>
        <button type="button" className={styles.primary} onClick={onCreate}>+ {t('editor.new')}</button>
        {has('status') && (
          <label className={styles.inline}>
            <input type="checkbox" checked={filters.trash} onChange={(e) => set({ trash: e.target.checked })} /> {t('editor.trash')}
          </label>
        )}
        <span className={styles.muted}>{t('editor.count', { count })}</span>
      </div>
    </div>
  );
}
