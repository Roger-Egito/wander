import { describe, expect, test } from 'vitest';
import { emptyTables, type Tables } from '@wander/content';
import { dependentsOf, goesWith } from './dependents.ts';
import { typeById } from './draft.ts';

function tables(): Tables {
  const t = emptyTables();
  t.Disciplines.push({ id: 'RAS', name: 'Rascunho', status: 'playtest' }, { id: 'ARC', name: 'Arcanismo', status: 'playtest' });
  t.Skills.push(
    { id: 'ARC-01', name: 'Disparo', discipline_id: 'ARC', status: 'playtest' },
    { id: 'ARC-02', name: 'Ataque', discipline_id: 'ARC', status: 'playtest' },
    { id: 'RAS-01', name: 'Rascunho Um', discipline_id: 'RAS', status: 'draft' },
  );
  t.SkillRequirements.push({ skill_id: 'ARC-02', group: 1, required_skill_id: 'ARC-01' }, { skill_id: 'RAS-01', group: 1, required_skill_id: 'ARC-01' });
  t.StatRequirements.push({ skill_id: 'ARC-01', group: 1, stat: 'ESP', value: 5 });
  t.Traits.push({ id: 'FAC-14', name: 'Mau-Cheiro', status: 'playtest' }, { id: 'FAC-20', name: 'Perfume', status: 'playtest' });
  t.TraitLevels.push(
    { id: 'FAC-14.1', trait_id: 'FAC-14', tier: 'Ruim' }, { id: 'FAC-14.2', trait_id: 'FAC-14', tier: 'Bom' }, { id: 'FAC-20.1', trait_id: 'FAC-20', tier: 'Bom' },
  );
  t.TraitLevelRequirements.push(
    { level_id: 'FAC-14.1', group: 1, required_level_id: 'FAC-14.2' },
    { level_id: 'FAC-20.1', group: 1, required_level_id: 'FAC-14.1' },
  );
  t.Modifiers.push({ origin_id: 'FAC-14.2', stat: 'INF', value: -1 });
  t.Translations.push({ table: 'Traits', id: 'FAC-14', field: 'name' }, { table: 'TraitLevels', id: 'FAC-14.1', field: 'description' }, { table: 'Skills', id: 'ARC-01', field: 'name' });
  return t;
}

const show = (deps: ReturnType<typeof dependentsOf>) => deps.map((d) => `${d.id} → ${d.target} (${d.via.en})`);

describe('what depends on the selected rows', () => {
  test('skills that require a selected skill', () => {
    expect(show(dependentsOf(tables(), typeById('skill'), ['ARC-01']))).toEqual(['ARC-02 → ARC-01 (Skill)', 'RAS-01 → ARC-01 (Skill)']);
  });

  test("a row selected with the one it points at isn't its dependent", () => {
    expect(show(dependentsOf(tables(), typeById('skill'), ['ARC-01', 'ARC-02']))).toEqual(['RAS-01 → ARC-01 (Skill)']);
  });

  test('the skills of a selected discipline', () => {
    expect(show(dependentsOf(tables(), typeById('discipline'), ['RAS']))).toEqual(['RAS-01 → RAS (Discipline)']);
  });

  test("another trait's level that requires a selected trait's level, but not the trait's own", () => {
    expect(show(dependentsOf(tables(), typeById('trait'), ['FAC-14']))).toEqual(['FAC-20 → FAC-14.1 (Level)']);
  });
});

test('a permanent delete takes levels, their requirements and modifiers, and Translations rows', () => {
  expect(goesWith(tables(), typeById('trait'), ['FAC-14'])).toEqual({ TraitLevels: 2, TraitLevelRequirements: 1, Modifiers: 1, Translations: 2 });
  expect(goesWith(tables(), typeById('skill'), ['ARC-01'])).toEqual({ StatRequirements: 1, Translations: 1 });
});
