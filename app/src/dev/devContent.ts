/**
 * Wander Data for local development, until the Sheets adapter (M5) reads the real
 * sheet. Uses app/dev-data (npm run snapshot from a live export) when it's there, else
 * the migration output. Both are gitignored, so neither ends up in the published app.
 */
import { TABS, emptyTables, type Row, type TabName, type Tables } from '@wander/content';

const snapshot = import.meta.glob<Row[]>('../../dev-data/*.json', { eager: true, import: 'default' });
const migrated = import.meta.glob<Row[]>('../../../tools/migration/output/tables/*.json', { eager: true, import: 'default' });

function tablesFrom(files: Record<string, Row[]>): Tables | null {
  const byTab = new Map(Object.entries(files).map(([path, rows]) => [path.split('/').pop()!.replace('.json', ''), rows]));
  if (!byTab.has('Skills')) return null;
  const tables = emptyTables();
  for (const tab of Object.keys(TABS) as TabName[]) tables[tab] = byTab.get(tab) ?? [];
  return tables;
}

export const devTables = tablesFrom(snapshot) ?? tablesFrom(migrated);
export const devSource = tablesFrom(snapshot) ? 'snapshot' : devTables ? 'migration' : null;
