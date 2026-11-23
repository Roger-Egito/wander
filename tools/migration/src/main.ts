/**
 * The migration: reads input/Fichas v15.xlsx (an export, never the sheet itself) and
 * input/Wander Rules.json (the rules doc, from the Google Docs API), and writes
 * output/tables/<Tab>.json, one per Wander Data tab, output/Wander Data.xlsx and
 * output/report.md.
 *
 *   npm run migrate
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrate, type Finding } from './migrate.ts';
import { readRules } from './rules.ts';
import { TABS, type TabName } from '@wander/content';
import { readWorkbook } from './workbook.ts';
import { translationRows, writeWorkbook } from './xlsx.ts';

const input = (name: string) => fileURLToPath(new URL(`../input/${name}`, import.meta.url));
const OUTPUT = new URL('../output/', import.meta.url);

const tabs = await readWorkbook(input('Fichas v15.xlsx'));
const { tables, findings } = migrate(tabs, readRules(input('Wander Rules.json')));

mkdirSync(new URL('tables/', OUTPUT), { recursive: true });
for (const name of Object.keys(TABS) as TabName[]) {
  // Column order from the schema, so every row has every column.
  const rows = tables[name].map((row) => Object.fromEntries(TABS[name].map((column) => [column, row[column] ?? ''])));
  writeFileSync(new URL(`tables/${name}.json`, OUTPUT), JSON.stringify(rows, null, 1));
}

const xlsxPath = fileURLToPath(new URL('Wander Data.xlsx', OUTPUT));
await writeWorkbook(tables, xlsxPath);
console.log(`Wrote ${xlsxPath} (Translations: ${translationRows(tables).length} formulas)`);

/* --- the report ------------------------------------------------------------------ */

const where = (f: Finding) => [f.id, f.origin && `${f.origin.tab}!${f.origin.cell}`].filter(Boolean).join(' · ');
const groups = new Map<string, Finding[]>();
for (const f of findings) groups.set(f.kind, [...(groups.get(f.kind) ?? []), f]);

const lines = [
  '# Fichas v15 migration report',
  '',
  `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC from an .xlsx export of Fichas v15. Fichas v15 itself was only read.`,
  '',
  '## Rows',
  '',
  '| Tab | Rows |',
  '| --- | --- |',
  ...(Object.keys(TABS) as TabName[]).map((name) => `| ${name} | ${tables[name].length} |`),
  '',
  '## Findings',
  '',
  ...[...groups.entries()].flatMap(([kind, list]) => [`### ${kind} (${list.length})`, '', ...list.map((f) => `- ${where(f) ? `**${where(f)}**: ` : ''}${f.detail}`), '']),
];
writeFileSync(new URL('report.md', OUTPUT), lines.join('\n'));

console.log((Object.keys(TABS) as TabName[]).map((name) => `${name} ${tables[name].length}`).join(' · '));
console.log([...groups.entries()].map(([kind, list]) => `${kind}: ${list.length}`).join('\n'));
