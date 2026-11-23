/**
 * Reads and writes Wander Data through the Sheets API. The Editor calls this, never the
 * API directly, and every operation is driven by the content types, so a new type gets
 * create, edit and delete without code here.
 *
 * Rules every write follows:
 *   - Columns are found by their header, never by position, so reordering columns in the
 *     sheet can't send a value to the wrong one.
 *   - Rows are found by ID, read again right before writing, so rows sorted or added in
 *     the sheet meanwhile can't send a write to the wrong row.
 *   - A write is one batchUpdate: new rows and the Table growing to hold them happen
 *     together. Rows written below a Table don't join it on their own (seen 2026-11-22),
 *     so the adapter extends the Table range itself.
 *   - Values go in as typed values (stringValue, numberValue), never parsed, so text that
 *     starts with "=" stays text.
 */
import { CONTENT_TYPES, englishKey, TABS, type ContentType, type Field, type Row, type TabName, type Tables } from '@wander/content';
import { cellData, type CellInput, type CellValue, type Request, type SheetInfo, type SheetsTransport } from './transport.ts';

/** A row as the Editor hands it over: column → value. Missing columns are left as they are. */
export type RowValues = Record<string, CellValue>;

/**
 * The ID a new row has until it's saved. Its new children use it too (a new trait's
 * levels are NOVO.1, NOVO.2, and a level requirement can point at NOVO.2): create swaps
 * it for the real ID everywhere.
 */
export const PENDING_ID = 'NOVO';

/** Swaps the pending ID for the real one in every child value ("NOVO.2" → "FAC-22.2"). */
function withId(children: Children, id: string): Children {
  const swap = (value: unknown) => (typeof value === 'string' && value.startsWith(`${PENDING_ID}.`) ? `${id}${value.slice(PENDING_ID.length)}` : value);
  return Object.fromEntries(
    Object.entries(children).map(([key, rows]) => [
      key,
      rows.map((row) => Object.fromEntries(Object.entries(row).map(([c, v]) => [c, c === 'children' && v ? withId(v as Children, id) : swap(v)])) as ChildRow),
    ]),
  );
}

/** A child row: its columns, plus its own children when it has an ID of its own (a trait level's requirements). */
export interface ChildRow {
  [column: string]: CellValue | Children | undefined;
  children?: Children;
}

/** A child row's columns, without its children. */
const columnsOf = ({ children: _, ...columns }: ChildRow) => columns as RowValues;

/** Child rows of each subtable (or the modifiers), replacing whatever the parent had. */
export type Children = Record<string, ChildRow[]>;

const typeById = (id: string) => (CONTENT_TYPES as readonly ContentType[]).find((t) => t.id === id)!;
const pad = (n: number) => String(n).padStart(2, '0');
const columnLetter = (index: number) => {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
};

interface Grid {
  sheet: SheetInfo;
  header: string[];
  /** Data rows, header excluded. Row i is sheet row i + 1 (0-based), or i + 2 in A1. */
  rows: CellValue[][];
}

export class SheetsAdapter {
  private readonly transport: SheetsTransport;
  constructor(transport: SheetsTransport) {
    this.transport = transport;
  }

  /* --- reading ------------------------------------------------------------------- */

  /** Every tab, rows mapped by header name. One batchGet for the whole spreadsheet. */
  async readAll(): Promise<Tables> {
    const tabs = Object.keys(TABS) as TabName[];
    const values = await this.transport.getValues(tabs);
    return Object.fromEntries(tabs.map((tab, i) => [tab, toRows(values[i])])) as Tables;
  }

  private async grids(tabs: TabName[]): Promise<Map<TabName, Grid>> {
    const [values, sheets] = await Promise.all([this.transport.getValues(tabs), this.transport.sheets()]);
    return new Map(
      tabs.map((tab, i) => {
        const sheet = sheets.find((s) => s.title === tab);
        if (!sheet?.table) throw new Error(`Wander Data has no Table on a tab named ${tab}`);
        const [header = [], ...rows] = values[i];
        return [tab, { sheet, header: header.map((h) => String(h ?? '').trim()), rows }];
      }),
    );
  }

