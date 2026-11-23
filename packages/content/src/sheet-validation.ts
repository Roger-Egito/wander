/**
 * The Validation tab's formula (one formula in A2), generated from checks.ts: it lists
 * every problem in Wander Data as rows of problem, table, id, detail, and recalculates as
 * rows change. validate.ts runs the same checks in TypeScript.
 *
 * It reads tables by name (Skills[id]), so moving a column never breaks it, and col()
 * checks every reference against schema.ts, so a renamed column fails the tests.
 *
 * Write it with spreadsheets.values.update as a typed value (USER_ENTERED). Sent as a
 * formulaValue through batchUpdate, the same text came back as a parse error.
 */
import { allChecks, type Check, type Scope } from './checks.ts';
import type { Options } from './define.ts';
import { TABS, type TabName } from './schema.ts';
import { numberRule, optionsName, PROBLEM } from './validate.ts';

function col(tab: TabName, column: string) {
  if (!(TABS[tab] as readonly string[]).includes(column)) throw new Error(`${tab} has no column ${column}`);
  return `${tab}[${column}]`;
}

const str = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** The rows a check looks at: filled in, and not deleted (or under a deleted parent). */
function keep(scope: Scope) {
  const present = `(${col(scope.tab, scope.presentKey)}<>"")`;
  if (!scope.live) return present;
  if ('statusKey' in scope.live) return `${present}*(${col(scope.tab, scope.live.statusKey)}<>"deleted")`;
  // Walk up one XLOOKUP per parent: the row's parent ID, then its parent's, then the status.
  const { parents } = scope.live;
  let value = col(scope.tab, parents[0].key);
  parents.forEach(({ tab }, i) => {
    value = `XLOOKUP(${value}, ${col(tab, 'id')}, ${col(tab, i + 1 < parents.length ? parents[i + 1].key : 'status')}, "")`;
  });
  return `${present}*(${value}<>"deleted")`;
}

const optionsRange = (options: Options) =>
  Array.isArray(options) ? `{${options.map(str).join(', ')}}` : col((options as { tab: TabName }).tab, (options as { column: string }).column);

