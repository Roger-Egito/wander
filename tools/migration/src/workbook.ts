/**
 * Reads the .xlsx export of Fichas v15 into plain text grids, one per tab. Everything
 * after this works on strings, so the parsers can be tested without a workbook.
 *
 * A cell's text is what the sheet shows: a formula's cached result, rich text joined,
 * a hyperlink's label. Dates and numbers come back as their plain value.
 */
import ExcelJS from 'exceljs';

/** A tab as rows of cell text. Row and column 0 are the sheet's row 1 and column A. */
export type Grid = string[][];

const textOf = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  if ('formula' in value || 'sharedFormula' in value) return textOf((value as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
  if ('hyperlink' in value) return textOf((value as ExcelJS.CellHyperlinkValue).text as ExcelJS.CellValue);
  if ('error' in value) return '';
  return String(value);
};

/** Every tab of the workbook, by its exact name (leading spaces included). */
export async function readWorkbook(path: string): Promise<Map<string, Grid>> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(path);
  const tabs = new Map<string, Grid>();
  book.eachSheet((sheet) => {
    const grid: Grid = [];
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
        cells[columnNumber - 1] = textOf(cell.value).replace(/\r\n/g, '\n');
      });
      grid[rowNumber - 1] = Array.from(cells, (cell) => cell ?? '');
    });
    tabs.set(sheet.name, Array.from(grid, (row) => row ?? []));
  });
  return tabs;
}
