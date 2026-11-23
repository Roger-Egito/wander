/**
 * The Editor's working copy of one row, and what it means for the rest of the data.
 * Pure functions over Tables, so they're tested without React or the Sheets API.
 *
 *   - draftFrom: a row and everything under it (levels, requirements, modifiers), as the
 *     form edits it.
 *   - mergeDraft: the Tables as they'd be if the draft were saved, so the preview and
 *     the inline validation show the unsaved state with the same code as saved data.
 *   - changes: what to send to the adapter.
 *
 * Child rows replace their parent's old ones on save, the same rule the adapter follows.
 */
import { CONTENT_TYPES, englishKey, validate, type ContentType, type Field, type Problem, type Row, type TabName, type Tables } from '@wander/content';
import { PENDING_ID, type ChildRow, type Children, type RowValues } from '../adapters/sheets/adapter.ts';
import type { CellValue } from '../adapters/sheets/transport.ts';

export { PENDING_ID };

export interface Draft {
  values: RowValues;
  children: Children;
}

export const typeById = (id: string) => (CONTENT_TYPES as readonly ContentType[]).find((t) => t.id === id)!;
const text = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());

/** The columns a form edits for these fields: each field's own, plus the English column of a translatable one. */
export function columnsOf(fields: readonly Field[]) {
  return fields.flatMap((f) => (f.type === 'subtable' || f.type === 'modifiers' ? [] : f.translatable ? [f.key, englishKey(f)] : [f.key]));
}

const cell = (value: Row[string] | undefined): CellValue => (value === undefined ? '' : value);

function childrenOf(fields: readonly Field[], tables: Tables, parentId: string): Children {
  const out: Children = {};
  for (const f of fields) {
    if (f.type === 'modifiers') {
      out.modifiers = tables.Modifiers.filter((r) => text(r.origin_id) === parentId).map((r) => ({
        stat: cell(r.stat), value: cell(r.value), temporary: r.temporary === true || text(r.temporary).toUpperCase() === 'TRUE',
      }));
    }
    if (f.type !== 'subtable') continue;
    out[f.key] = tables[f.tab].filter((r) => text(r[f.parentKey]) === parentId).map((r) => {
      const row: ChildRow = Object.fromEntries(columnsOf(f.fields).map((c) => [c, cell(r[c])]));
      if (f.childIds) {
        row.id = text(r.id);
        const nested = childrenOf(f.fields, tables, text(r.id));
        if (Object.keys(nested).length) row.children = nested;
      }
      return row;
    });
  }
  return out;
}

/** A saved row as a draft. */
export function draftFrom(type: ContentType, tables: Tables, id: string): Draft {
  const row = tables[type.tab].find((r) => text(r.id) === id) ?? {};
  const values: RowValues = { id };
  for (const c of columnsOf(type.fields)) values[c] = cell(row[c]);
  return { values, children: childrenOf(type.fields, tables, id) };
}

/** A blank draft with the defaults a new row starts with. */
export function emptyDraft(type: ContentType, defaults: RowValues = {}): Draft {
  const values: RowValues = { id: PENDING_ID };
  for (const c of columnsOf(type.fields)) values[c] = '';
  if ('status' in values) values.status = 'draft';
  if ('source' in values) values.source = 'Wander';
  const children: Children = {};
  for (const f of type.fields) {
    if (f.type === 'subtable') children[f.key] = [];
    if (f.type === 'modifiers') children.modifiers = [];
  }
  return { values: { ...values, ...defaults }, children };
}

/** The Tables with the draft saved: its row replaced (or added) and its children replacing the old ones. */
export function mergeDraft(tables: Tables, type: ContentType, draft: Draft): Tables {
  const out = { ...tables } as Tables;
  const id = text(draft.values.id);
  const touch = (tab: TabName) => (out[tab] === tables[tab] ? (out[tab] = [...tables[tab]]) : out[tab]);

  const rows = touch(type.tab);
  const at = rows.findIndex((r) => text(r.id) === id);
  const merged = { ...(at >= 0 ? rows[at] : {}), ...draft.values } as Row;
  if (at >= 0) rows[at] = merged;
  else rows.push(merged);

  const removeUnder = (fields: readonly Field[], parentId: string) => {
    for (const f of fields) {
      if (f.type === 'modifiers') out.Modifiers = touch('Modifiers').filter((r) => text(r.origin_id) !== parentId);
      if (f.type !== 'subtable') continue;
      const under = touch(f.tab).filter((r) => text(r[f.parentKey]) === parentId);
      out[f.tab] = out[f.tab].filter((r) => text(r[f.parentKey]) !== parentId);
      if (f.childIds) for (const r of under) removeUnder(f.fields, text(r.id));
    }
  };
  const add = (fields: readonly Field[], parentId: string, given: Children) => {
    for (const [key, children] of Object.entries(given)) {
      if (key === 'modifiers') {
        out.Modifiers = touch('Modifiers').filter((r) => text(r.origin_id) !== parentId);
        out.Modifiers.push(...children.map(({ children: _, ...c }) => ({ ...c, origin_id: parentId }) as Row));
        continue;
      }
      const field = fields.find((f) => f.key === key);
      if (field?.type !== 'subtable') continue;
      removeUnder([field], parentId);
      for (const child of children) {
        const { children: nested, ...columns } = child;
        touch(field.tab).push({ ...columns, [field.parentKey]: parentId } as Row);
        if (field.childIds && nested) add(field.fields, text(child.id), nested);
      }
    }
  };
  add(type.fields, id, draft.children);
  return out;
}

/** Every ID a draft's problems can be reported under: its own and its children's. */
function idsIn(draft: Draft) {
  const ids = [text(draft.values.id)];
  const walk = (children: Children) => {
    for (const rows of Object.values(children)) for (const row of rows) if (row.id) { ids.push(text(row.id)); if (row.children) walk(row.children); }
  };
  walk(draft.children);
  return ids;
}

/** The Validation tab's problems for this draft, as if it were saved. */
export function problemsFor(tables: Tables, type: ContentType, draft: Draft): Problem[] {
  const ids = new Set(idsIn(draft));
  return validate(mergeDraft(tables, type, draft)).filter((p) => ids.has(p.id));
}

/** The main row's columns that differ from the saved draft. */
export function changedValues(saved: Draft, draft: Draft): RowValues {
  return Object.fromEntries(Object.entries(draft.values).filter(([column, value]) => column !== 'id' && value !== saved.values[column]));
}

export const childrenChanged = (saved: Draft, draft: Draft) => JSON.stringify(saved.children) !== JSON.stringify(draft.children);
export const isDirty = (saved: Draft, draft: Draft) => Object.keys(changedValues(saved, draft)).length > 0 || childrenChanged(saved, draft);

/** The next ID for a new child (a trait level): one past the highest of its siblings. */
export function nextChildId(parentId: string, siblings: ChildRow[]) {
  const numbers = siblings.map((s) => Number(text(s.id).slice(parentId.length + 1)) || 0);
  return `${parentId}.${Math.max(0, ...numbers) + 1}`;
}
