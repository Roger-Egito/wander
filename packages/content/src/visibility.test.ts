import { describe, expect, test } from 'vitest';
import { AUDIENCES, visibleTables, type Audience } from './visibility.ts';
import { emptyTables, type Tables } from './schema.ts';

/** A public discipline and an alpha one, skills in each status, and the rows around them. */
function data(): Tables {
  const t = emptyTables();
  t.Disciplines.push(
    { id: 'ARC', name: 'Arcanismo', source: 'Wander', status: 'playtest' },
    { id: 'OUT', name: 'Outward', source: 'Outward', status: 'alpha' },
  );
  t.Skills.push(
    { id: 'ARC-01', name: 'Disparo Arcano', discipline_id: 'ARC', level: 1, source: 'Wander', status: 'playtest' },
    { id: 'ARC-02', name: 'Ataque Arcano', discipline_id: 'ARC', level: 2, source: 'Wander', status: 'official' },
    { id: 'ARC-03', name: 'Ideia Solta', discipline_id: 'ARC', level: 1, source: 'Wander', status: 'draft' },
    { id: 'OUT-01', name: 'Raio', discipline_id: 'OUT', level: 1, source: 'Outward', status: 'alpha' },
  );
  t.SkillRequirements.push({ skill_id: 'ARC-02', group: 1, required_skill_id: 'ARC-01' });
  t.StatRequirements.push({ skill_id: 'ARC-01', group: 1, stat: 'ESP', value: 5 }, { skill_id: 'OUT-01', group: 1, stat: 'ESP', value: 3 });
  t.Conditions.push(
    { id: 'CON-01', name: 'Queimando', status: 'playtest' },
    { id: 'CON-02', name: 'Dor', status: 'draft' },
  );
  t.Traits.push(
    { id: 'FAC-01', name: 'Senso de Direção', source: 'Wander', status: 'playtest' },
    { id: 'FAC-02', name: 'Segredo', source: 'Wander', status: 'deleted' },
  );
  t.TraitLevels.push(
    { id: 'FAC-01.1', trait_id: 'FAC-01', tier: 'Ruim' },
    { id: 'FAC-01.2', trait_id: 'FAC-01', tier: 'Bom' },
    { id: 'FAC-02.1', trait_id: 'FAC-02', tier: 'Bom' },
  );
  t.TraitLevelRequirements.push({ level_id: 'FAC-01.1', group: 1, required_level_id: 'FAC-01.2' }, { level_id: 'FAC-02.1', group: 1, required_level_id: 'FAC-01.1' });
  t.Modifiers.push(
    { origin_id: 'CON-01', stat: 'FIS', value: -1 },
    { origin_id: 'CON-02', stat: 'FIS', value: -1 },
    { origin_id: 'FAC-01.2', stat: 'SEN', value: 1 },
    { origin_id: 'FAC-02.1', stat: 'SEN', value: 1 },
  );
  t.Keywords.push({ id: 'PCH-01', name_pt: 'Teste', status: 'playtest' }, { id: 'PCH-02', name_pt: 'Rascunho', status: 'draft' });
  t.Translations.push(
    { table: 'Skills', id: 'ARC-01', field: 'name', auto_en: 'Arcane Shot' },
    { table: 'Skills', id: 'OUT-01', field: 'name', auto_en: 'Lightning' },
    { table: 'TraitLevels', id: 'FAC-01.1', field: 'description', auto_en: 'Bad' },
    { table: 'TraitLevels', id: 'FAC-02.1', field: 'description', auto_en: 'Good' },
  );
  t.Stats.push({ code: 'ESP' });
  t.Categories.push({ name: 'Magia' });
  t.Releases.push({ version: '0.1.0-beta', notes: 'Primeira versão' });
  t.Config.push({ key: 'req_display', value: 'emoji' }, { key: 'next_id_ARC', value: 4 }, { key: 'backup_keep', value: 10 });
  t.Validation.push({ problem: 'missing description', table: 'Skills', id: 'ARC-03' });
  return t;
}

