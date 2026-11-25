/**
 * Who sees which content. The Editor reads the sheet itself, so admins see every row,
 * drafts and deleted ones included. Everyone else gets what `visibleTables` builds for
 * their audience from a full read of Wander Data:
 *
 *   - public: playtest and official rows.
 *   - alpha (the Alpha group): alpha rows too, for content tried out in our own games
 *     (adapted from other games, or not ready for everyone).
 *
 * For an audience:
 *   - A content row is visible when its status is one the audience sees and every
 *     required reference it has points at a visible row. A playtest skill of an alpha
 *     discipline stays out of the public data along with its discipline (reported in
 *     `withheld`).
 *   - Child rows (trait levels, requirements), modifiers and Translations rows go with
 *     the row they belong to.
 *   - A visible row that points at a hidden one through a child row (a requirement on a
 *     draft skill) or an optional reference loses that link. Its rules would then differ
 *     from the Editor's, so each one is reported in `lostLinks`.
 *   - Lookup tabs and releases are visible. Config keeps only the display settings, and
 *     every other tab (Validation, anything added later) stays hidden until listed here.
 */
import type { ContentType, Field } from './define.ts';
import { emptyTables, type Row, type Status, type TabName, type Tables } from './schema.ts';
import { CONTENT_TYPES } from './types.ts';

export const AUDIENCES = {
  public: ['playtest', 'official'],
  alpha: ['alpha', 'playtest', 'official'],
} as const satisfies Record<string, readonly Status[]>;
export type Audience = keyof typeof AUDIENCES;

const SHARED_TABS: readonly TabName[] = ['Stats', 'CastTimes', 'CostScales', 'Categories', 'TraitTiers', 'Releases'];
const SHARED_CONFIG = ['req_display'];

export interface Withheld {
  table: TabName;
  id: string;
  /** The hidden row its required reference points at. */
  because: string;
}

export interface LostLink {
  /** The visible row that loses the link (the owner, for a child row). */
  table: TabName;
  id: string;
  /** Where the link was: the child tab, or the row's own tab. */
  via: TabName;
  field: string;
  target: string;
}

export interface VisibleContent {
  tables: Tables;
  withheld: Withheld[];
  lostLinks: LostLink[];
}

const TYPES = CONTENT_TYPES as readonly ContentType[];
const fold = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim().toLowerCase());
const text = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());

type Reference = Extract<Field, { type: 'reference' }>;
const references = (fields: readonly Field[]) => fields.filter((f): f is Reference => f.type === 'reference');

export function visibleTables(data: Tables, audience: Audience): VisibleContent {
  const statuses: readonly string[] = AUDIENCES[audience];
  const tables = emptyTables();
  const withheld: Withheld[] = [];
  const lostLinks: LostLink[] = [];

  // Visible rows of each content type. A row whose required reference points at a
  // hidden row is hidden too, which can hide other rows in turn.
  const rows = new Map(TYPES.map((t) => [t.id, data[t.tab].filter((r) => statuses.includes(fold(r.status)))]));
  const ids = (typeId: string) => new Set(rows.get(typeId)!.map((r) => fold(r.id)));
  for (let changed = true; changed; ) {
    changed = false;
    for (const type of TYPES) {
      for (const field of references(type.fields)) {
        if (!field.required || typeof field.to !== 'string') continue;
        const targets = ids(field.to);
        const keep = rows.get(type.id)!.filter((row) => {
          if (targets.has(fold(row[field.key]))) return true;
          withheld.push({ table: type.tab, id: text(row.id), because: text(row[field.key]) });
          return false;
        });
        if (keep.length === rows.get(type.id)!.length) continue;
        rows.set(type.id, keep);
        changed = true;
      }
    }
  }

  // Child rows that have their own ID (trait levels), found by parent alone, so a
  // reference to one can be checked before the walk below reaches its tab.
  const childIds = new Map<TabName, Set<string>>();
  const collect = (fields: readonly Field[], parents: Set<string>) => {
    for (const f of fields) {
      if (f.type !== 'subtable') continue;
      const children = data[f.tab].filter((r) => parents.has(fold(r[f.parentKey])));
      if (f.childIds) childIds.set(f.tab, new Set([...(childIds.get(f.tab) ?? []), ...children.map((r) => fold(r.id))]));
      collect(f.fields, new Set(children.map((r) => fold(r.id))));
    }
  };
  for (const type of TYPES) collect(type.fields, ids(type.id));
  const isVisible = (field: Reference, value: unknown) =>
    typeof field.to === 'string' ? ids(field.to).has(fold(value)) : (childIds.get(field.to.tab)?.has(fold(value)) ?? false);

  // Every visible row with an ID, as `${tab}|${id}`, for modifiers and Translations.
  const kept = new Set<string>();
  const keep = (tab: TabName, row: Row) => {
    tables[tab].push(row);
    if (text(row.id)) kept.add(`${tab}|${fold(row.id)}`);
  };

  // Owners are kept as `${tab}|${id}` so a child row's report names the top-level row.
  const ownerOf = (owner: string) => {
    const [table, id] = owner.split('|');
    return { table: table as TabName, id };
  };
  const walk = (fields: readonly Field[], parents: Map<string, string>) => {
    for (const f of fields) {
      if (f.type !== 'subtable') continue;
      const next = new Map<string, string>();
      for (const row of data[f.tab]) {
        const owner = parents.get(fold(row[f.parentKey]));
        if (owner === undefined) continue;
        const broken = references(f.fields).find((r) => text(row[r.key]) && !isVisible(r, row[r.key]));
        if (broken) {
          lostLinks.push({ ...ownerOf(owner), via: f.tab, field: broken.key, target: text(row[broken.key]) });
          continue;
        }
        keep(f.tab, row);
        if (f.childIds) next.set(fold(row.id), owner);
      }
      walk(f.fields, next);
    }
  };

  for (const type of TYPES) {
    const optional = references(type.fields).filter((f) => !f.required);
    for (const original of rows.get(type.id)!) {
      const row = { ...original };
      for (const f of optional) {
        if (!text(row[f.key]) || isVisible(f, row[f.key])) continue;
        lostLinks.push({ table: type.tab, id: text(row.id), via: type.tab, field: f.key, target: text(row[f.key]) });
        row[f.key] = '';
      }
      keep(type.tab, row);
    }
    walk(type.fields, new Map(rows.get(type.id)!.map((r) => [fold(r.id), `${type.tab}|${text(r.id)}`])));
  }

  const keptIds = new Set([...kept].map((key) => key.slice(key.indexOf('|') + 1)));
  tables.Modifiers = data.Modifiers.filter((r) => keptIds.has(fold(r.origin_id)));
  tables.Translations = data.Translations.filter((r) => kept.has(`${text(r.table)}|${fold(r.id)}`));
  for (const tab of SHARED_TABS) tables[tab] = [...data[tab]];
  tables.Config = data.Config.filter((r) => SHARED_CONFIG.includes(text(r.key)));
  return { tables, withheld, lostLinks };
}
