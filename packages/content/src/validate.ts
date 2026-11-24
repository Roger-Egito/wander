/**
 * Runs the checks from checks.ts over Wander Data in TypeScript: the Editor's inline
 * warnings, and the tests. sheet-validation.ts runs the same checks as a sheet formula.
 *
 * Comparisons ignore case, the way Google Sheets compares (=, XMATCH, COUNTIF), so both
 * sides flag exactly the same rows.
 */
import { allChecks, type Check, type Scope } from './checks.ts';
import type { Options } from './define.ts';
import type { Row, TabName, Tables } from './schema.ts';

export interface Problem {
  level: 'error' | 'warning';
  problem: string;
  table: TabName;
  id: string;
  detail: string;
}

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));
// Plain toLowerCase: Portuguese has no special lowercasing rules (only languages like
// Turkish and Lithuanian do), so it matches toLocaleLowerCase('pt-BR') here, and it's
// many times faster in browsers, which matters for a check that runs on every edit.
const fold = (v: unknown) => text(v).toLowerCase();
const isBlank = (v: unknown) => text(v) === '';

/** The words used in problems, shared with the formula so both read the same. */
export const PROBLEM = {
  missingName: 'missing name',
  missingId: 'missing ID',
  duplicateId: 'duplicate ID',
  duplicateName: 'duplicate name',
  required: 'missing value',
  reference: 'missing reference',
  unknown: 'unknown value',
  notNumber: 'not a number',
  badNumber: 'invalid number',
  oneOf: 'incomplete row',
  cycle: 'requirement cycle',
} as const;

export const numberRule = (integer?: boolean, min?: number) =>
  [integer ? 'a whole number' : 'a number', min !== undefined ? `of at least ${min}` : ''].filter(Boolean).join(' ');

