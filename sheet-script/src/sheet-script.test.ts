import { describe, expect, test } from 'vitest';
import { TABS } from '@wander/content';
import { backupsToTrash, keepCount, needsBackup } from './backup.ts';
import { ID_TABS, planIds, type Cell } from './ids.ts';

const header = (tab: keyof typeof TABS) => [...TABS[tab]];
/** A row of a tab from column → value. */
const row = (tab: keyof typeof TABS, values: Record<string, Cell>): Cell[] => header(tab).map((c) => values[c] ?? '');

describe('IDs for rows typed in the grid', () => {
  test('a new skill gets the next ID of its discipline, and the counter moves', () => {
    const rows = [row('Skills', { id: 'FOG-01', name: 'Bola de Fogo', discipline_id: 'FOG' }), row('Skills', { name: 'Chama', discipline_id: 'FOG' })];
    expect(planIds('Skills', header('Skills'), rows, { next_id_FOG: 9 })).toEqual({ ids: [{ row: 1, id: 'FOG-09' }], counters: { next_id_FOG: 10 } });
  });

  test('a row waits for its name, and a skill for its discipline', () => {
    const rows = [row('Skills', { name: '', discipline_id: 'FOG' }), row('Skills', { name: 'Chama' }), row('Conditions', {})];
    expect(planIds('Skills', header('Skills'), rows.slice(0, 2), { next_id_FOG: 9 }).ids).toEqual([]);
  });

  test('several rows at once (a paste) get consecutive IDs', () => {
    const rows = [row('Conditions', { name: 'Molhado' }), row('Conditions', { name: 'Congelado' })];
    expect(planIds('Conditions', header('Conditions'), rows, { next_id_CON: 13 })).toEqual({
      ids: [{ row: 0, id: 'CON-13' }, { row: 1, id: 'CON-14' }],
      counters: { next_id_CON: 15 },
    });
  });

  test('a counter behind the sheet skips IDs already used', () => {
    const rows = [row('Conditions', { id: 'CON-13', name: 'Molhado' }), row('Conditions', { name: 'Congelado' })];
    expect(planIds('Conditions', header('Conditions'), rows, { next_id_CON: 13 }).ids).toEqual([{ row: 1, id: 'CON-14' }]);
  });

  test('without a counter, numbering continues after the highest ID', () => {
    const rows = [row('Keywords', { id: 'PCH-46', name_pt: 'Descanso Longo' }), row('Keywords', { name_pt: 'Fôlego' })];
    expect(planIds('Keywords', header('Keywords'), rows, {})).toEqual({ ids: [{ row: 1, id: 'PCH-47' }], counters: { next_id_PCH: 48 } });
  });

  test("a trait level gets its trait's next level number", () => {
    const rows = [
      row('TraitLevels', { id: 'FAC-14.1', trait_id: 'FAC-14' }),
      row('TraitLevels', { id: 'FAC-14.2', trait_id: 'FAC-14' }),
      row('TraitLevels', { trait_id: 'FAC-14' }),
      row('TraitLevels', { trait_id: 'FAC-15' }),
    ];
    expect(planIds('TraitLevels', header('TraitLevels'), rows, {}).ids).toEqual([{ row: 2, id: 'FAC-14.3' }, { row: 3, id: 'FAC-15.1' }]);
  });

  test('onEdit only looks at the rows just edited', () => {
    const rows = [row('Conditions', { name: 'Molhado' }), row('Conditions', { name: 'Congelado' })];
    expect(planIds('Conditions', header('Conditions'), rows, { next_id_CON: 13 }, [1]).ids).toEqual([{ row: 1, id: 'CON-13' }]);
  });

  test('tabs without IDs of their own are left alone, and columns are found by header', () => {
    expect(ID_TABS.sort()).toEqual(['Conditions', 'Keywords', 'Skills', 'TraitLevels', 'Traits']);
    expect(planIds('StatRequirements', header('StatRequirements'), [['FOG-01', 1, 'ESP', 5]], {}).ids).toEqual([]);
    const reordered = ['name', 'status', 'id'];
    expect(planIds('Conditions', reordered, [['Molhado', 'draft', '']], { next_id_CON: 13 }).ids).toEqual([{ row: 0, id: 'CON-13' }]);
  });
});

describe('backups', () => {
  test('only when the sheet changed since the last one', () => {
    expect(needsBackup(100, null)).toBe(true);
    expect(needsBackup(100, 200)).toBe(false);
    expect(needsBackup(300, 200)).toBe(true);
  });

  test('backup_keep keeps the newest N, and empty keeps all', () => {
    const backups = [{ id: 'a', created: 1 }, { id: 'c', created: 3 }, { id: 'b', created: 2 }];
    expect(backupsToTrash(backups, 2).map((b) => b.id)).toEqual(['a']);
    expect(backupsToTrash(backups, null)).toEqual([]);
    expect([keepCount(''), keepCount('5'), keepCount(0), keepCount('dois'), keepCount(2.5)]).toEqual([null, 5, null, null, null]);
  });
});
