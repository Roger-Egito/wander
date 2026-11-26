/**
 * A tab's cells as the Sheets API returns them (values.batchGet, header row first) into
 * rows keyed by header name, so column order in the sheet never matters. Blank rows are
 * skipped. The Editor's adapter and the snapshot workflow both read the sheet this way.
 */
import type { Row } from './schema.ts';

export type CellValue = string | number | boolean | null;

export function rowsFromValues(values: CellValue[][]): Row[] {
  const [header = [], ...rows] = values;
  const names = header.map((h) => String(h ?? '').trim());
  return rows
    .filter((row) => row.some((cell) => cell !== '' && cell !== null && cell !== false))
    .map((row) => Object.fromEntries(names.filter(Boolean).map((name) => [name, row[names.indexOf(name)] ?? ''])));
}