export function validate(data: Tables): Problem[] {
  const problems: Problem[] = [];
  const optionValues = (options: Options) =>
    new Set((Array.isArray(options) ? options : data[(options as { tab: TabName }).tab].map((r) => r[(options as { column: string }).column])).map(fold));
  const idSet = (tab: TabName, liveOnly: boolean) =>
    new Set(data[tab].filter((r) => !liveOnly || fold(r.status) !== 'deleted').map((r) => fold(r.id)));
  // Rows by folded ID, one index per tab, built the first time a check needs it. Finding
  // a child row's parent by scanning the parent tab, once per child per check, was
  // hundreds of thousands of comparisons: about a second in a browser.
  const indexes = new Map<TabName, Map<string, Row>>();
  const byId = (tab: TabName) => {
    let index = indexes.get(tab);
    if (!index) indexes.set(tab, (index = new Map(data[tab].map((r) => [fold(r.id), r]))));
    return index;
  };

  for (const check of allChecks()) {
    const { scope } = check;
    const rows = data[scope.tab].filter((r) => !isBlank(r[scope.presentKey]) && isLive(scope, r, byId));
    const report = (row: Row, problem: string, detail: string) =>
      problems.push({ level: check.level, problem, table: scope.tab, id: text(row[scope.idKey]), detail });

    switch (check.kind) {
      case 'missingName':
        for (const r of rows) if (isBlank(r[check.nameKey])) report(r, PROBLEM.missingName, 'the row has an ID but no name');
        break;
      case 'missingId':
        for (const r of rows) if (isBlank(r.id)) report(r, PROBLEM.missingId, check.detail);
        break;
      case 'duplicateId': {
        const counts = countBy(rows, (r) => fold(r.id));
        for (const r of rows) if ((counts.get(fold(r.id)) ?? 0) > 1) report(r, PROBLEM.duplicateId, 'more than one row has this ID');
        break;
      }
      case 'duplicateName': {
        const named = rows.filter((r) => !isBlank(r[check.column]));
        const counts = countBy(named, (r) => fold(r[check.column]));
        for (const r of named) if ((counts.get(fold(r[check.column])) ?? 0) > 1) report(r, PROBLEM.duplicateName, `${text(r[check.column])} is the name of another row`);
        break;
      }
      case 'required':
        for (const r of rows) if (isBlank(r[check.column])) report(r, PROBLEM.required, `${check.column} is empty`);
        break;
      case 'reference': {
        const existing = idSet(check.target.tab, false);
        const live = idSet(check.target.tab, true);
        for (const r of rows) {
          const v = r[check.column];
          if (isBlank(v)) continue;
          if (!existing.has(fold(v))) report(r, PROBLEM.reference, `${check.column} ${text(v)} is not a ${check.target.label}`);
          else if (!check.allowDeleted && !live.has(fold(v))) report(r, PROBLEM.reference, `${check.column} ${text(v)} is deleted`);
        }
        break;
      }
      case 'enum': {
        const allowed = optionValues(check.options);
        for (const r of rows) {
          const v = r[check.column];
          if (!isBlank(v) && !allowed.has(fold(v))) report(r, PROBLEM.unknown, `${check.column} ${text(v)} is not in ${optionsName(check.options)}`);
        }
        break;
      }
      case 'tags': {
        const allowed = optionValues(check.options);
        for (const r of rows) {
          const missing = splitTags(r[check.column]).filter((t) => !allowed.has(fold(t)));
          if (missing.length) report(r, PROBLEM.unknown, `${check.column} has values not in ${optionsName(check.options)}: ${missing.join(', ')}`);
        }
        break;
      }
      case 'number':
        for (const r of rows) {
          const v = r[check.column];
          if (isBlank(v)) continue;
          if (typeof v !== 'number') report(r, PROBLEM.notNumber, `${check.column} is not a number`);
          else if ((check.integer && !Number.isInteger(v)) || (check.min !== undefined && v < check.min)) {
            report(r, PROBLEM.badNumber, `${check.column} must be ${numberRule(check.integer, check.min)}`);
          }
        }
        break;
      case 'recommended':
        for (const r of rows) {
          if (text(r[check.column]).trim().length < check.minLength) {
            report(r, check.problem, check.minLength > 1 ? `${check.column} is empty or under ${check.minLength} characters` : `${check.column} is empty`);
          }
        }
        break;
      case 'oneOf':
        for (const r of rows) {
          if (check.columns.filter((c) => !isBlank(r[c])).length !== 1) report(r, PROBLEM.oneOf, `fill exactly one of ${check.columns.join(' and ')}`);
        }
        break;
      case 'cycle':
        for (const id of inCycles(rows, check.from, check.to)) {
          problems.push({ level: check.level, problem: PROBLEM.cycle, table: scope.tab, id, detail: `this ${check.label} ends up requiring itself` });
        }
        break;
      case 'origin': {
        const known = new Set(check.origins.flatMap((o) => data[o.tab].map((r) => fold(r.id))));
        const names = check.origins.map((o) => o.label).join(' or ');
        for (const r of rows) if (!known.has(fold(r[check.column]))) report(r, PROBLEM.reference, `${check.column} ${text(r[check.column])} is not a ${names}`);
        break;
      }
    }
  }
  return problems;
}

function isLive(scope: Scope, row: Row, byId: (tab: TabName) => Map<string, Row>) {
  if (!scope.live) return true;
  if ('statusKey' in scope.live) return fold(row[scope.live.statusKey]) !== 'deleted';
  let current: Row | undefined = row;
  for (const { key, tab } of scope.live.parents) current = current && byId(tab).get(fold(current[key]));
  return fold(current?.status) !== 'deleted';
}

export const optionsName = (options: Options) =>
  Array.isArray(options) ? `the list (${options.join(', ')})` : (options as { tab: string }).tab;

export const splitTags = (value: unknown) => text(value).split(',').map((t) => t.trim()).filter(Boolean);

function countBy<T>(items: T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

/** The IDs that can reach themselves through from → to links, in first-seen order. */
function inCycles(rows: Row[], from: string, to: string) {
  const edges = new Map<string, string[]>();
  const original = new Map<string, string>();
  for (const r of rows) {
    if (isBlank(r[to])) continue;
    const a = fold(r[from]);
    original.set(a, text(r[from]));
    edges.set(a, [...(edges.get(a) ?? []), fold(r[to])]);
  }
  const reaches = (start: string) => {
    const seen = new Set<string>();
    const stack = [...(edges.get(start) ?? [])];
    while (stack.length) {
      const node = stack.pop()!;
      if (node === start) return true;
      if (seen.has(node)) continue;
      seen.add(node);
      stack.push(...(edges.get(node) ?? []));
    }
    return false;
  };
  return [...edges.keys()].filter(reaches).map((k) => original.get(k)!);
}
