import { describe, expect, test } from 'vitest';
import { TABS, type Row, type TabName } from '@wander/content';
import { SheetsAdapter } from './adapter.ts';
import { FakeSheets } from './fake.ts';

/** A little Wander Data: two skills, a trait with levels, requirements and a modifier. */
function data(): Partial<Record<TabName, Row[]>> {
  return {
    Disciplines: [{ id: 'RAS', name: 'Rascunho', source: 'Wander', status: 'playtest' }],
    Skills: [
      { id: 'RAS-01', name: 'Primeira', discipline_id: 'RAS', level: 1, status: 'playtest' },
      { id: 'RAS-02', name: 'Segunda', discipline_id: 'RAS', level: 2, status: 'playtest' },
    ],
    StatRequirements: [{ skill_id: 'RAS-02', group: 1, stat: 'ESP', value: 5 }, { skill_id: 'RAS-01', group: 1, stat: 'FIS', value: 3 }],
    Traits: [{ id: 'FAC-14', name: 'Mau-Cheiro', status: 'playtest' }, { id: 'FAC-01', name: 'Senso de Direção', status: 'playtest' }],
    TraitLevels: [
      { id: 'FAC-14.1', trait_id: 'FAC-14', tier: 'Ruim', description: 'Cheira mal.' },
      { id: 'FAC-01.1', trait_id: 'FAC-01', tier: 'Ruim', description: 'Se perde.' },
      { id: 'FAC-14.2', trait_id: 'FAC-14', tier: 'Bom', description: 'Cheira tão mal que assusta.' },
    ],
    TraitLevelRequirements: [{ level_id: 'FAC-14.1', group: 1, required_level_id: 'FAC-14.2' }, { level_id: 'FAC-14.2', group: 1, required_level_id: 'FAC-14.1' }],
    Modifiers: [{ origin_id: 'FAC-14.2', stat: 'INF', value: -1, temporary: false }, { origin_id: 'FAC-01.1', stat: 'SEN', value: -1, temporary: false }],
    Config: [{ key: 'req_display', value: 'emoji' }, { key: 'next_id_RAS', value: 3 }, { key: 'next_id_FAC', value: 15 }],
    Translations: [
      { table: 'Skills', id: 'RAS-01', field: 'name', auto_en: '=GOOGLETRANSLATE(...)' },
      { table: 'TraitLevels', id: 'FAC-14.2', field: 'description', auto_en: '=GOOGLETRANSLATE(...)' },
      { table: 'Traits', id: 'FAC-14', field: 'name', auto_en: '=GOOGLETRANSLATE(...)' },
    ],
  };
}

const ids = (rows: Row[], key = 'id') => rows.map((r) => r[key]);

describe('reading', () => {
  test('rows are mapped by header, whatever order the columns are in', async () => {
    const columns = { Skills: [...TABS.Skills].reverse() };
    const tables = await new SheetsAdapter(new FakeSheets(data(), { columns })).readAll();
    expect(tables.Skills[1]).toMatchObject({ id: 'RAS-02', name: 'Segunda', level: 2 });
  });
});

