/**
 * The choices of an enum, tags or reference field, read from the current data. Cached
 * per read of the sheet (the tables object) and per field: a skill's requirement field
 * lists all 260 skills, and rebuilding that list on every keystroke was most of the
 * typing cost. A new read of the sheet is a new tables object, so the cache can't go stale.
 *
 * Order (decided 2026-11-26): alphabetical by what the dropdown shows. Choices that come
 * in levels are grouped by level first, then alphabetical inside each group: skills by
 * their level, trait levels by their tier. Lists that are themselves a ladder keep their
 * order: status (most private to most public) and the trait tiers (worst to best).
 */
import { CONTENT_TYPES, STATUS, type ContentType, type Field, type Label, type Row, type Tables } from '@wander/content';
import { compareTiers } from '@wander/rules';

export interface Option {
  value: string;
  label: string;
  /** The level the choice belongs to, shown as a group heading. Options of a group are together. */
  group?: Label;
}

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));
const alphabetical = (a: string, b: string) => a.localeCompare(b, 'pt', { numeric: true, sensitivity: 'base' });
const byLabel = (a: Option, b: Option) => alphabetical(a.label, b.label);
const cache = new WeakMap<Tables, Map<Field, Option[] | null>>();

/** Lists that are a ladder, not a set of names. */
const IN_ORDER: readonly (readonly string[])[] = [STATUS];

/** The trait tiers from worst to best (by PD cost), as compareTiers orders them. */
const tierOrder = (tables: Tables) =>
  tables.TraitTiers.map((r) => ({ name: text(r.name).trim(), name_en: text(r.name_en).trim(), pd_cost: typeof r.pd_cost === 'number' ? r.pd_cost : null }))
    .filter((t) => t.name)
    .sort(compareTiers);

function compute(field: Field, tables: Tables): Option[] | null {
  const fromTab = (tab: keyof Tables, column: string) => {
    const values = [...new Set(tables[tab].map((r) => text(r[column]).trim()).filter(Boolean))];
    if (tab === 'TraitTiers') {
      const order = tierOrder(tables).map((t) => t.name);
      return values.sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((v) => ({ value: v, label: v }));
    }
    return values.map((v) => ({ value: v, label: v })).sort(byLabel);
  };
  if (field.type === 'enum' || (field.type === 'tags' && field.options)) {
    const options = field.options!;
    if (!Array.isArray(options)) return fromTab((options as { tab: keyof Tables }).tab, (options as { column: string }).column);
    const list = (options as readonly string[]).map((v) => ({ value: v, label: v }));
    return IN_ORDER.includes(options as readonly string[]) ? list : list.sort(byLabel);
  }
  if (field.type === 'reference') {
    if (typeof field.to === 'string') {
      const type = (CONTENT_TYPES as readonly ContentType[]).find((t) => t.id === field.to)!;
      const rows = tables[type.tab].filter((r) => r.status !== 'deleted');
      const option = (r: Row): Option => ({ value: text(r.id), label: `${text(r.id)} · ${text(r[type.nameKey])}` });
      const name = (o: Option) => o.label.slice(o.label.indexOf(' · ') + 3);
      // Rows with a level (skills) are grouped by it.
      if (!type.fields.some((f) => f.key === 'level')) return rows.map(option).sort((a, b) => alphabetical(name(a), name(b)));
      const level = (r: Row) => (typeof r.level === 'number' ? r.level : Infinity);
      return [...rows]
        .sort((a, b) => level(a) - level(b) || alphabetical(text(a[type.nameKey]), text(b[type.nameKey])))
        .map((r) => ({ ...option(r), group: level(r) === Infinity ? { pt: 'Sem nível', en: 'No level' } : { pt: `Nível ${r.level}`, en: `Level ${r.level}` } }));
    }
    // A trait level, "FAC-14.2 · Mau-Cheiro Bom": grouped by tier, worst to best, then by trait name.
    const traitName = new Map(tables.Traits.map((t) => [text(t.id), text(t.name)]));
    const tiers = tierOrder(tables);
    const tierIndex = (tier: string) => {
      const i = tiers.findIndex((t) => t.name === tier.trim());
      return i === -1 ? Infinity : i;
    };
    return [...tables[field.to.tab]]
      .sort((a, b) => tierIndex(text(a.tier)) - tierIndex(text(b.tier)) || alphabetical(traitName.get(text(a.trait_id)) ?? '', traitName.get(text(b.trait_id)) ?? ''))
      .map((r) => {
        const tier = tiers[tierIndex(text(r.tier))];
        return {
          value: text(r.id),
          label: `${text(r.id)} · ${traitName.get(text(r.trait_id)) ?? ''} ${text(r.tier)}`.trim(),
          group: tier ? { pt: tier.name, en: tier.name_en || tier.name } : { pt: text(r.tier) || '?', en: text(r.tier) || '?' },
        };
      });
  }
  return null;
}

export function optionsFor(field: Field, tables: Tables): Option[] | null {
  let byField = cache.get(tables);
  if (!byField) cache.set(tables, (byField = new Map()));
  if (!byField.has(field)) byField.set(field, compute(field, tables));
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
