/**
 * Every rule Wander Data follows, as plain data derived from the content types.
 *
 * Two things read this list: validate.ts runs it in TypeScript (the Editor's inline
 * warnings, tests), and sheet-validation.ts turns it into the Validation tab's formula.
 * Because both come from one list, the sheet and the Editor always flag the same rows.
 */
import { englishKey, type ContentType, type Field, type Options } from './define.ts';
import { TABS, type TabName } from './schema.ts';
import { CONTENT_TYPES } from './types.ts';

/** Which rows a check looks at, and which ID a problem is reported under. */
export interface Scope {
  tab: TabName;
  /** A column every real row has filled (empty rows are skipped). */
  presentKey: string;
  /** The ID a problem is reported under: the row's own, or its parent's. */
  idKey: string;
  /**
   * Rows that are deleted, or under a deleted row, are skipped. `parents` walks up from
   * the row: each step names the column holding the next row's ID and that row's tab,
   * and the last tab has the status (a level requirement → its level → its trait).
   */
  live: { statusKey: string } | { parents: { key: string; tab: TabName }[] } | null;
}

export type Check = { scope: Scope; level: 'error' | 'warning' } & (
  | { kind: 'missingName'; nameKey: string }
  | { kind: 'missingId'; keyColumn: string; detail: string }
  | { kind: 'duplicateId' }
  | { kind: 'duplicateName'; column: string }
  | { kind: 'required'; column: string }
  /** The target must exist and, unless allowDeleted, not be deleted. */
  | { kind: 'reference'; column: string; target: { tab: TabName; label: string }; allowDeleted?: boolean }
  | { kind: 'enum'; column: string; options: Options }
  | { kind: 'tags'; column: string; options: Options }
  | { kind: 'number'; column: string; integer?: boolean; min?: number }
  | { kind: 'recommended'; column: string; minLength: number; problem: string }
  | { kind: 'oneOf'; columns: readonly string[] }
  | { kind: 'cycle'; from: string; to: string; label: string }
  | { kind: 'origin'; column: string; origins: { tab: TabName; label: string }[] }
);

/** Omit that keeps each member of a union apart, so the check's kind still narrows. */
type CheckBody = Check extends infer C ? (C extends Check ? Omit<C, 'scope'> : never) : never;

/** The columns of a Modifiers row, the same for every type that has modifiers. */
export const MODIFIER_FIELDS: Field[] = [
  { key: 'stat', type: 'enum', options: { tab: 'Stats', column: 'code' }, required: true, label: { pt: 'Atributo', en: 'Stat' } },
  { key: 'value', type: 'number', integer: true, required: true, label: { pt: 'Valor', en: 'Value' } },
  { key: 'temporary', type: 'boolean', label: { pt: 'Temporário', en: 'Temporary' } },
];

const tabOf = (typeId: string) => CONTENT_TYPES.find((t) => t.id === typeId)!;
const lower = (text: string) => text.toLowerCase();