  /* --- request builders ---------------------------------------------------------- */

  private static cells(grid: Grid, rowIndex: number, values: Record<string, CellInput>): Request[] {
    return Object.entries(values).map(([column, value]) => {
      const columnIndex = grid.header.indexOf(column);
      if (columnIndex < 0) throw new Error(`${grid.sheet.title} has no column ${column}`);
      return { updateCells: { start: { sheetId: grid.sheet.sheetId, rowIndex, columnIndex }, rows: [{ values: [cellData(value)] }], fields: 'userEnteredValue' } };
    });
  }

  /** New rows at the end of the Table, and the Table grown to include them. */
  private static append(grid: Grid, rows: Record<string, CellInput>[]): Request[] {
    if (!rows.length) return [];
    const table = grid.sheet.table!;
    const start = table.range.endRowIndex;
    const requests: Request[] = [];
    const missing = start + rows.length - grid.sheet.rowCount;
    if (missing > 0) requests.push({ appendDimension: { sheetId: grid.sheet.sheetId, dimension: 'ROWS', length: missing } });
    rows.forEach((row, i) => requests.push(...SheetsAdapter.cells(grid, start + i, row)));
    requests.push({ updateTable: { table: { tableId: table.tableId, range: { ...table.range, endRowIndex: start + rows.length, sheetId: grid.sheet.sheetId } }, fields: 'range' } });
    // Later appends in this same batch start after these rows.
    table.range = { ...table.range, endRowIndex: start + rows.length };
    grid.sheet.rowCount = Math.max(grid.sheet.rowCount, start + rows.length);
    return requests;
  }

  /** Deletes data rows (indexes into grid.rows), bottom first so the indexes stay right. */
  private static remove(grid: Grid, indexes: number[]): Request[] {
    const sorted = [...new Set(indexes)].sort((a, b) => b - a);
    grid.sheet.table!.range = { ...grid.sheet.table!.range, endRowIndex: grid.sheet.table!.range.endRowIndex - sorted.length };
    return sorted.map((i) => ({ deleteDimension: { range: { sheetId: grid.sheet.sheetId, dimension: 'ROWS' as const, startIndex: i + 1, endIndex: i + 2 } } }));
  }

  private static find(grid: Grid, column: string, value: string) {
    const c = grid.header.indexOf(column);
    return grid.rows.flatMap((row, i) => (String(row[c] ?? '').trim() === value ? [i] : []));
  }

  /* --- writing ------------------------------------------------------------------- */

  /** Changes some columns of one row, found by its ID. */
  async update(typeId: string, id: string, values: RowValues, children?: Children) {
    const type = typeById(typeId);
    const grids = await this.grids([...new Set<TabName>([...tabsOf(type), 'Translations'])]);
    const grid = grids.get(type.tab)!;
    const [row] = SheetsAdapter.find(grid, 'id', id);
    if (row === undefined) throw new Error(`${type.tab} has no row ${id}`);
    const requests = [
      ...SheetsAdapter.cells(grid, row + 1, values),
      // Snapshots first: they address Translations rows by position, before any are removed or added.
      ...snapshotUpdates(type, id, values, children ?? {}, grids),
      ...(children ? replaceChildren(type, id, children, grids) : []),
      ...translationRows(type, id, values, children ?? {}, grids),
    ];
    await this.transport.batchUpdate(requests);
  }