describe('editing', () => {
  test('a write finds its row by ID at the moment of writing', async () => {
    const sheets = new FakeSheets(data());
    const adapter = new SheetsAdapter(sheets);
    // Someone sorts the tab in the grid after the Editor loaded it: RAS-02 moves up.
    const skills = sheets.sheet('Skills');
    [skills.cells[1], skills.cells[2]] = [skills.cells[2], skills.cells[1]];
    await adapter.update('skill', 'RAS-01', { name: 'Primeira editada' });
    expect(sheets.rows('Skills').map((r) => [r.id, r.name])).toEqual([['RAS-02', 'Segunda'], ['RAS-01', 'Primeira editada']]);
  });

  test('child rows are replaced, in one write', async () => {
    const sheets = new FakeSheets(data());
    await new SheetsAdapter(sheets).update('skill', 'RAS-02', { level: 3 }, { stat_requirements: [{ group: 1, stat: 'TEC', value: 6 }, { group: 1, stat: 'SEN', value: 6 }] });
    expect(sheets.rows('StatRequirements')).toEqual([
      { skill_id: 'RAS-01', group: 1, stat: 'FIS', value: 3 },
      { skill_id: 'RAS-02', group: 1, stat: 'TEC', value: 6 },
      { skill_id: 'RAS-02', group: 1, stat: 'SEN', value: 6 },
    ]);
    expect(sheets.outside('StatRequirements')).toEqual([]);
    expect(sheets.sent).toHaveLength(1);
  });

  test("a trait's levels are replaced with their requirements and modifiers, and a removed level takes its translation", async () => {
    const sheets = new FakeSheets(data());
    await new SheetsAdapter(sheets).update('trait', 'FAC-14', {}, {
      levels: [
        { id: 'FAC-14.1', tier: 'Ruim', description: 'Cheira mal.', children: { requirements: [{ group: 1, required_level_id: 'FAC-14.3' }] } },
        { id: 'FAC-14.3', tier: 'Ótimo', description: 'Ninguém chega perto.', children: { modifiers: [{ stat: 'INF', value: -2, temporary: false }] } },
      ],
    });
    expect(sheets.rows('TraitLevels').map((r) => r.id)).toEqual(['FAC-01.1', 'FAC-14.1', 'FAC-14.3']);
    expect(sheets.rows('TraitLevelRequirements')).toEqual([{ level_id: 'FAC-14.1', group: 1, required_level_id: 'FAC-14.3' }]);
    expect(sheets.rows('Modifiers').map((r) => `${r.origin_id} ${r.stat}${r.value}`)).toEqual(['FAC-01.1 SEN-1', 'FAC-14.3 INF-2']);
    // FAC-14.2 is gone, with its translation. FAC-14.1 gets one now (it had none), and so does the new FAC-14.3.
    expect(sheets.rows('Translations').map((r) => `${r.table} ${r.id} ${r.field}`)).toEqual([
      'Skills RAS-01 name', 'Traits FAC-14 name', 'TraitLevels FAC-14.1 description', 'TraitLevels FAC-14.3 description',
    ]);
    for (const tab of ['TraitLevels', 'TraitLevelRequirements', 'Modifiers', 'Translations'] as const) expect(sheets.outside(tab)).toEqual([]);
  });

  test('a text filled in for the first time gets its Translations row', async () => {
    const sheets = new FakeSheets(data());
    await new SheetsAdapter(sheets).update('skill', 'RAS-02', { description: 'Agora com descrição.' });
    expect(sheets.rows('Translations').at(-1)).toMatchObject({ table: 'Skills', id: 'RAS-02', field: 'description' });
    await new SheetsAdapter(sheets).update('skill', 'RAS-02', { description: 'Mudou de novo.' });
    expect(sheets.rows('Translations').filter((r) => r.id === 'RAS-02')).toHaveLength(1);
  });

  test('text that starts with "=" is stored as text, not a formula', async () => {
    const sheets = new FakeSheets(data());
    await new SheetsAdapter(sheets).update('skill', 'RAS-01', { notes: '=HYPERLINK("http://evil")' });
    const cell = sheets.sent[0].find((r) => 'updateCells' in r) as { updateCells: { rows: { values: object[] }[] } };
    expect(cell.updateCells.rows[0].values[0]).toEqual({ userEnteredValue: { stringValue: '=HYPERLINK("http://evil")' } });
  });

  test('soft delete and restore change only the status', async () => {
    const sheets = new FakeSheets(data());
    const adapter = new SheetsAdapter(sheets);
    await adapter.softDelete('skill', 'RAS-01');
    expect(sheets.rows('Skills')[0].status).toBe('deleted');
    await adapter.restore('skill', 'RAS-01', 'playtest');
    expect(sheets.rows('Skills')[0]).toMatchObject({ id: 'RAS-01', name: 'Primeira', status: 'playtest' });
  });

  test('a bulk change sets the same columns on every selected row, in one write', async () => {
    const sheets = new FakeSheets(data());
    await new SheetsAdapter(sheets).updateMany('skill', ['RAS-01', 'RAS-02'], { status: 'final' });
    expect(sheets.rows('Skills').map((r) => r.status)).toEqual(['final', 'final']);
    expect(sheets.sent).toHaveLength(1);
  });

  test('an unknown ID is refused rather than written somewhere else', async () => {
    await expect(new SheetsAdapter(new FakeSheets(data())).update('skill', 'RAS-99', { name: 'x' })).rejects.toThrow(/no row RAS-99/);
  });
});

