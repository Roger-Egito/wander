/**
 * What a bulk action touches besides the selected rows, for its confirmation:
 *   - dependentsOf: rows elsewhere that point at them (a skill requiring a selected
 *     skill, a skill of a selected discipline, a level requirement pointing at a
 *     selected trait's level). Deleting leaves those pointing at nothing, which the
 *     Validation tab then reports.
 *   - goesWith: the rows a permanent delete removes along with them (levels,
 *     requirements, modifiers, Translations rows).
 * Both read the content types, so a new reference field is covered without code here.
 */
import { CONTENT_TYPES, type ContentType, type Field, type Label, type Row, type TabName, type Tables } from '@wander/content';

export interface Dependent {
  /** The row that points at a selected one: its own ID, or its parent's for a child row. */
  id: string;
  name: string;
  /** The field that points, by its label. */
  via: Label;
  /** The selected row (or level) it points at. */
  target: string;
}

const TYPES = CONTENT_TYPES as readonly ContentType[];
const text = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());

/** The selected IDs plus the IDs of their child rows that have their own (levels). */
function subtree(tables: Tables, type: ContentType, ids: string[]) {
  const all = new Set(ids);
  const tabs = new Set<TabName>([type.tab]);
  const walk = (fields: readonly Field[], parents: Set<string>) => {
    for (const f of fields) {
      if (f.type !== 'subtable' || !f.childIds) continue;
      tabs.add(f.tab);
      const children = new Set(tables[f.tab].filter((r) => parents.has(text(r[f.parentKey]))).map((r) => text(r.id)));
      children.forEach((c) => all.add(c));
      walk(f.fields, children);
    }
  };
  walk(type.fields, new Set(ids));
  return { ids: all, tabs };
}

export function dependentsOf(tables: Tables, type: ContentType, ids: string[]): Dependent[] {
  const { ids: targets, tabs: targetTabs } = subtree(tables, type, ids);
  const out: Dependent[] = [];
  for (const owner of TYPES) {
    const names = new Map(tables[owner.tab].map((r) => [text(r.id), text(r[owner.nameKey])]));
    // Rows of `tab`, owned by `ownerOf(row)`, checked against every reference among `fields`.
    const walk = (tab: TabName, fields: readonly Field[], ownerOf: (row: Row) => string) => {
      for (const f of fields) {
        if (f.type === 'subtable') {
          walk(f.tab, f.fields, f.childIds ? (r) => text(r[f.parentKey]) : (r) => ownerOf(tables[tab].find((p) => text(p.id) === text(r[f.parentKey])) ?? { id: r[f.parentKey] }));
          continue;
        }
        if (f.type !== 'reference') continue;
        const targetTab = typeof f.to === 'string' ? TYPES.find((t) => t.id === f.to)!.tab : f.to.tab;
        if (!targetTabs.has(targetTab)) continue;
        for (const row of tables[tab]) {
          const target = text(row[f.key]);
          const id = tab === owner.tab ? text(row.id) : ownerOf(row);
          // A selected row pointing inside its own selection (a trait's level requiring
          // its other level) goes with it, so it isn't a dependent.
          if (!target || !targets.has(target) || targets.has(id) || ids.includes(id)) continue;
          out.push({ id, name: names.get(id) ?? '', via: f.label, target });
        }
      }
    };
    walk(owner.tab, owner.fields, (r) => text(r.id));
  }
  return out;
}

/** How many rows of each tab a permanent delete removes along with the selected ones. */
export function goesWith(tables: Tables, type: ContentType, ids: string[]): Partial<Record<TabName, number>> {
  const counts: Partial<Record<TabName, number>> = {};
  const add = (tab: TabName, n: number) => n && (counts[tab] = (counts[tab] ?? 0) + n);
  const all = new Set(ids);
  const walk = (fields: readonly Field[], parents: Set<string>) => {
    for (const f of fields) {
      if (f.type === 'modifiers') add('Modifiers', tables.Modifiers.filter((r) => parents.has(text(r.origin_id))).length);
      if (f.type !== 'subtable') continue;
      const rows = tables[f.tab].filter((r) => parents.has(text(r[f.parentKey])));
      add(f.tab, rows.length);
      if (f.childIds) {
        const children = new Set(rows.map((r) => text(r.id)));
        children.forEach((c) => all.add(c));
        walk(f.fields, children);
      }
    }
  };
  walk(type.fields, new Set(ids));
  add('Translations', tables.Translations.filter((r) => all.has(text(r.id))).length);
  return counts;
}