  /**
   * Adds a row with the next ID from its Config counter (next_id_FOG holds the next
   * number), its child rows, and the Translations rows its texts need. Returns the ID.
   */
  async create(typeId: string, values: RowValues, children: Children = {}): Promise<string> {
    const type = typeById(typeId);
    const grids = await this.grids([...new Set<TabName>([...tabsOf(type), 'Config', 'Translations'])]);
    const grid = grids.get(type.tab)!;
    const requests: Request[] = [];

    let id: string;
    if (type.ids.kind === 'manual') {
      id = String(values.id ?? '');
      if (!type.ids.pattern.test(id)) throw new Error(`${id} is not a valid ${type.id} ID`);
    } else {
      const prefix = typeof type.ids.prefix === 'function' ? type.ids.prefix(values) : type.ids.prefix;
      if (!prefix) throw new Error(`a new ${type.id} needs its prefix first`);
      const config = grids.get('Config')!;
      const key = `next_id_${prefix}`;
      const [counterRow] = SheetsAdapter.find(config, 'key', key);
      // No counter yet: start after the highest ID already used.
      const used = grid.rows.map((r) => String(r[grid.header.indexOf('id')] ?? '')).filter((x) => x.startsWith(`${prefix}-`)).map((x) => Number(x.slice(prefix.length + 1)) || 0);
      const next = counterRow !== undefined ? Number(config.rows[counterRow][config.header.indexOf('value')]) : Math.max(0, ...used) + 1;
      id = `${prefix}-${pad(next)}`;
      if (SheetsAdapter.find(grid, 'id', id).length) throw new Error(`${id} already exists: Config ${key} is behind`);
      if (counterRow !== undefined) requests.push(...SheetsAdapter.cells(config, counterRow + 1, { value: next + 1 }));
      else requests.push(...SheetsAdapter.append(config, [{ key, value: next + 1 }]));
    }

    const finalChildren = withId(children, id);
    requests.push(...SheetsAdapter.append(grid, [{ ...values, id }]));
    requests.push(...replaceChildren(type, id, finalChildren, grids));
    requests.push(...translationRows(type, id, { ...values, id }, finalChildren, grids));
    await this.transport.batchUpdate(requests);
    return id;
  }

  /** The same columns set on many rows (bulk "Mudar status", "Editar campo"), in one write. */
  async updateMany(typeId: string, ids: string[], values: RowValues) {
    const type = typeById(typeId);
    const grid = (await this.grids([type.tab])).get(type.tab)!;
    const requests = ids.flatMap((id) => {
      const [row] = SheetsAdapter.find(grid, 'id', id);
      if (row === undefined) throw new Error(`${type.tab} has no row ${id}`);
      return SheetsAdapter.cells(grid, row + 1, values);
    });
    if (requests.length) await this.transport.batchUpdate(requests);
  }

  /** Soft delete: the row stays, status becomes "deleted", and every list hides it. */
  softDelete(typeId: string, id: string) {
    return this.update(typeId, id, { status: 'deleted' });
  }

  /** Brings a soft-deleted row back with the status the Editor picks. */
  restore(typeId: string, id: string, status: 'draft' | 'playtest' | 'final' = 'draft') {
    return this.update(typeId, id, { status });
  }

  /**
   * "Excluir permanentemente": the row, its child rows (and theirs), the modifiers of
   * any of them, and their Translations rows. The Editor confirms first, listing them.
   */
  async deletePermanently(typeId: string, selected: string | string[]) {
    const roots = Array.isArray(selected) ? selected : [selected];
    const type = typeById(typeId);
    const tabs = [...new Set<TabName>([...tabsOf(type), 'Translations'])];
    const grids = await this.grids(tabs);
    const doomed = new Map<TabName, number[]>();
    const mark = (tab: TabName, indexes: number[]) => doomed.set(tab, [...(doomed.get(tab) ?? []), ...indexes]);
    const ids = [...roots];

    for (const id of roots) mark(type.tab, SheetsAdapter.find(grids.get(type.tab)!, 'id', id));
    const walk = (fields: readonly Field[], parentIds: string[]) => {
      for (const field of fields) {
        if (field.type !== 'subtable') continue;
        const grid = grids.get(field.tab)!;
        const childIds: string[] = [];
        for (const parentId of parentIds) {
          const rows = SheetsAdapter.find(grid, field.parentKey, parentId);
          mark(field.tab, rows);
          if (field.childIds) childIds.push(...rows.map((r) => String(grid.rows[r][grid.header.indexOf('id')] ?? '')));
        }
        ids.push(...childIds);
        walk(field.fields, childIds);
      }
    };
    walk(type.fields, roots);
    if (hasModifiers(type.fields)) for (const x of ids) mark('Modifiers', SheetsAdapter.find(grids.get('Modifiers')!, 'origin_id', x));
    for (const x of ids) mark('Translations', SheetsAdapter.find(grids.get('Translations')!, 'id', x));

    const requests = [...doomed].flatMap(([tab, indexes]) => SheetsAdapter.remove(grids.get(tab)!, indexes));
    if (requests.length) await this.transport.batchUpdate(requests);
  }

