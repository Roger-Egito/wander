/**
 * Loaded rows, typed from the content types. A content type's fields decide both the
 * TypeScript type of one of its rows (Entity) and how the row is read from the sheet
 * (loadEntities), so a new type in types.ts gets both without writing either.
 *
 * Each field becomes a property under its column name:
 *   - number: number | null (blank or not a number)
 *   - boolean: boolean
 *   - enum with a fixed list: one of the list's values ('' too when not required)
 *   - enum read from a tab, text, richtext, url, color, reference: string
 *   - tags: string[] (the comma-separated list, split)
 *   - subtable: the child rows, each typed the same way, with its parent key (and its id
 *     when the children have their own)
 *   - modifiers: the Modifiers rows whose origin_id is this row's id
 * A translatable field adds its English column (name_en) as a string.
 *
 * The types trust the data: a row the Validation tab flags (a status that isn't in the
 * list) is loaded as it is.
 */
import type { ContentType, Field } from './define.ts';
import { englishKey } from './define.ts';
import type { Row, Tables, TabName } from './schema.ts';
import { CONTENT_TYPES } from './types.ts';

export interface Modifier {
  stat: string;
  value: number;
  temporary: boolean;
}

/* --- types ----------------------------------------------------------------------- */

/** Flattens an intersection so editors show one plain object type. */
type Simplify<T> = { [K in keyof T]: T[K] } & {};

type EnglishKey<F> = F extends { translatable: { en: infer E extends string } }
  ? E
  : F extends { translatable: true; key: infer K extends string }
    ? `${K}_en`
    : never;

type ValueOf<F> = F extends { type: 'number' }
  ? number | null
  : F extends { type: 'boolean' }
    ? boolean
    : F extends { type: 'enum'; options: readonly (infer O extends string)[] }
      ? F extends { required: true } ? O : O | ''
      : F extends { type: 'tags' }
        ? string[]
        : F extends { type: 'subtable'; fields: infer C extends readonly Field[]; parentKey: infer P extends string }
          ? Simplify<(F extends { childIds: true } ? { id: string } : unknown) & { [K in P]: string } & FieldsOf<C>>[]
          : F extends { type: 'modifiers' }
            ? Modifier[]
            : string;

/** One property per field (under its key), plus the English column of each translatable one. */
type FieldsOf<Fs extends readonly Field[]> = { [F in Fs[number] as F['key']]: ValueOf<F> } & {
  [F in Fs[number] as EnglishKey<F>]: string;
};

/** A loaded row of a content type. */
export type Entity<T extends ContentType> = Simplify<{ id: string } & FieldsOf<T['fields']>>;

type Types = (typeof CONTENT_TYPES)[number];
/** The content type with this id, with its literal types. */
export type TypeOf<Id extends Types['id']> = Extract<Types, { id: Id }>;
/** Every content type's rows, by type id: entities.skill, entities.trait. */
export type Entities = { [T in Types as T['id']]: Entity<T>[] };

/* --- cell readers ---------------------------------------------------------------- */

type Cell = Row[string] | undefined;

export const text = (value: Cell) => (value === null || value === undefined ? '' : String(value).trim());

/** A number, or null for a blank cell or text that isn't one. */
export function num(value: Cell): number | null {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export const bool = (value: Cell) => value === true || text(value).toUpperCase() === 'TRUE';
export const list = (value: Cell) => text(value).split(',').map((part) => part.trim()).filter(Boolean);

/* --- loading --------------------------------------------------------------------- */

export interface LoadOptions {
  /** Keep rows whose status is "deleted" (the Editor's Lixeira needs them). */
  includeDeleted?: boolean;
}

/**
 * Reads every content type's rows from the tables. Child rows (levels, requirements) and
 * modifiers are attached to their parent, in the order they are in the sheet.
 */
export function loadEntities(tables: Tables, options: LoadOptions = {}): Entities {
  // Child rows by parent ID, one index per (tab, parent column), built when first needed.
  const indexes = new Map<string, Map<string, Row[]>>();
  const childrenOf = (tab: TabName, parentKey: string, id: string) => {
    const key = `${tab}.${parentKey}`;
    if (!indexes.has(key)) {
      const index = new Map<string, Row[]>();
      for (const row of tables[tab]) {
        const parent = text(row[parentKey]);
        if (parent) index.set(parent, [...(index.get(parent) ?? []), row]);
      }
      indexes.set(key, index);
    }
    return indexes.get(key)!.get(id) ?? [];
  };

  const modifiers = (id: string): Modifier[] =>
    childrenOf('Modifiers', 'origin_id', id).flatMap((row) => {
      const value = num(row.value);
      return text(row.stat) && value !== null ? [{ stat: text(row.stat), value, temporary: bool(row.temporary) }] : [];
    });

  function read(fields: readonly Field[], row: Row, ownId: string) {
    const out: Record<string, unknown> = {};
    for (const field of fields) {
      if (field.type === 'subtable') {
        out[field.key] = childrenOf(field.tab, field.parentKey, ownId).map((child) => {
          const childId = field.childIds ? text(child.id) : '';
          return { ...(field.childIds ? { id: childId } : {}), [field.parentKey]: ownId, ...read(field.fields, child, childId) };
        });
        continue;
      }
      if (field.type === 'modifiers') out[field.key] = ownId ? modifiers(ownId) : [];
      else if (field.type === 'number') out[field.key] = num(row[field.key]);
      else if (field.type === 'boolean') out[field.key] = bool(row[field.key]);
      else if (field.type === 'tags') out[field.key] = list(row[field.key]);
      else out[field.key] = text(row[field.key]);
      if (field.translatable) out[englishKey(field)] = text(row[englishKey(field)]);
    }
    return out;
  }

  const load = (type: ContentType) =>
    tables[type.tab]
      .filter((row) => text(row.id) && (options.includeDeleted || text(row.status) !== 'deleted'))
      .map((row) => ({ id: text(row.id), ...read(type.fields, row, text(row.id)) }));

  return Object.fromEntries(CONTENT_TYPES.map((type) => [type.id, load(type)])) as unknown as Entities;
}