const idsOf = (rows: Tables[keyof Tables], key = 'id') => rows.map((r) => r[key]);

const ALL = Object.keys(AUDIENCES) as Audience[];

describe('visibleTables', () => {
  test('the public sees only playtest and official rows', () => {
    const { tables } = visibleTables(data(), 'public');
    expect(idsOf(tables.Disciplines)).toEqual(['ARC']);
    expect(idsOf(tables.Skills)).toEqual(['ARC-01', 'ARC-02']);
    expect(idsOf(tables.Conditions)).toEqual(['CON-01']);
    expect(idsOf(tables.Traits)).toEqual(['FAC-01']);
    expect(idsOf(tables.Keywords)).toEqual(['PCH-01']);
  });

  test('a missing or unknown status is hidden from every audience', () => {
    const t = data();
    t.Conditions[0].status = '';
    t.Keywords[0].status = 'Playtest?';
    for (const audience of ALL) {
      const { tables } = visibleTables(t, audience);
      expect(tables.Conditions).toEqual([]);
      expect(tables.Keywords).toEqual([]);
    }
  });

  test('status is read the way validation reads it, ignoring case and spaces', () => {
    const t = data();
    t.Conditions[0].status = ' Playtest ';
    expect(idsOf(visibleTables(t, 'public').tables.Conditions)).toEqual(['CON-01']);
  });

  test('child rows, modifiers and translations go with their row', () => {
    const { tables } = visibleTables(data(), 'public');
    expect(idsOf(tables.StatRequirements, 'skill_id')).toEqual(['ARC-01']);
    expect(idsOf(tables.SkillRequirements, 'skill_id')).toEqual(['ARC-02']);
    expect(idsOf(tables.TraitLevels)).toEqual(['FAC-01.1', 'FAC-01.2']);
    expect(idsOf(tables.TraitLevelRequirements, 'level_id')).toEqual(['FAC-01.1']);
    expect(idsOf(tables.Modifiers, 'origin_id')).toEqual(['CON-01', 'FAC-01.2']);
    expect(tables.Translations.map((r) => `${r.table}|${r.id}`)).toEqual(['Skills|ARC-01', 'TraitLevels|FAC-01.1']);
  });

  test('the Alpha group also sees alpha rows, never drafts', () => {
    const { tables } = visibleTables(data(), 'alpha');
    expect(idsOf(tables.Disciplines)).toEqual(['ARC', 'OUT']);
    expect(idsOf(tables.Skills)).toEqual(['ARC-01', 'ARC-02', 'OUT-01']);
    expect(idsOf(tables.StatRequirements, 'skill_id')).toEqual(['ARC-01', 'OUT-01']);
    expect(tables.Translations.map((r) => `${r.table}|${r.id}`)).toContain('Skills|OUT-01');
  });

  test('no audience sees a draft or a deleted row', () => {
    for (const audience of ALL) {
      const { tables } = visibleTables(data(), audience);
      expect(idsOf(tables.Skills)).not.toContain('ARC-03');
      expect(idsOf(tables.Conditions)).not.toContain('CON-02');
      expect(idsOf(tables.Traits)).not.toContain('FAC-02');
      expect(idsOf(tables.Keywords)).not.toContain('PCH-02');
    }
  });

  test('a playtest skill of an alpha discipline is withheld from the public and reported', () => {
    const t = data();
    t.Skills[3].status = 'playtest';
    const { tables, withheld } = visibleTables(t, 'public');
    expect(idsOf(tables.Skills)).toEqual(['ARC-01', 'ARC-02']);
    expect(idsOf(tables.StatRequirements, 'skill_id')).toEqual(['ARC-01']);
    expect(withheld).toEqual([{ table: 'Skills', id: 'OUT-01', because: 'OUT' }]);
    expect(visibleTables(t, 'alpha').withheld).toEqual([]);
  });

  test('a requirement on an alpha skill is lost for the public and kept for the Alpha group', () => {
    const t = data();
    t.SkillRequirements.push({ skill_id: 'ARC-01', group: 1, required_skill_id: 'OUT-01' });
    expect(visibleTables(t, 'public').lostLinks).toEqual([{ table: 'Skills', id: 'ARC-01', via: 'SkillRequirements', field: 'required_skill_id', target: 'OUT-01' }]);
    const alpha = visibleTables(t, 'alpha');
    expect(alpha.lostLinks).toEqual([]);
    expect(alpha.tables.SkillRequirements).toHaveLength(2);
  });

  test('a requirement on a draft skill is dropped and reported', () => {
    const t = data();
    t.SkillRequirements.push({ skill_id: 'ARC-01', group: 1, required_skill_id: 'ARC-03' });
    const { tables, lostLinks } = visibleTables(t, 'public');
    expect(tables.SkillRequirements).toEqual([{ skill_id: 'ARC-02', group: 1, required_skill_id: 'ARC-01' }]);
    expect(lostLinks).toEqual([{ table: 'Skills', id: 'ARC-01', via: 'SkillRequirements', field: 'required_skill_id', target: 'ARC-03' }]);
  });

  test("a requirement on a deleted trait's level is dropped and reported", () => {
    const t = data();
    t.TraitLevelRequirements.push({ level_id: 'FAC-01.2', group: 1, required_level_id: 'FAC-02.1' });
    const { tables, lostLinks } = visibleTables(t, 'public');
    expect(idsOf(tables.TraitLevelRequirements, 'level_id')).toEqual(['FAC-01.1']);
    expect(lostLinks).toEqual([{ table: 'Traits', id: 'FAC-01', via: 'TraitLevelRequirements', field: 'required_level_id', target: 'FAC-02.1' }]);
  });

  test('a requirement by category alone is kept', () => {
    const t = data();
    t.SkillRequirements.push({ skill_id: 'ARC-01', group: 1, required_skill_id: '', required_categories: 'Magia' });
    const { tables, lostLinks } = visibleTables(t, 'public');
    expect(tables.SkillRequirements).toHaveLength(2);
    expect(lostLinks).toEqual([]);
  });

  test('lookup tabs and releases are shared, Config only its display settings, Validation never', () => {
    const { tables } = visibleTables(data(), 'public');
    expect(tables.Stats).toEqual([{ code: 'ESP' }]);
    expect(tables.Categories).toEqual([{ name: 'Magia' }]);
    expect(tables.Releases).toHaveLength(1);
    expect(tables.Config).toEqual([{ key: 'req_display', value: 'emoji' }]);
    expect(tables.Validation).toEqual([]);
  });

  test('designer notes and what inspired a row stay out of the public snapshot only', () => {
    const t = data();
    Object.assign(t.Skills[0], { notes: 'Ideia: mais forte no B2.', inspired_by: 'WWN', stolen_from: 'Outward' });
    Object.assign(t.Traits[0], { notes: 'Rever o custo.', notes_en: 'Revisit the cost.' });
    t.Translations.push({ table: 'Traits', id: 'FAC-01', field: 'notes', auto_en: 'Review the cost.' });
    const pub = visibleTables(t, 'public').tables;
    for (const key of ['notes', 'inspired_by', 'stolen_from']) expect(pub.Skills[0]).not.toHaveProperty(key);
    expect(pub.Traits[0]).not.toHaveProperty('notes');
    expect(pub.Traits[0]).not.toHaveProperty('notes_en');
    expect(pub.Translations.some((r) => r.field === 'notes')).toBe(false);
    // Everything else on the row is still there.
    expect(pub.Skills[0]).toMatchObject({ id: 'ARC-01', name: 'Disparo Arcano' });
    const alpha = visibleTables(t, 'alpha').tables;
    expect(alpha.Skills[0]).toMatchObject({ notes: 'Ideia: mais forte no B2.', inspired_by: 'WWN', stolen_from: 'Outward' });
    expect(alpha.Translations.some((r) => r.field === 'notes')).toBe(true);
  });

  test('the input is left as it was', () => {
    const t = data();
    const before = structuredClone(t);
    for (const audience of ALL) visibleTables(t, audience);
    expect(t).toEqual(before);
  });
});
