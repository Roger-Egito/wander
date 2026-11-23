import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { defineContentType, label } from './define.ts';
import { emptyTables, TABS, type Tables, type TabName } from './schema.ts';
import { validationFormula } from './sheet-validation.ts';
import { validate } from './validate.ts';

/** A small Wander Data that passes every check, to plant one problem at a time in. */
function clean(): Tables {
  const t = emptyTables();
  t.Disciplines.push({ id: 'ARC', name: 'Arcanismo', source: 'Wander', status: 'playtest' });
  t.Categories.push({ name: 'Magia' }, { name: 'Ataque à Distância' });
  t.CastTimes.push({ name: '1 Ação' });
  t.Stats.push({ code: 'ESP' }, { code: 'FIS' });
  t.TraitTiers.push({ name: 'Ruim', pd_cost: -1 }, { name: 'Bom', pd_cost: 1 });
  const skill = (id: string, name: string) => ({
    id, name, discipline_id: 'ARC', level: 1, categories: 'Magia', cast_time: '1 Ação', cost_value: 10, cost_unit: 'Fadiga',
    description: 'Uma descrição longa o bastante.', source: 'Wander', status: 'playtest',
  });
  t.Skills.push(skill('ARC-01', 'Disparo Arcano'), skill('ARC-02', 'Ataque Arcano'), skill('ARC-03', 'Plantar Magia'));
  t.SkillRequirements.push({ skill_id: 'ARC-02', group: 1, required_skill_id: 'ARC-01' }, { skill_id: 'ARC-03', group: 1, required_skill_id: 'ARC-02' });
  t.StatRequirements.push({ skill_id: 'ARC-01', group: 1, stat: 'ESP', value: 5 });
  t.Conditions.push({ id: 'CON-01', name: 'Queimando', description: 'Sofre Dano de Fogo.', status: 'playtest' });
  t.Traits.push({ id: 'FAC-01', name: 'Senso de Direção', source: 'Wander', status: 'playtest' });
  t.CostScales.push({ name: 'Alvo' });
  t.TraitLevels.push(
    { id: 'FAC-01.1', trait_id: 'FAC-01', tier: 'Ruim', description: 'Você se perde fácil.' },
    { id: 'FAC-01.2', trait_id: 'FAC-01', tier: 'Bom', description: 'Você nunca se perde.' },
  );
  // Trait levels may require each other: equipping one equips the other.
  t.TraitLevelRequirements.push({ level_id: 'FAC-01.1', group: 1, required_level_id: 'FAC-01.2' }, { level_id: 'FAC-01.2', group: 1, required_level_id: 'FAC-01.1' });
  t.Modifiers.push({ origin_id: 'CON-01', stat: 'FIS', value: -1, temporary: true });
  t.Keywords.push({ id: 'PCH-01', name_pt: 'Teste', description_pt: 'Rolagem de 2d10.', url_pt: 'https://example.com', status: 'draft' });
  return t;
}

const found = (data: Tables) => validate(data).map((p) => `${p.problem} | ${p.table} | ${p.id}`);