describe('creating', () => {
  test('the ID comes from the Config counter, and the row joins the Table', async () => {
    const sheets = new FakeSheets(data());
    const id = await new SheetsAdapter(sheets).create('skill', { name: 'Nova', discipline_id: 'RAS', level: 1, status: 'draft', description: 'Uma habilidade nova.' }, {
      stat_requirements: [{ group: 1, stat: 'ESP', value: 4 }],
    });
    expect(id).toBe('RAS-03');
    expect(ids(sheets.rows('Skills'))).toEqual(['RAS-01', 'RAS-02', 'RAS-03']);
    expect(sheets.outside('Skills')).toEqual([]);
    expect(sheets.rows('Config').find((r) => r.key === 'next_id_RAS')!.value).toBe(4);
    expect(sheets.rows('StatRequirements').at(-1)).toEqual({ skill_id: 'RAS-03', group: 1, stat: 'ESP', value: 4 });
  });

  test('its texts get Translations rows, inside the Table, finding the text by ID', async () => {
    const sheets = new FakeSheets(data());
    await new SheetsAdapter(sheets).create('skill', { name: 'Nova', discipline_id: 'RAS', level: 1, status: 'draft', description: 'Texto.' });
    const added = sheets.rows('Translations').slice(3);
    expect(added.map((r) => [r.table, r.id, r.field])).toEqual([['Skills', 'RAS-03', 'name'], ['Skills', 'RAS-03', 'description']]);
    // Skills: name is column B, description column M. Rows 5 and 6 in A1 (header, 3 old rows).
    expect(added[0].auto_en).toBe('=IFERROR(GOOGLETRANSLATE(INDEX(Skills!B:B, MATCH(B5, Skills!A:A, 0)), "pt", "en"), "")');
    expect(added[1].auto_en).toBe('=IFERROR(GOOGLETRANSLATE(INDEX(Skills!M:M, MATCH(B6, Skills!A:A, 0)), "pt", "en"), "")');
    expect(sheets.outside('Translations')).toEqual([]);
  });

  test('a trait with levels: level IDs are kept, and each level text gets its translation', async () => {
    const sheets = new FakeSheets(data());
    const id = await new SheetsAdapter(sheets).create('trait', { name: 'Sortudo', status: 'draft' }, {
      levels: [{ id: 'FAC-15.1', tier: 'Bom', description: 'Sorte.' }],
    });
    expect(id).toBe('FAC-15');
    expect(sheets.rows('TraitLevels').at(-1)).toEqual({ id: 'FAC-15.1', trait_id: 'FAC-15', tier: 'Bom', description: 'Sorte.', description_en: '' });
    expect(sheets.rows('Translations').slice(3).map((r) => [r.table, r.id, r.field])).toEqual([['Traits', 'FAC-15', 'name'], ['TraitLevels', 'FAC-15.1', 'description']]);
  });

  test("a new trait's pending level IDs become real ones, in requirements too", async () => {
    const sheets = new FakeSheets(data());
    const id = await new SheetsAdapter(sheets).create('trait', { name: 'Gêmeo', status: 'draft' }, {
      levels: [
        { id: 'NOVO.1', tier: 'Ruim', description: 'Um.', children: { requirements: [{ group: 1, required_level_id: 'NOVO.2' }] } },
        { id: 'NOVO.2', tier: 'Bom', description: 'Dois.', children: { modifiers: [{ stat: 'FIS', value: 1, temporary: false }] } },
      ],
    });
    expect(sheets.rows('TraitLevels').filter((r) => r.trait_id === id).map((r) => r.id)).toEqual([`${id}.1`, `${id}.2`]);
    expect(sheets.rows('TraitLevelRequirements').at(-1)).toEqual({ level_id: `${id}.1`, group: 1, required_level_id: `${id}.2` });
    expect(sheets.rows('Modifiers').at(-1)).toMatchObject({ origin_id: `${id}.2`, stat: 'FIS' });
  });

  test('without a counter, numbering continues after the highest ID, and the counter is made', async () => {
    const d = data();
    d.Config = d.Config!.filter((r) => r.key !== 'next_id_RAS');
    const sheets = new FakeSheets(d);
    expect(await new SheetsAdapter(sheets).create('skill', { name: 'Nova', discipline_id: 'RAS', level: 1, status: 'draft' })).toBe('RAS-03');
    expect(sheets.rows('Config').at(-1)).toEqual({ key: 'next_id_RAS', value: 4 });
  });

  test('a counter behind the sheet is refused instead of making a duplicate ID', async () => {
    const d = data();
    d.Config!.find((r) => r.key === 'next_id_RAS')!.value = 2;
    await expect(new SheetsAdapter(new FakeSheets(d)).create('skill', { name: 'x', discipline_id: 'RAS', level: 1, status: 'draft' })).rejects.toThrow(/RAS-02 already exists/);
  });

  test('a full grid gets more rows first', async () => {
    const sheets = new FakeSheets(data(), { rowCount: 3 });
    await new SheetsAdapter(sheets).create('skill', { name: 'Nova', discipline_id: 'RAS', level: 1, status: 'draft' });
    expect(ids(sheets.rows('Skills'))).toEqual(['RAS-01', 'RAS-02', 'RAS-03']);
  });
});

