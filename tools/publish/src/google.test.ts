import { expect, test } from 'vitest';
import { readTables } from './google.ts';

test('the sheet is read in one request, rows keyed by header', async () => {
  let url = '';
  const fake = (async (u: string) => {
    url = u;
    const ranges = new URL(u).searchParams.getAll('ranges').map((tab) => (tab === "'Skills'" ? { values: [['id', 'name'], ['ARC-01', 'Disparo Arcano'], ['', '']] } : {}));
    return new Response(JSON.stringify({ valueRanges: ranges }), { status: 200 });
  }) as unknown as typeof fetch;
  const tables = await readTables('sheet-id', 'token', fake);
  expect(url).toContain('/spreadsheets/sheet-id/values:batchGet?');
  expect(url).toContain('valueRenderOption=UNFORMATTED_VALUE');
  expect(tables.Skills).toEqual([{ id: 'ARC-01', name: 'Disparo Arcano' }]);
  expect(tables.Conditions).toEqual([]);
});