function formulaFor(check: Check): string[] {
  const { scope } = check;
  const t = scope.tab;
  const k = keep(scope);
  const ids = col(t, scope.idKey);
  const c = (column: string) => col(t, column);
  const mk = (problem: string, detail: string, condition: string) => `mk(${str(problem)}, ${str(t)}, ${ids}, ${detail}, ${condition})`;

  switch (check.kind) {
    case 'missingName':
      return [mk(PROBLEM.missingName, str('the row has an ID but no name'), `${k}*(${c(check.nameKey)}="")`)];
    case 'missingId':
      return [mk(PROBLEM.missingId, str(check.detail), `${k}*(${c('id')}="")`)];
    case 'duplicateId':
      return [mk(PROBLEM.duplicateId, str('more than one row has this ID'), `dupIn(${c('id')}, ${k})`)];
    case 'duplicateName':
      return [mk(PROBLEM.duplicateName, `${c(check.column)}&" is the name of another row"`, `dupIn(${c(check.column)}, ${k})`)];
    case 'required':
      return [mk(PROBLEM.required, str(`${check.column} is empty`), `${k}*(${c(check.column)}="")`)];
    case 'reference': {
      const v = c(check.column);
      const target = col(check.target.tab, 'id');
      const out = [mk(PROBLEM.reference, `"${check.column} "&${v}&" is not a ${check.target.label}"`, `${k}*(${v}<>"")*NOT(has(${target}, ${v}))`)];
      if (!check.allowDeleted) {
        const live = `IFERROR(FILTER(${target}, ${col(check.target.tab, 'status')}<>"deleted"), "")`;
        out.push(mk(PROBLEM.reference, `"${check.column} "&${v}&" is deleted"`, `${k}*(${v}<>"")*has(${target}, ${v})*NOT(has(${live}, ${v}))`));
      }
      return out;
    }
    case 'enum': {
      const v = c(check.column);
      return [mk(PROBLEM.unknown, `"${check.column} "&${v}&" is not in ${optionsName(check.options).replace(/"/g, '""')}"`, `${k}*(${v}<>"")*NOT(has(${optionsRange(check.options)}, ${v}))`)];
    }
    case 'tags': {
      const missing = `unknownTags(${c(check.column)}, ${optionsRange(check.options)})`;
      return [mk(PROBLEM.unknown, `"${check.column} has values not in ${optionsName(check.options)}: "&${missing}`, `${k}*(${missing}<>"")`)];
    }
    case 'number': {
      const v = c(check.column);
      const bad = [check.integer ? `(${v}<>INT(${v}))` : '', check.min !== undefined ? `(${v}<${check.min})` : ''].filter(Boolean);
      const out = [mk(PROBLEM.notNumber, str(`${check.column} is not a number`), `${k}*(${v}<>"")*NOT(ISNUMBER(${v}))`)];
      // 0+ turns a lone TRUE/FALSE into a number: Sheets ranks logical values above every
      // number, so FALSE>0 would be TRUE.
      if (bad.length) out.push(mk(PROBLEM.badNumber, str(`${check.column} must be ${numberRule(check.integer, check.min)}`), `${k}*ISNUMBER(${v})*((0+${bad.join('+')})>0)`));
      return out;
    }
    case 'recommended': {
      const detail = check.minLength > 1 ? `${check.column} is empty or under ${check.minLength} characters` : `${check.column} is empty`;
      return [mk(check.problem, str(detail), `${k}*(LEN(TRIM(${c(check.column)}))<${check.minLength})`)];
    }
    case 'oneOf':
      return [mk(PROBLEM.oneOf, str(`fill exactly one of ${check.columns.join(' and ')}`), `${k}*((${check.columns.map((x) => `(${c(x)}<>"")`).join('+')})<>1)`)];
    case 'cycle': {
      const linked = `${k}*(${c(check.to)}<>"")`;
      return [`IFERROR(LET(
      from, FILTER(${c(check.from)}, ${linked}),
      to, FILTER(${c(check.to)}, ${linked}),
      nodes, UNIQUE(from),
      n, ROWS(nodes),
      adjacency, MAKEARRAY(n, n, LAMBDA(i, j, IF(COUNTIFS(from, INDEX(nodes, i), to, INDEX(nodes, j))>0, 1, 0))),
      reaches, REDUCE(adjacency, SEQUENCE(8), LAMBDA(r, step, IF(r+MMULT(r, r)>0, 1, 0))),
      mk(${str(PROBLEM.cycle)}, ${str(t)}, nodes, ${str(`this ${check.label} ends up requiring itself`)}, MAP(SEQUENCE(n), LAMBDA(i, INDEX(reaches, i, i)>0)))), none)`];
    }
    case 'origin': {
      const v = c(check.column);
      const known = `VSTACK(${check.origins.map((o) => col(o.tab, 'id')).join(', ')})`;
      return [mk(PROBLEM.reference, `"${check.column} "&${v}&" is not a ${check.origins.map((o) => o.label).join(' or ')}"`, `${k}*NOT(has(${known}, ${v}))`)];
    }
  }
}

/**
 * Cycles: an adjacency matrix of the rows that link to another, squared 8 times into
 * "reaches", which covers paths up to 256 steps. A row that reaches itself is in a cycle.
 */
export function validationFormula() {
  const checks = allChecks().flatMap(formulaFor);
  return `=ARRAYFORMULA(LET(
  none, {"", "", "", ""},
  mk, LAMBDA(problem, tab, ids, detail, keep, IFERROR(FILTER(HSTACK(IF(LEN(ids)>=0, problem), IF(LEN(ids)>=0, tab), ids, IF(LEN(ids)>=0, detail)), keep), none)),
  has, LAMBDA(list, x, ISNUMBER(XMATCH(x, list))),
  dupIn, LAMBDA(values, kept, MAP(values, kept, LAMBDA(v, k, AND(k, v<>"", SUM((values=v)*kept)>1)))),
  unknownTags, LAMBDA(lists, allowed, MAP(lists, LAMBDA(list, IF(list="", "", LET(
    parts, TRIM(SPLIT(list, ",")),
    missing, FILTER(parts, NOT(has(allowed, parts))),
    IFERROR(TEXTJOIN(", ", TRUE, missing), "")))))),
  all, VSTACK(
    ${checks.join(',\n    ')}),
  problems, FILTER(all, INDEX(all, 0, 1)<>""),
  IFERROR(problems, {"no problems found", "", "", ""})))`;
}