describe('deleting permanently', () => {
  test('a trait goes with its levels, their requirements, modifiers and translations, and nothing else', async () => {
    const sheets = new FakeSheets(data());
    await new SheetsAdapter(sheets).deletePermanently('trait', 'FAC-14');
    expect(ids(sheets.rows('Traits'))).toEqual(['FAC-01']);
    expect(ids(sheets.rows('TraitLevels'))).toEqual(['FAC-01.1']);
    expect(sheets.rows('TraitLevelRequirements')).toEqual([]);
    expect(ids(sheets.rows('Modifiers'), 'origin_id')).toEqual(['FAC-01.1']);
    expect(sheets.rows('Translations').map((r) => r.id)).toEqual(['RAS-01']);
    // The Tables shrank with the rows: nothing left dangling below them.
    for (const tab of ['Traits', 'TraitLevels', 'Modifiers', 'Translations'] as const) expect(sheets.outside(tab)).toEqual([]);
  });

  test('several at once, in one write', async () => {
    const sheets = new FakeSheets(data());
    await new SheetsAdapter(sheets).deletePermanently('skill', ['RAS-01', 'RAS-02']);
    expect(sheets.rows('Skills')).toEqual([]);
    expect(sheets.rows('StatRequirements')).toEqual([]);
    expect(sheets.rows('Translations').map((r) => r.id)).toEqual(['FAC-14.2', 'FAC-14']);
    expect(sheets.sent).toHaveLength(1);
  });

  test('a skill goes with its stat requirements', async () => {
    const sheets = new FakeSheets(data());
    await new SheetsAdapter(sheets).deletePermanently('skill', 'RAS-02');
    expect(ids(sheets.rows('Skills'))).toEqual(['RAS-01']);
    expect(ids(sheets.rows('StatRequirements'), 'skill_id')).toEqual(['RAS-01']);
  });
});

