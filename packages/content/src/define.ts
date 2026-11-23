/**
 * The shape of a content type: which tab holds it, how its IDs are made, and its
 * fields. The Editor's forms, the inline validation and the Validation tab's formula
 * are all generated from these definitions, so a content type is declared once.
 *
 * Field types follow the plan's list. attributePairs isn't here: stat requirements
 * became rows in StatRequirements, so they're a subtable like any other child rows.
 */
import { TABS, type TabName } from './schema.ts';

export interface Label {
  pt: string;
  en: string;
}

/** Where a dropdown's options come from: a fixed list, or a column of another tab. */
export type Options = readonly string[] | { tab: TabName; column: string };

interface FieldBase {
  /** The column in the content type's tab (or in the subtable's tab). */
  key: string;
  label: Label;
  /** Saving is refused while it's empty. */
  required?: boolean;
  /** A warning while it's empty, but the row can still be saved (a draft). */
  recommended?: boolean;
  /**
   * Player-facing Portuguese text. Its English lives in this column, filled by hand or
   * from the Translations cache. Defaults to `${key}_en`.
   */
  translatable?: boolean | { en: string };
  /** Kept by the app (edited_at, tree positions), never shown in the form. */
  system?: boolean;
}

export type Field = FieldBase &
  (
    | { type: 'text' | 'url' | 'color'; unique?: boolean; pattern?: RegExp }
    | { type: 'richtext'; minLength?: number }
    | { type: 'number'; integer?: boolean; min?: number }
    | { type: 'boolean' }
    | { type: 'enum'; options: Options }
    /** A comma-separated list ("Magia, Ataque"), each item from `options` when it has them. */
    | { type: 'tags'; options?: Options }
    /**
     * The ID of a row of another content type, or of rows that aren't a content type of
     * their own (a trait level, in TraitLevels).
     */
    | { type: 'reference'; to: string | { tab: TabName; label: Label } }
    /** Child rows in another tab, linked by `parentKey` (TraitLevels by trait_id). */
    | {
        type: 'subtable';
        tab: TabName;
        parentKey: string;
        /** Child rows with their own ID get `${parentId}.${n}`. */
        childIds?: boolean;
        fields: readonly Field[];
        /** Exactly one of these columns must be filled in each child row. */
        oneOf?: readonly string[];
      }
    /** Rows in Modifiers whose origin_id is this row's ID. */
    | { type: 'modifiers' }
  );

/** How a new row gets its ID. */
export type IdRule =
  /** Typed by hand (a discipline's three-letter code). */
  | { kind: 'manual'; pattern: RegExp }
  /** The next number of a Config counter, `${prefix}-NN`. The prefix can depend on the row. */
  | { kind: 'counter'; prefix: string | ((row: Record<string, unknown>) => string) };

export interface ContentType {
  id: string;
  tab: TabName;
  label: { singular: Label; plural: Label };
  ids: IdRule;
  /** The column that names a row. Unique among the type's rows that aren't deleted. */
  nameKey: string;
  fields: readonly Field[];
  /** Columns the Editor's list shows besides the name. */
  listColumns: readonly string[];
  /** Its row names become keywords in descriptions, without a Keywords row. */
  keywordSource?: boolean;
}

/**
 * Checks every column a type mentions against schema.ts, so a typo fails when it loads.
 * `const T` keeps the literal types (field keys, enum options), which entity.ts turns
 * into the type of a loaded row.
 */
export function defineContentType<const T extends ContentType>(type: T): T {
  const check = (tab: TabName, key: string, where: string) => {
    if (!(TABS[tab] as readonly string[]).includes(key)) throw new Error(`${type.id}: ${where} "${key}" is not a column of ${tab}`);
  };
  const walk = (tab: TabName, fields: readonly Field[]) => {
    for (const field of fields) {
      if (field.type === 'modifiers') continue;
      if (field.type === 'subtable') {
        check(field.tab, field.parentKey, 'parentKey');
        walk(field.tab, field.fields);
        for (const key of field.oneOf ?? []) check(field.tab, key, 'oneOf');
        continue;
      }
      check(tab, field.key, 'field');
      if (field.translatable) check(tab, englishKey(field), 'English column');
      if ((field.type === 'enum' || field.type === 'tags') && field.options && !Array.isArray(field.options)) {
        const { tab: from, column } = field.options as { tab: TabName; column: string };
        check(from, column, 'options column');
      }
    }
  };
  check(type.tab, 'id', 'id');
  check(type.tab, type.nameKey, 'nameKey');
  for (const key of type.listColumns) check(type.tab, key, 'list column');
  walk(type.tab, type.fields);
  return type;
}

export const englishKey = (field: Field) =>
  typeof field.translatable === 'object' ? field.translatable.en : `${field.key}_en`;

export const label = (pt: string, en: string): Label => ({ pt, en });
