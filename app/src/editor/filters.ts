/**
 * The search and filters both Editor views share (the list and the cards), so switching
 * views keeps what you were looking at.
 */
import type { ContentType, Row, Tables } from '@wander/content';

export interface Filters {
  search: string;
  status: string;
  source: string;
  discipline: string;
  /** Show the Trash (deleted rows) instead of the live ones. */
  trash: boolean;
}

export const NO_FILTERS: Filters = { search: '', status: '', source: '', discipline: '', trash: false };

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());
const fold = (value: unknown) => text(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** The rows of a type that pass the filters, in sheet order. Search matches the ID or the name, ignoring case and accents. */
export function filterRows(type: ContentType, tables: Tables, f: Filters): Row[] {
  const has = (key: string) => type.fields.some((field) => field.key === key);
  const q = fold(f.search);
  return tables[type.tab].filter((r) => {
    if (!text(r.id)) return false;
    if (has('status') && (r.status === 'deleted') !== f.trash) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.source && r.source !== f.source) return false;
    if (f.discipline && r.discipline_id !== f.discipline) return false;
    return !q || fold(r.id).includes(q) || fold(r[type.nameKey]).includes(q);
  });
}

/** How many of the dropdown filters are set (search and Trash aren't counted). */
export const activeFilters = (f: Filters) => [f.discipline, f.status, f.source].filter(Boolean).length;