  /**
   * Gives a deleted row's number back to its Config counter, so the next new row reuses
   * it. Only when it was the last number handed out and no row has that ID any more:
   * otherwise the counter is left alone and the number stays unused.
   */
  async releaseId(typeId: string, id: string) {
    const type = typeById(typeId);
    const match = /^(.+)-(\d+)$/.exec(id);
    if (!match || type.ids.kind !== 'counter') return false;
    const [, prefix, digits] = match;
    const grids = await this.grids([type.tab, 'Config']);
    if (SheetsAdapter.find(grids.get(type.tab)!, 'id', id).length) return false;
    const config = grids.get('Config')!;
    const [row] = SheetsAdapter.find(config, 'key', `next_id_${prefix}`);
    if (row === undefined || Number(config.rows[row][config.header.indexOf('value')]) !== Number(digits) + 1) return false;
    await this.transport.batchUpdate(SheetsAdapter.cells(config, row + 1, { value: Number(digits) }));
    return true;
  }

  /**
   * The English of one text, from the Translation screen: written to the row's English
   * column, and the Portuguese it was written for kept in Translations.manual_from, so
   * the screen can tell when the Portuguese changed afterwards. Clearing the English
   * clears the snapshot too (the text goes back to the automatic translation).
   */
  async saveTranslation(text: { table: TabName; id: string; field: string; enColumn: string; en: string; pt: string; keyColumn?: string }) {
    const grids = await this.grids([text.table, 'Translations']);
    const grid = grids.get(text.table)!;
    // Lookup tabs (Categories, CastTimes...) have no ID: their name is the key.
    const [row] = SheetsAdapter.find(grid, text.keyColumn ?? 'id', text.id);
    if (row === undefined) throw new Error(`${text.table} has no row ${text.id}`);
    const translations = grids.get('Translations')!;
    const column = (name: string) => translations.header.indexOf(name);
    const existing = SheetsAdapter.find(translations, 'id', text.id).find(
      (r) => translations.rows[r][column('table')] === text.table && translations.rows[r][column('field')] === text.field,
    );
    const manualFrom = text.en.trim() ? text.pt : '';
    const requests = [...SheetsAdapter.cells(grid, row + 1, { [text.enColumn]: text.en })];
    if (existing !== undefined) requests.push(...SheetsAdapter.cells(translations, existing + 1, { manual_from: manualFrom }));
    else {
      const a1 = translations.sheet.table!.range.endRowIndex + 1;
      requests.push(...SheetsAdapter.append(translations, [{ table: text.table, id: text.id, field: text.field, auto_en: { formula: translateFormula(text.table, text.field, a1, grids) }, manual_from: manualFrom }]));
    }
    await this.transport.batchUpdate(requests);
  }

  /** "Publicar versão": a row in Releases, which the publish job picks up (Phase 3). */
  async publishRelease(version: string, notes: string) {
    const grids = await this.grids(['Releases']);
    await this.transport.batchUpdate(SheetsAdapter.append(grids.get('Releases')!, [{ version, notes, requested_at: new Date().toISOString() }]));
  }

  // Exposed for replaceChildren and translationRows below.
  static readonly build = { cells: SheetsAdapter.cells, append: SheetsAdapter.append, remove: SheetsAdapter.remove, find: SheetsAdapter.find };
}

/* --- helpers --------------------------------------------------------------------- */

