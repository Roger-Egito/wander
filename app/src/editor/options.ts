/**
 * The choices of an enum, tags or reference field, read from the current data. Cached
 * per read of the sheet (the tables object) and per field: a skill's requirement field
 * lists all 260 skills, and rebuilding that list on every keystroke was most of the
 * typing cost. A new read of the sheet is a new tables object, so the cache can't go stale.
 *
 * Labels follow the interface language: a row's English column, else its automatic
 * translation (Translations tab), else the Portuguese, as on the cards. The value stays
 * what the sheet stores (the Portuguese name, or the ID).
 *
 * Order (decided 2026-11-26): alphabetical by what the dropdown shows. Choices that come
 * in levels are grouped by level first, then alphabetical inside each group: skills by
 * their level, trait levels by their tier. Lists that are themselves a ladder keep their
 * order: status (most private to most public) and the trait tiers (worst to best).
 */
import { CONTENT_TYPES, STATUS, type ContentType, type Field, type Label, type Row, type Tables } from '@wander/content';
import { compareTiers, type Language } from '@wander/rules';
import { MESSAGES, type MessageKey } from '@wander/ui';

export interface Option {
  value: string;
  label: string;
  /** The level the choice belongs to, shown as a group heading. Options of a group are together. */
  group?: Label;
}

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));
const alphabetical = (a: string, b: string) => a.localeCompare(b, 'pt', { numeric: true, sensitivity: 'base' });
const byLabel = (a: Option, b: Option) => alphabetical(a.label, b.label);
const cache = new WeakMap<Tables, Map<Language, Map<Field, Option[] | null>>>();
const autoCache = new WeakMap<Tables, Map<string, string>>();

/** A row's text in the language: the English column, else its automatic translation, else the Portuguese. */
function inLanguage(tables: Tables, language: Language, tab: string, row: Row, column: string, enColumn = `${column}_en`) {
  const pt = text(row[column]).trim();
  if (language === 'pt') return pt;
  let auto = autoCache.get(tables);
  if (!auto) {
    autoCache.set(tables, (auto = new Map(tables.Translations.filter((r) => text(r.auto_en)).map((r) => [`${text(r.table)}|${text(r.id)}|${text(r.field)}`, text(r.auto_en)]))));
  }
  return text(row[enColumn]).trim() || auto.get(`${tab}|${text(row.id)}|${column}`) || pt;
}

/** The trait tiers from worst to best (by PD cost), as compareTiers orders them. */
const tierOrder = (tables: Tables) =>
  tables.TraitTiers.map((r) => ({ name: text(r.name).trim(), name_en: text(r.name_en).trim(), pd_cost: typeof r.pd_cost === 'number' ? r.pd_cost : null }))
    .filter((t) => t.name)
    .sort(compareTiers);

function compute(field: Field, tables: Tables, language: Language): Option[] | null {
  const fromTab = (tab: keyof Tables, column: string) => {
    // Lookup tabs (CastTimes, Categories...) keep their English in name_en.
    const seen = new Set<string>();
    const options: Option[] = [];
    for (const r of tables[tab]) {
      const value = text(r[column]).trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      options.push({ value, label: language === 'en' ? text(r[`${column}_en`]).trim() || value : value });
    }
    if (tab === 'TraitTiers') {
      const order = tierOrder(tables).map((t) => t.name);
      return options.sort((a, b) => order.indexOf(a.value) - order.indexOf(b.value));
    }
    return options.sort(byLabel);
  };
  if (field.type === 'enum' || (field.type === 'tags' && field.options)) {
    const options = field.options!;
    if (!Array.isArray(options)) return fromTab((options as { tab: keyof Tables }).tab, (options as { column: string }).column);
    const list = options as readonly string[];
    // Status is a ladder (most private to most public), shown by its translated name.
    if (list === STATUS) return STATUS.map((v) => ({ value: v, label: MESSAGES[language][`status.${v}` as MessageKey] ?? v }));
    return list.map((v) => ({ value: v, label: v })).sort(byLabel);
  }
  if (field.type === 'reference') {
    if (typeof field.to === 'string') {
      const type = (CONTENT_TYPES as readonly ContentType[]).find((t) => t.id === field.to)!;
      const rows = tables[type.tab].filter((r) => r.status !== 'deleted');
      const nameField = type.fields.find((f) => f.key === type.nameKey)!;
      const enColumn = typeof nameField.translatable === 'object' ? nameField.translatable.en : `${type.nameKey}_en`;
      const nameOf = (r: Row) => inLanguage(tables, language, type.tab, r, type.nameKey, enColumn);
      const option = (r: Row): Option => ({ value: text(r.id), label: `${text(r.id)} · ${nameOf(r)}` });
      const name = (o: Option) => o.label.slice(o.label.indexOf(' · ') + 3);
      // Rows with a level (skills) are grouped by it.
      if (!type.fields.some((f) => f.key === 'level')) return rows.map(option).sort((a, b) => alphabetical(name(a), name(b)));
      const level = (r: Row) => (typeof r.level === 'number' ? r.level : Infinity);
      return [...rows]
        .sort((a, b) => level(a) - level(b) || alphabetical(nameOf(a), nameOf(b)))
        .map((r) => ({ ...option(r), group: level(r) === Infinity ? { pt: 'Sem nível', en: 'No level' } : { pt: `Nível ${r.level}`, en: `Level ${r.level}` } }));
    }
    // A trait level, "FAC-14.2 · Mau-Cheiro Bom": grouped by tier, worst to best, then by trait name.
    const traitName = new Map(tables.Traits.map((t) => [text(t.id), inLanguage(tables, language, 'Traits', t, 'name')]));
    const tiers = tierOrder(tables);
    const tierIndex = (tier: string) => {
      const i = tiers.findIndex((t) => t.name === tier.trim());
      return i === -1 ? Infinity : i;
    };
    return [...tables[field.to.tab]]
      .sort((a, b) => tierIndex(text(a.tier)) - tierIndex(text(b.tier)) || alphabetical(traitName.get(text(a.trait_id)) ?? '', traitName.get(text(b.trait_id)) ?? ''))
      .map((r) => {
        const tier = tiers[tierIndex(text(r.tier))];
        const tierName = tier && language === 'en' ? tier.name_en || tier.name : text(r.tier);
        return {
          value: text(r.id),
          label: `${text(r.id)} · ${traitName.get(text(r.trait_id)) ?? ''} ${tierName}`.trim(),
          group: tier ? { pt: tier.name, en: tier.name_en || tier.name } : { pt: text(r.tier) || '?', en: text(r.tier) || '?' },
        };
      });
  }
  return null;
}

/** The options of a field in a language, cached per read of the sheet. */
export function optionsFor(field: Field, tables: Tables, language: Language): Option[] | null {
  let byLanguage = cache.get(tables);
  if (!byLanguage) cache.set(tables, (byLanguage = new Map()));
  let byField = byLanguage.get(language);
  if (!byField) byLanguage.set(language, (byField = new Map()));
  if (!byField.has(field)) byField.set(field, compute(field, tables, language));
  return byField.get(field)!;
}

/** Options split where their group changes, for <optgroup>s. Ungrouped options make one untitled run. */
export function groupRuns(options: Option[]): { group?: Label; options: Option[] }[] {
  const runs: { group?: Label; options: Option[] }[] = [];
  for (const o of options) {
    const last = runs[runs.length - 1];
    if (last && last.group?.pt === o.group?.pt) last.options.push(o);
    else runs.push({ group: o.group, options: [o] });
  }
  return runs;
}
