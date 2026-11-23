/**
 * Which rows typed by hand in the grid need an ID, and which ID each gets. Pure: it
 * takes a tab's cells and the Config counters and returns what to write, so it's tested
 * without Apps Script.
 *
 * The rules come from the content types (@wander/content), the same ones the Editor's
 * adapter follows:
 *   - a counter type (Skills, Conditions, Traits, Keywords) gets `${prefix}-NN` from
 *     Config next_id_<prefix> once its name is filled (and, for a skill, its discipline,
 *     which is the prefix),
 *   - a child row with its own ID (a trait level) gets `${parent}.${n}` once its parent
 *     is filled, n being one past the highest of its siblings.
 * A counter that's behind the sheet is skipped forward instead of making a duplicate.
 */
import { CONTENT_TYPES, type ContentType, type Field } from '@wander/content';

export type Cell = string | number | boolean | Date | null | undefined;

export interface Assignment {
  /** Index into the data rows (0 is the row under the header). */
  row: number;
  id: string;
}

export interface IdPlan {
  ids: Assignment[];
  /** Config keys to set: next_id_FOG → its new value. */
  counters: Record<string, number>;
}

const text = (value: Cell) => (value === null || value === undefined ? '' : String(value).trim());
const pad = (n: number) => String(n).padStart(2, '0');

type ChildRule = { parentKey: string };

function ruleFor(tab: string): { type: ContentType } | { child: ChildRule } | null {
  for (const type of CONTENT_TYPES as readonly ContentType[]) {
    if (type.tab === tab) return type.ids.kind === 'counter' ? { type } : null;
    const walk = (fields: readonly Field[]): ChildRule | null => {
      for (const f of fields) {
        if (f.type !== 'subtable') continue;
        if (f.tab === tab) return f.childIds ? { parentKey: f.parentKey } : null;
        const found = walk(f.fields);
        if (found) return found;
      }
      return null;
    };
    const child = walk(type.fields);
    if (child) return { child };
  }
  return null;
}

/**
 * The IDs to write in a tab. `onlyRows` limits it to rows just edited (onEdit);
 * without it every row missing an ID is filled ("Gerar IDs faltantes").
 */
export function planIds(tab: string, header: string[], rows: Cell[][], counters: Record<string, number>, onlyRows?: number[]): IdPlan {
  const plan: IdPlan = { ids: [], counters: {} };
  const rule = ruleFor(tab);
  const idColumn = header.indexOf('id');
  if (!rule || idColumn < 0) return plan;
  const value = (row: Cell[], column: string) => text(row[header.indexOf(column)]);
  const used = new Set(rows.map((r) => text(r[idColumn])).filter(Boolean));
  const candidates = (onlyRows ?? rows.map((_, i) => i)).filter((i) => rows[i] && !text(rows[i][idColumn]));

  if ('child' in rule) {
    for (const i of candidates) {
      const parent = value(rows[i], rule.child.parentKey);
      if (!parent) continue;
      const siblings = [...used].filter((id) => id.startsWith(`${parent}.`)).map((id) => Number(id.slice(parent.length + 1)) || 0);
      const id = `${parent}.${Math.max(0, ...siblings) + 1}`;
      used.add(id);
      plan.ids.push({ row: i, id });
    }
    return plan;
  }

  const { type } = rule;
  if (type.ids.kind !== 'counter') return plan;
  for (const i of candidates) {
    if (!value(rows[i], type.nameKey)) continue;
    const record = Object.fromEntries(header.map((h, c) => [h, rows[i][c]]));
    const rule = type.ids;
    const prefix: string = typeof rule.prefix === 'function' ? rule.prefix(record) : rule.prefix;
    if (!prefix) continue;
    const key = `next_id_${prefix}`;
    const highest = Math.max(0, ...[...used].filter((id) => id.startsWith(`${prefix}-`)).map((id) => Number(id.slice(prefix.length + 1)) || 0));
    let next = plan.counters[key] ?? counters[key] ?? highest + 1;
    while (used.has(`${prefix}-${pad(next)}`)) next++;
    const id = `${prefix}-${pad(next)}`;
    used.add(id);
    plan.ids.push({ row: i, id });
    plan.counters[key] = next + 1;
  }
  return plan;
}

/** Tabs whose rows get IDs from planIds. */
export const ID_TABS = (CONTENT_TYPES as readonly ContentType[]).flatMap((type) => {
  const tabs: string[] = type.ids.kind === 'counter' ? [type.tab] : [];
  const walk = (fields: readonly Field[]) => {
    for (const f of fields) if (f.type === 'subtable') { if (f.childIds) tabs.push(f.tab); walk(f.fields); }
  };
  walk(type.fields);
  return tabs;
});