function toRows(values: CellValue[][]): Row[] {
  const [header = [], ...rows] = values;
  const names = header.map((h) => String(h ?? '').trim());
  return rows
    .filter((row) => row.some((cell) => cell !== '' && cell !== null && cell !== false))
    .map((row) => Object.fromEntries(names.filter(Boolean).map((name) => [name, row[names.indexOf(name)] ?? ''])));
}

const hasModifiers = (fields: readonly Field[]): boolean => fields.some((f) => f.type === 'modifiers' || (f.type === 'subtable' && hasModifiers(f.fields)));

/** Every tab a type's rows live in: its own, its subtables', and Modifiers when it has them. */
function tabsOf(type: ContentType): TabName[] {
  const tabs = new Set<TabName>([type.tab]);
  const walk = (fields: readonly Field[]) => {
    for (const f of fields) if (f.type === 'subtable') { tabs.add(f.tab); walk(f.fields); }
  };
  walk(type.fields);
  if (hasModifiers(type.fields)) tabs.add('Modifiers');
  return [...tabs];
}

/**
 * Children replace what the parent had: the old rows go (with everything under them),
 * and the new ones are appended. Keys are subtable keys ("levels", "stat_requirements")
 * or "modifiers" for the parent's own modifiers. A child row with its own ID (a trait
 * level) keeps the ID it's given, and brings its own children in `children` (a level's
 * requirements and modifiers), so the whole tree is written in one batch.
 */
function replaceChildren(type: ContentType, id: string, children: Children, grids: Map<TabName, Grid>): Request[] {
  const { remove, append, find } = SheetsAdapter.build;
  const removals = new Map<TabName, number[]>();
  const additions = new Map<TabName, RowValues[]>();
  const removeRows = (tab: TabName, indexes: number[]) => removals.set(tab, [...(removals.get(tab) ?? []), ...indexes]);
  const addRows = (tab: TabName, rows: RowValues[]) => additions.set(tab, [...(additions.get(tab) ?? []), ...rows]);
  const gone = new Set<string>();
  const kept = new Set<string>();

  /** Removes the rows under `parentId` in `fields`, and their own children, recursively. */
  function removeUnder(fields: readonly Field[], parentId: string) {
    for (const f of fields) {
      if (f.type === 'modifiers') removeRows('Modifiers', find(grids.get('Modifiers')!, 'origin_id', parentId));
      if (f.type !== 'subtable') continue;
      const grid = grids.get(f.tab)!;
      const rows = find(grid, f.parentKey, parentId);
      removeRows(f.tab, rows);
      if (f.childIds) for (const r of rows) {
        const childId = String(grid.rows[r][grid.header.indexOf('id')] ?? '');
        gone.add(childId);
        removeUnder(f.fields, childId);
      }
    }
  }

  function replace(fields: readonly Field[], parentId: string, given: Children) {
    for (const [key, rows] of Object.entries(given)) {
      if (key === 'modifiers') {
        removeRows('Modifiers', find(grids.get('Modifiers')!, 'origin_id', parentId));
        addRows('Modifiers', rows.map((r) => ({ ...columnsOf(r), origin_id: parentId })));
        continue;
      }
      const field = fields.find((f) => f.key === key);
      if (field?.type !== 'subtable') throw new Error(`no subtable ${key} here`);
      removeUnder([field], parentId);
      addRows(field.tab, rows.map((r) => ({ ...columnsOf(r), [field.parentKey]: parentId })));
      if (field.childIds) for (const row of rows) {
        kept.add(String(row.id ?? ''));
        if (row.children) replace(field.fields, String(row.id ?? ''), row.children);
      }
    }
  }

  replace(type.fields, id, children);
  // A child that's gone for good takes its Translations rows with it.
  const translations = grids.get('Translations');
  if (translations) for (const childId of gone) if (!kept.has(childId)) removeRows('Translations', find(translations, 'id', childId));

  // Removals first (they shift rows up), then the appends at each Table's new end.
  const requests: Request[] = [];
  for (const [tab, indexes] of removals) requests.push(...remove(grids.get(tab)!, indexes));
  for (const [tab, rows] of additions) requests.push(...append(grids.get(tab)!, rows));
  return requests;
}

