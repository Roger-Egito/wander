/**
 * An in-memory spreadsheet behind the SheetsTransport interface, for the adapter's
 * tests. It copies the Sheets behavior the adapter depends on:
 *   - a Table only grows through updateTable: cells written below it stay outside,
 *     as seen on the real sheet (2026-11-22),
 *   - deleting a row inside a Table shrinks it,
 *   - a batchUpdate applies whole or not at all,
 *   - writing past the last grid row fails, as the API does.
 * Formulas are stored as their text: nothing here calculates.
 */
import { TABS, type Row, type TabName } from '@wander/content';
import type { CellValue, GridRange, Request, SheetInfo, SheetsTransport } from './transport.ts';

interface FakeSheet extends SheetInfo {
  cells: CellValue[][];
}

export class FakeSheets implements SheetsTransport {
  sheets_: FakeSheet[];
  /** Every batchUpdate received, for tests that check what was sent. */
  readonly sent: Request[][] = [];

  constructor(data: Partial<Record<TabName, Row[]>>, options: { rowCount?: number; columns?: Partial<Record<TabName, string[]>> } = {}) {
    this.sheets_ = (Object.keys(TABS) as TabName[]).map((tab, i) => {
      const header = options.columns?.[tab] ?? [...TABS[tab]];
      const rows = (data[tab] ?? []).map((row) => header.map((column) => (row[column] ?? '') as CellValue));
      const range: GridRange = { startRowIndex: 0, endRowIndex: rows.length + 1, startColumnIndex: 0, endColumnIndex: header.length };
      return { sheetId: 100 + i, title: tab, rowCount: options.rowCount ?? 1000, table: { tableId: `t${i}`, range }, cells: [header, ...rows] };
    });
  }

  /** A tab's data rows by header, Table rows only: what the tab holds as far as Wander is concerned. */
  rows(tab: TabName): Row[] {
    const sheet = this.sheet(tab);
    const [header, ...rows] = sheet.cells.slice(0, sheet.table!.range.endRowIndex);
    return rows.map((row) => Object.fromEntries(header.map((h, c) => [String(h), row[c] ?? ''])));
  }

  /** Data rows written outside the Table, which the real sheet would also leave out of it. */
  outside(tab: TabName) {
    const sheet = this.sheet(tab);
    return sheet.cells.slice(sheet.table!.range.endRowIndex).filter((row) => row.some((c) => c !== '' && c !== null && c !== undefined));
  }

  sheet(tab: TabName) {
    return this.sheets_.find((s) => s.title === tab)!;
  }

  async getValues(tabs: string[]) {
    return tabs.map((tab) => structuredClone(this.sheets_.find((s) => s.title === tab)!.cells));
  }

  async sheets(): Promise<SheetInfo[]> {
    return this.sheets_.map(({ cells: _, ...info }) => structuredClone(info));
  }

  async batchUpdate(requests: Request[]) {
    this.sent.push(requests);
    const draft = structuredClone(this.sheets_);
    const byId = (id: number) => {
      const sheet = draft.find((s) => s.sheetId === id);
      if (!sheet) throw new Error(`no sheet ${id}`);
      return sheet;
    };
    for (const request of requests) {
      if ('updateCells' in request) {
        const { start, rows } = request.updateCells;
        const sheet = byId(start.sheetId);
        rows.forEach((row, r) => {
          const rowIndex = start.rowIndex + r;
          if (rowIndex >= sheet.rowCount) throw new Error(`row ${rowIndex} is past the grid (${sheet.rowCount} rows)`);
          row.values.forEach((cell, c) => {
            while (sheet.cells.length <= rowIndex) sheet.cells.push([]);
            const value = (cell as { userEnteredValue?: Record<string, CellValue> }).userEnteredValue;
            sheet.cells[rowIndex][start.columnIndex + c] = value ? (value.formulaValue ?? value.stringValue ?? value.numberValue ?? value.boolValue ?? '') : '';
          });
        });
      } else if ('updateTable' in request) {
        const sheet = draft.find((s) => s.table?.tableId === request.updateTable.table.tableId)!;
        const { sheetId: _, ...range } = request.updateTable.table.range;
        sheet.table!.range = range;
      } else if ('deleteDimension' in request) {
        const { sheetId, startIndex, endIndex } = request.deleteDimension.range;
        const sheet = byId(sheetId);
        sheet.cells.splice(startIndex, endIndex - startIndex);
        const range = sheet.table!.range;
        if (startIndex < range.endRowIndex) range.endRowIndex -= Math.min(endIndex, range.endRowIndex) - startIndex;
        sheet.rowCount -= endIndex - startIndex;
      } else if ('appendDimension' in request) {
        byId(request.appendDimension.sheetId).rowCount += request.appendDimension.length;
      }
    }
    this.sheets_ = draft;
  }
}
