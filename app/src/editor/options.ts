/**
 * The choices of an enum, tags or reference field, read from the current data. Cached
 * per read of the sheet (the tables object) and per field: a skill's requirement field
 * lists all 260 skills, and rebuilding that list on every keystroke was most of the
 * typing cost. A new read of the sheet is a new tables object, so the cache can't go stale.
 */
import { CONTENT_TYPES, type ContentType, type Field, type Tables } from '@wander/content';

export interface Option {
  value: string;
  label: string;
}

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));
const cache = new WeakMap<Tables, Map<Field, Option[] | null>>();

function compute(field: Field, tables: Tables): Option[] | null {
  const fromTab = (tab: keyof Tables, column: string) =>
    [...new Set(tables[tab].map((r) => text(r[column]).trim()).filter(Boolean))].map((v) => ({ value: v, label: v }));
  if (field.type === 'enum' || (field.type === 'tags' && field.options)) {
    const options = field.options!;
    return Array.isArray(options) ? options.map((v: string) => ({ value: v, label: v })) : fromTab((options as { tab: keyof Tables }).tab, (options as { column: string }).column);
  }
  if (field.type === 'reference') {
    if (typeof field.to === 'string') {
      const type = (CONTENT_TYPES as readonly ContentType[]).find((t) => t.id === field.to)!;
      return tables[type.tab].filter((r) => r.status !== 'deleted').map((r) => ({ value: text(r.id), label: `${text(r.id)} · ${text(r[type.nameKey])}` }));
    }
    // A trait level: "FAC-14.2 · Mau-Cheiro Bom".
    const traitName = new Map(tables.Traits.map((t) => [text(t.id), text(t.name)]));
    return tables[field.to.tab].map((r) => ({ value: text(r.id), label: `${text(r.id)} · ${traitName.get(text(r.trait_id)) ?? ''} ${text(r.tier)}`.trim() }));
  }
  return null;
}

export function optionsFor(field: Field, tables: Tables): Option[] | null {
  let byField = cache.get(tables);
  if (!byField) cache.set(tables, (byField = new Map()));
  if (!byField.has(field)) byField.set(field, compute(field, tables));
  return byField.get(field)!;
}
