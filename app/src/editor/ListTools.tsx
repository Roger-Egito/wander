/**
 * Search, filters, Trash and "+ Criar": the bar above every Editor view, so the list,
 * the cards and the graph always show the same rows. The search box and the filter
 * dropdowns are their own components too, for the graph's full screen panel.
 */
import { useState } from 'react';
import type { ContentType, Field, Tables } from '@wander/content';
import { useLanguage } from '@wander/ui';
import { Options } from './fields.tsx';
import { optionsFor } from './options.ts';
import { activeFilters, type Filters } from './filters.ts';
import styles from './editor.module.css';

interface FilterProps {
  type: ContentType;
  tables: Tables;
  filters: Filters;
  onFilters: (filters: Filters) => void;
}

export function SearchBox({ filters, onFilters }: Pick<FilterProps, 'filters' | 'onFilters'>) {
  const { t } = useLanguage();
  return <input className={styles.input} type="search" placeholder={t('editor.search')} value={filters.search} onChange={(e) => onFilters({ ...filters, search: e.target.value })} />;
}

/** The dropdowns the type has: discipline, status (outside the Trash) and source. */
export function FilterSelects({ type, tables, filters, onFilters }: FilterProps) {
  const { language, t } = useLanguage();
  const has = (key: string) => type.fields.some((f) => f.key === key);
  const field = (key: string) => type.fields.find((f) => f.key === key) as Field;
  const set = (patch: Partial<Filters>) => onFilters({ ...filters, ...patch });
  const select = (key: string, value: string, patch: (v: string) => Partial<Filters>, all: string) => (
    <select className={styles.input} value={value} onChange={(e) => set(patch(e.target.value))} aria-label={field(key).label[language]}>
      <option value="">{all}</option>
      <Options options={(optionsFor(field(key), tables) ?? []).filter((o) => o.value !== 'deleted')} />
    </select>
  );
  return (
    <div className={styles.filters}>
      {has('discipline_id') && select('discipline_id', filters.discipline, (v) => ({ discipline: v }), t('editor.allDisciplines'))}
      {has('status') && !filters.trash && select('status', filters.status, (v) => ({ status: v }), t('editor.allStatuses'))}
      {has('source') && select('source', filters.source, (v) => ({ source: v }), t('editor.allSources'))}
    </div>
  );
}

/** "Filtros", with how many are on. */
export function FilterLabel({ filters }: { filters: Filters }) {
  const { t } = useLanguage();
  const active = activeFilters(filters);
  return <>{active ? t('editor.filtersActive', { count: active }) : t('editor.filters')}</>;
}

export function ListTools({ type, tables, filters, onFilters, count, onCreate }: FilterProps & { count: number; onCreate: () => void }) {
  const { language, t } = useLanguage();
  // Open on wide screens, folded on a phone, where the rows matter more than the filters.
  const [open, setOpen] = useState(() => typeof matchMedia === 'undefined' || matchMedia('(min-width: 901px)').matches);
  const has = (key: string) => type.fields.some((f) => f.key === key);

  return (
    <div className={styles.listTools}>
      <SearchBox filters={filters} onFilters={onFilters} />
      <details className={styles.filterBox} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary><FilterLabel filters={filters} /></summary>
        <FilterSelects type={type} tables={tables} filters={filters} onFilters={onFilters} />
      </details>
      <div className={styles.listActions}>
        {/* Names the type, so it reads as creating a row and not as adding a filter. */}
        <button type="button" className={styles.primary} onClick={onCreate}>+ {t('editor.newOf', { type: type.label.singular[language] })}</button>
        {has('status') && (
          <label className={styles.inline}>
            <input type="checkbox" checked={filters.trash} onChange={(e) => onFilters({ ...filters, trash: e.target.checked })} /> {t('editor.trash')}
          </label>
        )}
        <span className={styles.muted}>{t('editor.count', { count })}</span>
      </div>
    </div>
  );
}
