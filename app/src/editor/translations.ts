/**
 * Every text a player reads in Portuguese, with its English and the state of that
 * English, for the Translation screen. Read from the content types (every translatable
 * field, child rows like trait levels included) plus the lookup tabs' names.
 *
 * States:
 *   - manual: hand-written English,
 *   - outdated: hand-written for a Portuguese that has changed since
 *     (Translations.manual_from holds the Portuguese it was written for),
 *   - auto: no English yet, so the app shows the automatic translation,
 *   - missing: neither (the automatic one hasn't come in, or the text is new).
 */
import { CONTENT_TYPES, englishKey, type ContentType, type Field, type Label, type TabName, type Tables } from '@wander/content';

export type TranslationState = 'manual' | 'outdated' | 'auto' | 'missing';

export interface TranslationEntry {
  /** Content type ID, or "lookup" for Categories, CastTimes, TraitTiers and CostScales. */
  type: string;
  table: TabName;
  /** The row's key: its ID, or its name in a lookup tab. */
  id: string;
  keyColumn: string;
  field: string;
  enColumn: string;
  label: Label;
  /** Which row this text belongs to, for the reader: "Mau-Cheiro · Bom". */
  context: string;
  pt: string;
  en: string;
  auto: string;
  /** The Portuguese the English was written for, when known. */
  manualFrom: string;
  state: TranslationState;
}

const TYPES = CONTENT_TYPES as readonly ContentType[];
const LOOKUPS: { tab: TabName; label: Label }[] = [
  { tab: 'Categories', label: { pt: 'Categoria', en: 'Category' } },
  { tab: 'CastTimes', label: { pt: 'Tempo de conjuração', en: 'Cast time' } },
  { tab: 'TraitTiers', label: { pt: 'Nível de facilidade', en: 'Trait tier' } },
  { tab: 'CostScales', label: { pt: 'Custo por', en: 'Cost per' } },
];
const text = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());

export function stateOf(pt: string, en: string, auto: string, manualFrom: string): TranslationState {
  if (en) return manualFrom && manualFrom !== pt ? 'outdated' : 'manual';
  return auto ? 'auto' : 'missing';
}

export function translationEntries(tables: Tables): TranslationEntry[] {
  const cache = new Map(tables.Translations.map((r) => [`${text(r.table)}|${text(r.id)}|${text(r.field)}`, r]));
  const out: TranslationEntry[] = [];
  const add = (type: string, table: TabName, keyColumn: string, id: string, field: string, enColumn: string, label: Label, context: string, pt: string, en: string) => {
    const cached = cache.get(`${table}|${id}|${field}`);
    const auto = text(cached?.auto_en);
    const manualFrom = text(cached?.manual_from);
    out.push({ type, table, id, keyColumn, field, enColumn, label, context, pt, en, auto, manualFrom, state: stateOf(pt, en, auto, manualFrom) });
  };

  for (const type of TYPES) {
    const live = tables[type.tab].filter((r) => text(r.id) && r.status !== 'deleted');
    const walk = (tab: TabName, fields: readonly Field[], rows: typeof live, contextOf: (row: (typeof live)[number]) => string) => {
      for (const f of fields) {
        if (f.type === 'subtable') {
          if (!f.childIds) continue;
          const parents = new Map(rows.map((r) => [text(r.id), r]));
          const children = tables[f.tab].filter((c) => parents.has(text(c[f.parentKey])) && text(c.id));
          walk(f.tab, f.fields, children, (c) => `${contextOf(parents.get(text(c[f.parentKey]))!)} · ${text(c.tier) || text(c.id)}`);
          continue;
        }
        if (!f.translatable) continue;
        for (const row of rows) {
          const pt = text(row[f.key]);
          if (pt) add(type.id, tab, 'id', text(row.id), f.key, englishKey(f), f.label, contextOf(row), pt, text(row[englishKey(f)]));
        }
      }
    };
    walk(type.tab, type.fields, live, (r) => text(r[type.nameKey]) || text(r.id));
  }

  for (const { tab, label } of LOOKUPS) {
    for (const row of tables[tab]) {
      const name = text(row.name);
      if (name) add('lookup', tab, 'name', name, 'name', 'name_en', label, label.pt, name, text(row.name_en));
    }
  }
  return out;
}
