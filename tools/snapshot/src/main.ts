/**
 * Turns an .xlsx export of Wander Data (File > Download > .xlsx in Sheets) into
 * app/dev-data/<Tab>.json, so the app can run on real content before the Sheets adapter
 * exists. app/dev-data is gitignored: the content isn't published by committing it.
 *
 *   npm run snapshot -- "path/to/Wander Data.xlsx"
 *
 * Cells are typed the way Sheets types them (numbers in number columns, checkboxes as
 * booleans), so the app sees what the Sheets API will give it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { columnLayout, TABS, type Row, type TabName } from '@wander/content';
import { readWorkbook } from '@wander/migration/workbook';

const path = process.argv[2];
if (!path) throw new Error('usage: npm run snapshot -- "path/to/Wander Data.xlsx"');

const workbook = await readWorkbook(path);
const out = new URL('../../../app/dev-data/', import.meta.url);
mkdirSync(out, { recursive: true });

for (const tab of Object.keys(TABS) as TabName[]) {
  const grid = workbook.get(tab);
  if (!grid) throw new Error(`the export has no ${tab} tab`);
  const header = (grid[0] ?? []).map((cell) => cell.trim());
  const rows = grid.slice(1).filter((row) => row.some((cell) => cell.trim())).map((row): Row =>
    Object.fromEntries(TABS[tab].map((column) => {
      const raw = row[header.indexOf(column)] ?? '';
      const type = columnLayout(tab, column)?.columnType;
      if (type === 'DOUBLE' && raw.trim() !== '' && !Number.isNaN(Number(raw))) return [column, Number(raw)];
      if (type === 'BOOLEAN') return [column, raw.toUpperCase() === 'TRUE'];
      return [column, raw];
    })),
  );
  writeFileSync(new URL(`${tab}.json`, out), JSON.stringify(rows, null, 1));
  console.log(`${tab}: ${rows.length}`);
}
