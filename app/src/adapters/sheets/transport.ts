/**
 * The three Sheets API calls the adapter uses, behind one small interface so the tests
 * can swap in an in-memory spreadsheet (fake.ts) for the real one.
 *
 * Every write is one spreadsheets.batchUpdate: the requests in it apply together or not
 * at all, so a new row and the table growing to hold it never come apart.
 */

export interface GridRange {
  startRowIndex: number;
  endRowIndex: number;
  startColumnIndex: number;
  endColumnIndex: number;
}

export interface SheetInfo {
  sheetId: number;
  title: string;
  rowCount: number;
  /** The Table on this tab (Wander Data has one per tab). */
  table: { tableId: string; range: GridRange } | null;
}

export type CellValue = string | number | boolean | null;

/** A cell to write: a plain value, or a formula (only the Translations cache uses them). */
export type CellInput = CellValue | { formula: string };

export type Request =
  | { updateCells: { start: { sheetId: number; rowIndex: number; columnIndex: number }; rows: { values: object[] }[]; fields: 'userEnteredValue' } }
  | { updateTable: { table: { tableId: string; range: GridRange & { sheetId: number } }; fields: 'range' } }
  | { deleteDimension: { range: { sheetId: number; dimension: 'ROWS'; startIndex: number; endIndex: number } } }
  | { appendDimension: { sheetId: number; dimension: 'ROWS'; length: number } };

export interface SheetsTransport {
  /** Each tab's cells as typed values (numbers stay numbers, checkboxes booleans). */
  getValues(tabs: string[]): Promise<CellValue[][][]>;
  sheets(): Promise<SheetInfo[]>;
  batchUpdate(requests: Request[]): Promise<void>;
}

/** The CellData the API expects for a value. */
export function cellData(value: CellInput): object {
  if (value === null || value === '') return {};
  if (typeof value === 'object') return { userEnteredValue: { formulaValue: value.formula } };
  if (typeof value === 'number') return { userEnteredValue: { numberValue: value } };
  if (typeof value === 'boolean') return { userEnteredValue: { boolValue: value } };
  // stringValue is stored as text even when it starts with "=", so typed content can't
  // become a formula.
  return { userEnteredValue: { stringValue: value } };
}

/** The real thing: fetch against the Sheets API with an OAuth access token. */
export function googleSheetsTransport(spreadsheetId: string, token: () => Promise<string>): SheetsTransport {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(`Sheets API ${response.status}: ${body?.error?.message ?? response.statusText}`);
    }
    return response.json() as Promise<T>;
  }
  return {
    async getValues(tabs) {
      const ranges = tabs.map((tab) => `ranges=${encodeURIComponent(`'${tab}'`)}`).join('&');
      const data = await call<{ valueRanges: { values?: CellValue[][] }[] }>(`/values:batchGet?${ranges}&valueRenderOption=UNFORMATTED_VALUE`);
      return data.valueRanges.map((range) => range.values ?? []);
    },
    async sheets() {
      const fields = 'sheets(properties(sheetId,title,gridProperties.rowCount),tables(tableId,range))';
      const data = await call<{ sheets: { properties: { sheetId: number; title: string; gridProperties: { rowCount: number } }; tables?: { tableId: string; range: Partial<GridRange> & Pick<GridRange, 'endRowIndex' | 'endColumnIndex'> }[] }[] }>(
        `?fields=${encodeURIComponent(fields)}`,
      );
      return data.sheets.map((s) => ({
        sheetId: s.properties.sheetId,
        title: s.properties.title,
        rowCount: s.properties.gridProperties.rowCount,
        // The API leaves out fields that are 0, so a Table starting at A1 has no start indexes.
        table: s.tables?.[0] ? { tableId: s.tables[0].tableId, range: { ...s.tables[0].range, startRowIndex: s.tables[0].range.startRowIndex ?? 0, startColumnIndex: s.tables[0].range.startColumnIndex ?? 0 } } : null,
      }));
    },
    async batchUpdate(requests) {
      await call(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests }) });
    },
  };
}