describe('validate', () => {
  test('a clean Wander Data has no problems', () => {
    expect(validate(clean())).toEqual([]);
  });

  test('each planted problem is found, at the row it is in', () => {
    const cases: [string, (t: Tables) => void, string][] = [
      ['duplicate name', (t) => { t.Skills[1].name = 'disparo arcano'; }, 'duplicate name | Skills | ARC-02'],
      ['duplicate ID', (t) => { t.Conditions.push({ ...t.Conditions[0], name: 'Outra' }); }, 'duplicate ID | Conditions | CON-01'],
      ['missing name', (t) => { t.Traits[0].name = ''; }, 'missing name | Traits | FAC-01'],
      ['missing reference', (t) => { t.SkillRequirements[0].required_skill_id = 'XXX-99'; }, 'missing reference | SkillRequirements | ARC-02'],
      ['reference to a deleted skill', (t) => { t.Skills[0].status = 'deleted'; }, 'missing reference | SkillRequirements | ARC-02'],
      ['incomplete row', (t) => { t.SkillRequirements[0].required_skill_id = ''; }, 'incomplete row | SkillRequirements | ARC-02'],
      ['unknown stat', (t) => { t.StatRequirements[0].stat = 'ZZZ'; }, 'unknown value | StatRequirements | ARC-01'],
      ['unknown tier', (t) => { t.TraitLevels[0].tier = 'Bogus'; }, 'unknown value | TraitLevels | FAC-01.1'],
      ['unknown category', (t) => { t.Skills[0].categories = 'Magia, Ataque'; }, 'unknown value | Skills | ARC-01'],
      ['modifier without an origin', (t) => { t.Modifiers[0].origin_id = 'NOPE-1'; }, 'missing reference | Modifiers | NOPE-1'],
      ['text where a number goes', (t) => { t.StatRequirements[0].value = 'cinco'; }, 'not a number | StatRequirements | ARC-01'],
      ['level below 1', (t) => { t.Skills[0].level = 0; }, 'invalid number | Skills | ARC-01'],
      ['short description', (t) => { t.Conditions[0].description = 'aa'; }, 'missing description | Conditions | CON-01'],
      ['keyword without a link', (t) => { t.Keywords[0].url_pt = ''; }, 'missing rules link | Keywords | PCH-01'],
      ['unknown cost scale', (t) => { t.Skills[0].cost_scale = 'Nível'; }, 'unknown value | Skills | ARC-01'],
      ['requirement on a level that does not exist', (t) => { t.TraitLevelRequirements[0].required_level_id = 'FAC-09.9'; }, 'missing reference | TraitLevelRequirements | FAC-01.1'],
      ['requirement under a level that does not exist', (t) => { t.TraitLevelRequirements[0].level_id = 'FAC-09.9'; }, 'missing reference | TraitLevelRequirements | FAC-09.9'],
      ['missing level ID', (t) => { t.TraitLevels[0].id = ''; }, 'missing ID | TraitLevels | FAC-01'],
    ];
    for (const [name, plant, expected] of cases) {
      const data = clean();
      plant(data);
      expect(found(data), name).toContain(expected);
    }
  });

  test('a cycle is reported once per skill in it', () => {
    const data = clean();
    data.SkillRequirements.push({ skill_id: 'ARC-01', group: 1, required_skill_id: 'ARC-03' });
    expect(found(data).filter((p) => p.startsWith('requirement cycle')).sort()).toEqual([
      'requirement cycle | SkillRequirements | ARC-01',
      'requirement cycle | SkillRequirements | ARC-02',
      'requirement cycle | SkillRequirements | ARC-03',
    ]);
  });

  test('rows that are deleted, or under a deleted parent, are not checked', () => {
    const data = clean();
    data.Conditions[0].description = '';
    data.Conditions[0].status = 'deleted';
    data.Traits[0].status = 'deleted';
    data.TraitLevels[0].description = '';
    // Two levels down: a level requirement under a deleted trait.
    data.TraitLevelRequirements[0].group = 'um';
    // The condition is gone, so its modifier points at a deleted row: that still counts.
    expect(found(data)).toEqual([]);
  });
});

// The Phase 1 output, when the migration has been run here (its inputs are private).
const OUTPUT = fileURLToPath(new URL('../../../tools/migration/output/tables/', import.meta.url));
const migrated = existsSync(`${OUTPUT}Skills.json`);

test.skipIf(!migrated)('the migrated data has only the problems the migration report lists', () => {
  const data = Object.fromEntries((Object.keys(TABS) as TabName[]).map((t) => [t, JSON.parse(readFileSync(`${OUTPUT}${t}.json`, 'utf8'))])) as Tables;
  const problems = validate(data);
  expect(problems.every((p) => p.level === 'warning')).toBe(true);
  const count = (problem: string, table?: string) => problems.filter((p) => p.problem === problem && (!table || p.table === table)).length;
  expect(found(data)).toContain('unknown value | SkillRequirements | TRE-07');
  expect(count('missing description', 'Skills')).toBe(3);
  expect(count('missing description', 'Conditions')).toBe(7);
  expect(count('missing description', 'Keywords')).toBe(9);
  expect(count('missing rules link')).toBe(11);
  expect(problems).toHaveLength(31);
});

describe('content types', () => {
  test('a field naming a column that does not exist fails when the type is defined', () => {
    expect(() =>
      defineContentType({
        id: 'broken', tab: 'Conditions', label: { singular: label('x', 'x'), plural: label('x', 'x') },
        ids: { kind: 'counter', prefix: 'CON' }, nameKey: 'name', listColumns: [],
        fields: [{ key: 'nome', type: 'text', label: label('Nome', 'Name') }],
      }),
    ).toThrow(/"nome" is not a column of Conditions/);
  });
});

describe('the Validation formula', () => {
  const formula = validationFormula();

  test('its parentheses and quotes balance', () => {
    let depth = 0;
    let inString = false;
    for (const char of formula) {
      if (char === '"') inString = !inString;
      if (inString) continue;
      if (char === '(') depth++;
      if (char === ')') depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
    expect(inString).toBe(false);
  });

  test('it fits in a cell', () => {
    expect(formula.length).toBeLessThan(50_000);
  });
});