/**
 * Translations cache rows for texts that don't have one yet: one GOOGLETRANSLATE
 * formula per filled translatable field, finding its text by ID like the migration's
 * formulas do. Used on create, and on update for a text filled in for the first time.
 */
function translationRows(type: ContentType, id: string, values: RowValues, children: Children, grids: Map<TabName, Grid>): Request[] {
  const { append, find } = SheetsAdapter.build;
  const translations = grids.get('Translations')!;
  const has = (table: string, rowId: string, field: string) =>
    find(translations, 'id', rowId).some((r) => translations.rows[r][translations.header.indexOf('table')] === table && translations.rows[r][translations.header.indexOf('field')] === field);
  const rows: { table: TabName; id: string; field: string; manualFrom: string }[] = [];
  const collect = (tab: TabName, fields: readonly Field[], row: RowValues, rowId: string, given: Children) => {
    for (const f of fields) {
      if (f.type === 'subtable') {
        if (f.childIds) for (const child of given[f.key] ?? []) collect(f.tab, f.fields, columnsOf(child), String(child.id ?? ''), child.children ?? {});
        continue;
      }
      const pt = String(row[f.key] ?? '').trim();
      if (f.translatable && pt && !has(tab, rowId, f.key)) {
        rows.push({ table: tab, id: rowId, field: f.key, manualFrom: String(row[englishKey(f)] ?? '').trim() ? String(row[f.key]) : '' });
      }
    }
  };
  collect(type.tab, type.fields, values, id, children);
  const start = translations.sheet.table!.range.endRowIndex;
  return append(
    translations,
    rows.map((r, i) => {
      return { table: r.table, id: r.id, field: r.field, auto_en: { formula: translateFormula(r.table, r.field, start + i + 1, grids) }, manual_from: r.manualFrom };
    }),
  );
}

/** The GOOGLETRANSLATE formula for a Translations row at sheet row `a1`, finding its text by ID. */
function translateFormula(table: TabName, field: string, a1: number, grids: Map<TabName, Grid>) {
  const grid = grids.get(table);
  const column = columnLetter(grid ? grid.header.indexOf(field) : TABS[table].indexOf(field as never));
  return `=IFERROR(GOOGLETRANSLATE(INDEX(${table}!${column}:${column}, MATCH(B${a1}, ${table}!A:A, 0)), "pt", "en"), "")`;
}

/**
 * Keeps Translations.manual_from in step when English is written from the Editor's form:
 * for each English column being written, the snapshot becomes the Portuguese it was
 * written for (empty when the English is cleared). Rows that don't exist yet get theirs
 * from translationRows.
 */
function snapshotUpdates(type: ContentType, id: string, values: RowValues, children: Children, grids: Map<TabName, Grid>): Request[] {
  const { cells, find } = SheetsAdapter.build;
  const translations = grids.get('Translations')!;
  const column = (name: string) => translations.header.indexOf(name);
  const requests: Request[] = [];
  const visit = (tab: TabName, fields: readonly Field[], row: RowValues, rowId: string, given: Children) => {
    const grid = grids.get(tab)!;
    const [saved] = find(grid, 'id', rowId);
    for (const f of fields) {
      if (f.type === 'subtable') {
        if (f.childIds) for (const child of given[f.key] ?? []) visit(f.tab, f.fields, columnsOf(child), String(child.id ?? ''), child.children ?? {});
        continue;
      }
      if (!f.translatable || !(englishKey(f) in row)) continue;
      const existing = find(translations, 'id', rowId).find((r) => translations.rows[r][column('table')] === tab && translations.rows[r][column('field')] === f.key);
      if (existing === undefined) continue;
      const pt = f.key in row ? row[f.key] : saved !== undefined ? grid.rows[saved][grid.header.indexOf(f.key)] : '';
      requests.push(...cells(translations, existing + 1, { manual_from: String(row[englishKey(f)] ?? '').trim() ? String(pt ?? '') : '' }));
    }
  };
  visit(type.tab, type.fields, values, id, children);
  return requests;
}
