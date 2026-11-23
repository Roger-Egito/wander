/**
 * Writes the migrated tables as Wander Data.xlsx, ready to upload to Drive as a Google
 * Sheet: one tab per table, a bold frozen header row, and the Translations tab filled
 * with GOOGLETRANSLATE formulas.
 *
 * Each Translations formula finds its text by the row's ID (MATCH on column A), not by
 * cell address, so sorting or adding rows in a content tab never points it at the wrong
 * text. It reads the Portuguese column only: hand-written English goes in each row's
 * _en column, which always wins over this cache.
 */
import ExcelJS from 'exceljs';
import { TABS, type TabName, type Tables } from '@wander/content';

/** The texts a player reads, by tab: the cache gets one row per filled cell of these. */
export const TRANSLATABLE: Partial<Record<TabName, string[]>> = {
  Disciplines: ['name', 'description'],
  Skills: ['name', 'description'],
  Traits: ['name', 'notes'],
  TraitLevels: ['description'],
  Categories: ['name'],
  CastTimes: ['name'],
  CostScales: ['name'],
  TraitTiers: ['name'],
  Conditions: ['name', 'description'],
};

const letter = (index: number) => String.fromCharCode(65 + index); // every tab has fewer than 27 columns

export function translationRows(tables: Tables) {
  const rows: { table: TabName; id: string; field: string; column: string }[] = [];
  for (const [tab, fields] of Object.entries(TRANSLATABLE) as [TabName, string[]][]) {
    const key = TABS[tab][0]; // id, or name for the lookup tabs
    for (const row of tables[tab]) {
      for (const field of fields) {
        if (!row[field]) continue;
        rows.push({ table: tab, id: String(row[key]), field, column: letter(TABS[tab].indexOf(field as never)) });
      }
    }
  }
  return rows;
}

export async function writeWorkbook(tables: Tables, path: string) {
  const book = new ExcelJS.Workbook();
  for (const name of Object.keys(TABS) as TabName[]) {
    const columns = TABS[name];
    const sheet = book.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = columns.map((column) => ({ header: column, key: column, width: /description|notes/.test(column) ? 60 : Math.max(12, column.length + 2) }));
    sheet.getRow(1).font = { bold: true };

    if (name === 'Translations') {
      translationRows(tables).forEach((t, i) => {
        const row = i + 2;
        sheet.addRow({ table: t.table, id: t.id, field: t.field });
        const source = `INDEX(${t.table}!${t.column}:${t.column}, MATCH(B${row}, ${t.table}!A:A, 0))`;
        sheet.getCell(`D${row}`).value = { formula: `IFERROR(GOOGLETRANSLATE(${source}, "pt", "en"), "")` };
      });
      continue;
    }
    for (const row of tables[name]) {
      sheet.addRow(Object.fromEntries(columns.map((column) => [column, row[column] === null || row[column] === undefined ? '' : row[column]])));
    }
    for (const column of ['description', 'notes', 'description_pt']) {
      const index = columns.indexOf(column as never);
      if (index >= 0) sheet.getColumn(index + 1).alignment = { wrapText: true, vertical: 'top' };
    }
  }
  await book.xlsx.writeFile(path);
}