function fieldChecks(scope: Scope, fields: readonly Field[], owner: ContentType, out: Check[], origins: { tab: TabName; label: string }[]) {
  const add = (check: CheckBody) => out.push({ scope, ...check } as Check);
  for (const field of fields) {
    if (field.system) continue;
    if (field.type === 'modifiers') {
      origins.push({ tab: scope.tab, label: scope.tab === owner.tab ? lower(owner.label.singular.en) : `${lower(owner.label.singular.en)} level` });
      continue;
    }
    if (field.type === 'subtable') {
      const child: Scope = {
        tab: field.tab,
        presentKey: field.parentKey,
        idKey: field.childIds ? 'id' : field.parentKey,
        live: !scope.live ? null : { parents: [{ key: field.parentKey, tab: scope.tab }, ...('parents' in scope.live ? scope.live.parents : [])] },
      };
      // Each child row's parent must exist. A deleted parent keeps its children for a restore.
      out.push({ scope: { ...child, live: null }, level: 'error', kind: 'reference', column: field.parentKey, target: { tab: scope.tab, label: scope.tab === owner.tab ? lower(owner.label.singular.en) : `${lower(owner.label.singular.en)} level` }, allowDeleted: true });
      if (field.childIds) {
        // Reported under the parent's ID: the row has none of its own.
        out.push({ scope: { ...child, idKey: field.parentKey, live: null }, level: 'error', kind: 'missingId', keyColumn: field.parentKey, detail: `a ${lower(field.label.en).replace(/s$/, '')} of this ${lower(owner.label.singular.en)} has no ID` });
        out.push({ scope: { ...child, live: null }, level: 'error', kind: 'duplicateId' });
      }
      if (field.oneOf) out.push({ scope: child, level: 'error', kind: 'oneOf', columns: field.oneOf });
      fieldChecks(child, field.fields, owner, out, origins);
      for (const sub of field.fields) {
        if (sub.type === 'reference' && sub.to === owner.id) out.push({ scope: child, level: 'error', kind: 'cycle', from: field.parentKey, to: sub.key, label: lower(owner.label.singular.en) });
      }
      continue;
    }
    if (field.key === owner.nameKey && scope.tab === owner.tab) continue; // name has its own checks
    if (field.required) add({ kind: 'required', level: 'error', column: field.key });
    if (field.type === 'reference') {
      const target = typeof field.to === 'string' ? { tab: tabOf(field.to).tab, label: lower(tabOf(field.to).label.singular.en) } : { tab: field.to.tab, label: field.to.label.en };
      // A tab without a status (TraitLevels) has nothing deleted to point at.
      const allowDeleted = !(TABS[target.tab] as readonly string[]).includes('status');
      add({ kind: 'reference', level: 'error', column: field.key, target, allowDeleted });
    }
    if (field.type === 'enum') add({ kind: 'enum', level: 'error', column: field.key, options: field.options });
    if (field.type === 'tags' && field.options) add({ kind: 'tags', level: 'warning', column: field.key, options: field.options });
    if (field.type === 'number') add({ kind: 'number', level: 'error', column: field.key, integer: field.integer, min: field.min });
    if (field.recommended) {
      add({ kind: 'recommended', level: 'warning', column: field.key, minLength: field.type === 'richtext' ? field.minLength ?? 1 : 1, problem: `missing ${lower(field.label.en)}` });
    }
  }
}

export function allChecks(): Check[] {
  const out: Check[] = [];
  const origins: { tab: TabName; label: string }[] = [];
  for (const type of CONTENT_TYPES as readonly ContentType[]) {
    const statusKey = type.fields.some((f) => f.key === 'status') ? 'status' : null;
    const scope: Scope = { tab: type.tab, presentKey: 'id', idKey: 'id', live: statusKey ? { statusKey } : null };
    const nameField = type.fields.find((f) => f.key === type.nameKey)!;
    out.push({ scope, level: 'error', kind: 'missingName', nameKey: type.nameKey });
    out.push({ scope: { ...scope, presentKey: type.nameKey, idKey: type.nameKey, live: null }, level: 'error', kind: 'missingId', keyColumn: type.nameKey, detail: 'the row has a name but no ID' });
    out.push({ scope: { ...scope, live: null }, level: 'error', kind: 'duplicateId' });
    if (nameField.type === 'text' && nameField.unique) out.push({ scope, level: 'error', kind: 'duplicateName', column: type.nameKey });
    fieldChecks(scope, type.fields, type, out, origins);
  }
  // Modifiers rows belong to whichever row their origin_id names.
  const modifiers: Scope = { tab: 'Modifiers', presentKey: 'origin_id', idKey: 'origin_id', live: null };
  out.push({ scope: modifiers, level: 'error', kind: 'origin', column: 'origin_id', origins });
  for (const field of MODIFIER_FIELDS) {
    if (field.required) out.push({ scope: modifiers, level: 'error', kind: 'required', column: field.key });
    if (field.type === 'enum') out.push({ scope: modifiers, level: 'error', kind: 'enum', column: field.key, options: field.options });
    if (field.type === 'number') out.push({ scope: modifiers, level: 'error', kind: 'number', column: field.key, integer: field.integer, min: field.min });
  }
  return out;
}

/** The English columns of every translatable field, for the Translation screen. */
export function translatableFields(type: ContentType): { key: string; en: string; tab: TabName }[] {
  const out: { key: string; en: string; tab: TabName }[] = [];
  const walk = (tab: TabName, fields: readonly Field[]) => {
    for (const f of fields) {
      if (f.type === 'subtable') walk(f.tab, f.fields);
      else if (f.translatable) out.push({ key: f.key, en: englishKey(f), tab });
    }
  };
  walk(type.tab, type.fields);
  return out;
}