describe('giving an ID back', () => {
  test('the last ID handed out goes back to the counter once its row is gone', async () => {
    const sheets = new FakeSheets(data());
    const adapter = new SheetsAdapter(sheets);
    const id = await adapter.create('skill', { name: 'Teste', discipline_id: 'RAS', level: 1, status: 'draft' });
    expect(await adapter.releaseId('skill', id)).toBe(false); // the row still exists
    await adapter.deletePermanently('skill', id);
    expect(await adapter.releaseId('skill', id)).toBe(true);
    expect(sheets.rows('Config').find((r) => r.key === 'next_id_RAS')!.value).toBe(3);
    expect(await adapter.create('skill', { name: 'De novo', discipline_id: 'RAS', level: 1, status: 'draft' })).toBe('RAS-03');
  });

  test('an older ID is not given back, since newer ones came after it', async () => {
    const sheets = new FakeSheets(data());
    const adapter = new SheetsAdapter(sheets);
    await adapter.deletePermanently('skill', 'RAS-01');
    expect(await adapter.releaseId('skill', 'RAS-01')).toBe(false);
    expect(sheets.rows('Config').find((r) => r.key === 'next_id_RAS')!.value).toBe(3);
  });
});

describe('saving a translation', () => {
  test('the English goes in its column, and Translations keeps the Portuguese it was written for', async () => {
    const sheets = new FakeSheets(data());
    await new SheetsAdapter(sheets).saveTranslation({ table: 'TraitLevels', id: 'FAC-14.2', field: 'description', enColumn: 'description_en', en: 'Smells awful.', pt: 'Cheira tão mal que assusta.' });
    expect(sheets.rows('TraitLevels').find((r) => r.id === 'FAC-14.2')!.description_en).toBe('Smells awful.');
    expect(sheets.rows('Translations').find((r) => r.id === 'FAC-14.2')!.manual_from).toBe('Cheira tão mal que assusta.');
    expect(sheets.sent).toHaveLength(1);
  });

  test("English written from the Editor's form keeps the snapshot in step too", async () => {
    const sheets = new FakeSheets(data());
    await new SheetsAdapter(sheets).update('skill', 'RAS-01', { name_en: 'First' });
    expect(sheets.rows('Translations').find((r) => r.id === 'RAS-01')!.manual_from).toBe('Primeira');
    await new SheetsAdapter(sheets).update('skill', 'RAS-02', { description: 'Nova.', description_en: 'New.' });
    expect(sheets.rows('Translations').at(-1)).toMatchObject({ id: 'RAS-02', field: 'description', manual_from: 'Nova.' });
  });

  test('a text without a Translations row gets one, and clearing the English clears the snapshot', async () => {
    const sheets = new FakeSheets(data());
    const adapter = new SheetsAdapter(sheets);
    await adapter.saveTranslation({ table: 'Skills', id: 'RAS-02', field: 'name', enColumn: 'name_en', en: 'Second', pt: 'Segunda' });
    expect(sheets.rows('Translations').at(-1)).toMatchObject({ table: 'Skills', id: 'RAS-02', field: 'name', manual_from: 'Segunda' });
    expect(String(sheets.rows('Translations').at(-1)!.auto_en)).toContain('GOOGLETRANSLATE');
    await adapter.saveTranslation({ table: 'Skills', id: 'RAS-02', field: 'name', enColumn: 'name_en', en: '', pt: 'Segunda' });
    expect(sheets.rows('Translations').at(-1)!.manual_from).toBe('');
    expect(sheets.rows('Skills').find((r) => r.id === 'RAS-02')!.name_en).toBe('');
  });
});

test('publishing a release adds a Releases row', async () => {
  const sheets = new FakeSheets(data());
  await new SheetsAdapter(sheets).publishRelease('1.1.0', 'Novas condições');
  expect(sheets.rows('Releases')).toEqual([{ version: '1.1.0', notes: 'Novas condições', requested_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) }]);
});
