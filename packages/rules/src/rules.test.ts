import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { emptyTables, STATS, TABS, type Tables, type TabName } from '@wander/content';
import { costsOf, levelGroups, loadContent, pdCost, positionOf, skillGroups, statGroups, type Content } from './domain.ts';
import { formatCost, formatSkillRequirements, formatStatRequirements } from './format.ts';
import { checkSkill, planTraitLevel, TRAIT_LIMITS, type Character } from './requirements.ts';

/** A few rows of every kind, written out of order where order is computed. */
function fixture(): Tables {
  const t = emptyTables();
  t.Stats.push(...STATS.map((stat) => ({ ...stat })));
  t.Config.push({ key: 'req_display', value: 'emoji' });
  t.Categories.push({ name: 'Magia', name_en: 'Magic' }, { name: 'Trevas', name_en: '' }, { name: 'Ataque', name_en: '' });
  t.TraitTiers.push({ name: 'Bom', pd_cost: 1 }, { name: 'Péssimo', pd_cost: -2 }, { name: 'Ruim', pd_cost: -1 }, { name: 'Neutro', pd_cost: 0 });
  t.Keywords.push({ id: 'PCH-41', name_pt: 'Fadiga', name_en: 'Fatigue', status: 'draft' });
  t.CostScales.push({ name: 'Alvo', name_en: 'Target' });
  const skill = (id: string, name: string, extra = {}) => ({ id, name, discipline_id: 'TRE', level: 1, categories: 'Magia, Trevas', status: 'playtest', ...extra });
  t.Skills.push(
    skill('TRE-01', 'Escuridão', { cost_value: 10, cost_unit: 'Fadiga' }),
    skill('TRE-02', 'Maldição', { cost_value: '5', cost_unit: 'Fadiga', cost_scale: 'Alvo', pos_x: 3, pos_y: '4' }),
    skill('TRE-03', 'Sombra', { cost_value: 1, cost_unit: 'Ferida', cost2_value: 1, cost2_unit: 'Motivação', categories: 'Ataque' }),
    skill('TRE-04', 'Apagada', { status: 'deleted' }),
  );
  t.StatRequirements.push(
    { skill_id: 'TRE-02', group: 2, stat: 'INS', value: 5 },
    { skill_id: 'TRE-02', group: 1, stat: 'SEN', value: 5 },
    { skill_id: 'TRE-03', group: 1, stat: 'FIS', value: 5 },
    { skill_id: 'TRE-03', group: 1, stat: 'TEC', value: 5 },
    { skill_id: 'TRE-03', group: 2, stat: 'ESP', value: 'cinco' },
  );
  t.SkillRequirements.push(
    { skill_id: 'TRE-02', group: 1, required_skill_id: 'TRE-01' },
    { skill_id: 'TRE-03', group: 1, required_categories: 'Magia, Trevas' },
  );
  t.Traits.push({ id: 'FAC-01', name: 'Senso de Direção', status: 'playtest' }, { id: 'FAC-02', name: 'Sortudo', status: 'deleted' });
  t.TraitLevels.push(
    { id: 'FAC-01.3', trait_id: 'FAC-01', tier: 'Bom', description: 'Vantagem.' },
    { id: 'FAC-01.1', trait_id: 'FAC-01', tier: 'Péssimo', description: 'Sempre perdido.' },
    { id: 'FAC-01.2', trait_id: 'FAC-01', tier: 'ruim', description: 'Desvantagem.' },
    { id: 'FAC-01.4', trait_id: 'FAC-01', tier: 'Inventado', description: '?' },
  );
  t.Modifiers.push({ origin_id: 'FAC-01.3', stat: 'SEN', value: 1, temporary: false }, { origin_id: 'FAC-01.3', stat: 'INS', value: 'x', temporary: 'TRUE' });
  return t;
}

describe('loadContent', () => {
  const content = loadContent(fixture());
  const skill = (id: string) => content.skillsById.get(id)!;

  test('sub-rows become groups, ordered by group number', () => {
    expect(statGroups(skill('TRE-02'))).toEqual([[{ stat: 'SEN', value: 5 }], [{ stat: 'INS', value: 5 }]]);
    // The row whose value is "cinco" is skipped: the Validation tab reports it.
    expect(statGroups(skill('TRE-03'))).toEqual([[{ stat: 'FIS', value: 5 }, { stat: 'TEC', value: 5 }]]);
    expect(skillGroups(skill('TRE-03'))).toEqual([[{ kind: 'categories', categories: ['Magia', 'Trevas'] }]]);
    expect(skill('TRE-02').stat_requirements[0]).toEqual({ skill_id: 'TRE-02', group: 2, stat: 'INS', value: 5 });
  });

  test('numbers are parsed, and costs and positions gathered', () => {
    expect(costsOf(skill('TRE-02'))).toEqual([{ value: 5, unit: 'Fadiga', scale: 'Alvo' }]);
    expect(positionOf(skill('TRE-02'))).toEqual({ x: 3, y: 4 });
    expect(costsOf(skill('TRE-03'))).toEqual([{ value: 1, unit: 'Ferida', scale: '' }, { value: 1, unit: 'Motivação', scale: '' }]);
    expect(positionOf(skill('TRE-01'))).toBeNull();
    expect(skill('TRE-01').categories).toEqual(['Magia', 'Trevas']);
  });

  test('deleted rows are left out unless asked for', () => {
    expect(content.skillsById.has('TRE-04')).toBe(false);
    expect(content.trait.map((t) => t.id)).toEqual(['FAC-01']);
    expect(loadContent(fixture(), { includeDeleted: true }).skillsById.has('TRE-04')).toBe(true);
  });

  test('tiers and trait levels go worst to best, unknown tiers last', () => {
    expect(content.tiers.map((t) => t.name)).toEqual(['Péssimo', 'Ruim', 'Neutro', 'Bom']);
    expect(content.trait[0].levels.map((l) => [l.id, pdCost(content, l)])).toEqual([['FAC-01.1', -2], ['FAC-01.2', -1], ['FAC-01.3', 1], ['FAC-01.4', null]]);
    expect(content.traitLevelsById.get('FAC-01.3')!.modifiers).toEqual([{ stat: 'SEN', value: 1, temporary: false }]);
  });
});

describe('formatting', () => {
  const content = loadContent(fixture());
  const s = (stat: string, value: number) => ({ stat, value });

  test('stat requirements, emoji', () => {
    const f = (groups: { stat: string; value: number }[][]) => formatStatRequirements(groups, content, { language: 'pt' });
    expect(f([[s('ESP', 5)]])).toBe('🔥5');
    expect(f([[s('SEN', 5)], [s('INS', 5)]])).toBe('👁️5🧘5');
    expect(f([[s('FIS', 5), s('TEC', 5)]])).toBe('💪5 ou 🔧5');
    expect(f([[s('FIS', 5), s('TEC', 5)], [s('INS', 5)]])).toBe('(💪5 ou 🔧5)🧘5');
    // Deslocamento has no emoji, so the whole thing falls back to words between groups.
    expect(f([[s('ESP', 5)], [s('DES', 3)]])).toBe('🔥5 e 3 DES');
  });

  test('stat requirements, text, in both languages', () => {
    const groups = [[s('FIS', 5), s('TEC', 5), s('SEN', 5)]];
    expect(formatStatRequirements(groups, content, { language: 'pt', display: 'text' })).toBe('5 FÍS, 5 TÉC ou 5 SEN');
    expect(formatStatRequirements(groups, content, { language: 'en', display: 'text' })).toBe('5 PHY, 5 TEC, or 5 SEN');
    expect(formatStatRequirements([[s('SEN', 5)], [s('INS', 5)]], content, { language: 'pt', display: 'text' })).toBe('5 SEN e 5 INS');
  });

  test('costs', () => {
    const cost = (id: string, language: 'pt' | 'en' = 'pt') => formatCost(costsOf(content.skillsById.get(id)!), content, language);
    expect(cost('TRE-01')).toBe('10 Fadiga');
    expect(cost('TRE-02')).toBe('5 Fadiga por Alvo');
    expect(cost('TRE-03')).toBe('1 Ferida e 1 Motivação');
    // Fatigue comes from the Fadiga keyword's name_en and Target from CostScales. Ferida has
    // no keyword here, so it falls back to Portuguese.
    expect(cost('TRE-02', 'en')).toBe('5 Fatigue per Target');
    expect(cost('TRE-03', 'en')).toBe('1 Ferida and 1 Motivação');
    expect(formatCost([], content, 'pt')).toBe('');
  });

  test('skill requirements', () => {
    const skill = (skill_id: string) => ({ kind: 'skill' as const, skill_id });
    const any = (...categories: string[]) => ({ kind: 'categories' as const, categories });
    expect(formatSkillRequirements([[skill('TRE-01')], [skill('TRE-02')]], content, 'pt')).toBe('Escuridão e Maldição');
    expect(formatSkillRequirements([[skill('TRE-01'), skill('TRE-02'), skill('TRE-03')]], content, 'pt')).toBe('Escuridão, Maldição ou Sombra');
    expect(formatSkillRequirements([[any('Magia', 'Trevas', 'Ataque')], [skill('TRE-02')]], content, 'pt')).toBe('Qualquer (Magia, Trevas, Ataque) e Maldição');
    expect(formatSkillRequirements([[any('magia', 'Trevas')]], content, 'en')).toBe('Any (Magic, Trevas)');
    expect(formatSkillRequirements([[skill('TRE-01'), skill('TRE-02')], [skill('TRE-03')]], content, 'pt')).toBe('(Escuridão ou Maldição) e Sombra');
    expect(formatSkillRequirements([[skill('TRE-04')]], content, 'pt')).toBe('TRE-04');
  });

  test('English falls back to the automatic translation, then to Portuguese', () => {
    const t = fixture();
    t.Translations.push(
      { table: 'Skills', id: 'TRE-01', field: 'name', auto_en: 'Darkness' },
      { table: 'Categories', id: 'Trevas', field: 'name', auto_en: 'Darknesses' },
      { table: 'Categories', id: 'Magia', field: 'name', auto_en: 'Magician' },
    );
    t.Skills[1].name_en = 'Curse';
    const c = loadContent(t);
    const skill = (skill_id: string) => ({ kind: 'skill' as const, skill_id });
    // TRE-01 has only the automatic one, TRE-02 a hand-written one, TRE-03 neither.
    expect(formatSkillRequirements([[skill('TRE-01')], [skill('TRE-02')], [skill('TRE-03')]], c, 'en')).toBe('Darkness, Curse, and Sombra');
    // Magia's hand-written "Magic" wins over the automatic "Magician".
    expect(formatSkillRequirements([[{ kind: 'categories', categories: ['Magia', 'Trevas'] }]], c, 'en')).toBe('Any (Magic, Darknesses)');
    expect(formatSkillRequirements([[skill('TRE-01')]], c, 'pt')).toBe('Escuridão');
  });
});

describe('requirement checks', () => {
  const content = loadContent(fixture());
  const skill = (id: string) => content.skillsById.get(id)!;
  const character = (over: Partial<Character> = {}): Character => ({ stats: {}, skill_ids: [], trait_level_ids: [], ...over });

  test('every stat group needs one alternative high enough', () => {
    expect(checkSkill(character({ stats: { SEN: 5 } }), skill('TRE-02'), content).map((u) => u.kind)).toEqual(['stat', 'skill']);
    expect(checkSkill(character({ stats: { SEN: 5, INS: 6 }, skill_ids: ['TRE-01'] }), skill('TRE-02'), content)).toEqual([]);
    expect(checkSkill(character({ stats: { TEC: 5 } }), skill('TRE-03'), content).map((u) => u.kind)).toEqual(['skill']);
  });

  test('a category requirement needs another skill with every category', () => {
    const has = (skill_ids: string[]) => checkSkill(character({ stats: { FIS: 5 }, skill_ids }), skill('TRE-03'), content);
    expect(has(['TRE-01'])).toEqual([]);
    expect(has([])).toEqual([{ kind: 'skill', options: [{ kind: 'categories', categories: ['Magia', 'Trevas'] }] }]);
  });

  test('a skill already taken is reported as such', () => {
    expect(checkSkill(character({ skill_ids: ['TRE-01'] }), skill('TRE-01'), content)).toEqual([{ kind: 'alreadyHas' }]);
  });

});

describe('equipping trait levels', () => {
  /** Mau-Cheiro: Ruim and Bom require each other. Identidade Neutro needs Bom or Péssimo. */
  function traits(): Tables {
    const t = fixture();
    t.TraitTiers.push({ name: 'Ótimo', pd_cost: 2 });
    t.Traits.push({ id: 'FAC-14', name: 'Mau-Cheiro', status: 'playtest' }, { id: 'FAC-06', name: 'Identidade', status: 'playtest' });
    t.TraitLevels.push(
      { id: 'FAC-14.1', trait_id: 'FAC-14', tier: 'Ruim' }, { id: 'FAC-14.2', trait_id: 'FAC-14', tier: 'Bom' },
      { id: 'FAC-06.2', trait_id: 'FAC-06', tier: 'Péssimo' }, { id: 'FAC-06.4', trait_id: 'FAC-06', tier: 'Neutro' },
      { id: 'FAC-06.5', trait_id: 'FAC-06', tier: 'Bom' }, { id: 'FAC-06.6', trait_id: 'FAC-06', tier: 'Ótimo' },
    );
    t.TraitLevelRequirements.push(
      { level_id: 'FAC-14.1', group: 1, required_level_id: 'FAC-14.2' },
      { level_id: 'FAC-14.2', group: 1, required_level_id: 'FAC-14.1' },
      { level_id: 'FAC-06.4', group: 1, required_level_id: 'FAC-06.5' },
      { level_id: 'FAC-06.4', group: 1, required_level_id: 'FAC-06.2' },
    );
    return t;
  }
  const content = loadContent(traits());
  const character = (trait_level_ids: string[] = []): Character => ({ stats: {}, skill_ids: [], trait_level_ids });

  test('requirement rows load as groups of alternatives', () => {
    expect(levelGroups(content.traitLevelsById.get('FAC-06.4')!)).toEqual([['FAC-06.5', 'FAC-06.2']]);
  });

  test('a requirement comes along, and a cycle stops at the level that started it', () => {
    expect(planTraitLevel(character(), 'FAC-14.1', content)).toEqual({ add: ['FAC-14.1', 'FAC-14.2'], unmet: [] });
    expect(planTraitLevel(character(['FAC-14.2']), 'FAC-14.1', content)).toEqual({ add: ['FAC-14.1'], unmet: [] });
  });

  test('alternatives: one already held is enough, otherwise the player picks', () => {
    expect(planTraitLevel(character(['FAC-06.2']), 'FAC-06.4', content).add).toEqual(['FAC-06.4']);
    expect(planTraitLevel(character(), 'FAC-06.4', content)).toEqual({ add: [], unmet: [{ kind: 'choose', level_id: 'FAC-06.4', options: ['FAC-06.5', 'FAC-06.2'] }] });
    expect(planTraitLevel(character(), 'FAC-06.4', content, ['FAC-06.5']).add).toEqual(['FAC-06.4', 'FAC-06.5']);
  });

  test('levels are not exclusive, and the same one can be taken again', () => {
    expect(planTraitLevel(character(['FAC-06.5']), 'FAC-06.6', content).add).toEqual(['FAC-06.6']);
    expect(planTraitLevel(character(['FAC-06.5']), 'FAC-06.5', content).add).toEqual(['FAC-06.5']);
  });

  test(`at most ${TRAIT_LIMITS.facilidade} Facilidades and ${TRAIT_LIMITS.complicacao} Complicações, every level counted`, () => {
    const four = character(['FAC-06.5', 'FAC-06.5', 'FAC-06.6', 'FAC-01.3']);
    expect(planTraitLevel(four, 'FAC-06.6', content).unmet).toEqual([]);
    expect(planTraitLevel(character([...four.trait_level_ids, 'FAC-06.6']), 'FAC-06.5', content).unmet).toEqual([{ kind: 'traitLimit', trait: 'facilidade', limit: 5, total: 6 }]);
    // Mau-Cheiro Ruim is a Complicação, but it brings Bom along: with five Facilidades
    // held, that's a sixth, so Ruim is refused too.
    expect(planTraitLevel(four, 'FAC-14.1', content)).toEqual({ add: ['FAC-14.1', 'FAC-14.2'], unmet: [] });
    expect(planTraitLevel(character([...four.trait_level_ids, 'FAC-06.6']), 'FAC-14.1', content).unmet).toEqual([{ kind: 'traitLimit', trait: 'facilidade', limit: 5, total: 6 }]);
    const threeBad = character(['FAC-01.1', 'FAC-01.2', 'FAC-06.2']);
    expect(planTraitLevel(threeBad, 'FAC-01.2', content).unmet).toEqual([{ kind: 'traitLimit', trait: 'complicacao', limit: 3, total: 4 }]);
    expect(planTraitLevel(threeBad, 'FAC-06.4', content, ['FAC-06.5']).unmet).toEqual([]);
  });

  test('unknown levels and tiers are reported', () => {
    expect(planTraitLevel(character(), 'FAC-01.4', content).unmet).toEqual([{ kind: 'unknownTier', level_id: 'FAC-01.4', tier: 'Inventado' }]);
    expect(planTraitLevel(character(), 'FAC-99.1', content).unmet).toEqual([{ kind: 'unknownLevel', level_id: 'FAC-99.1' }]);
  });
});

// The Phase 1 output, when the migration has been run here (its inputs are private).
const OUTPUT = fileURLToPath(new URL('../../../tools/migration/output/tables/', import.meta.url));
const migrated = existsSync(`${OUTPUT}Skills.json`);

describe.skipIf(!migrated)('the migrated data', () => {
  const tables = () => Object.fromEntries((Object.keys(TABS) as TabName[]).map((t) => [t, JSON.parse(readFileSync(`${OUTPUT}${t}.json`, 'utf8'))])) as Tables;
  const content: Content = migrated ? loadContent(tables()) : (undefined as never);

  test('every requirement points at a skill that loaded', () => {
    const missing = content.skill.flatMap((s) => skillGroups(s).flat().flatMap((o) => (o.kind === 'skill' && !content.skillsById.has(o.skill_id) ? [`${s.id} → ${o.skill_id}`] : [])));
    expect(missing).toEqual([]);
  });

  test('every skill formats in both languages and displays', () => {
    for (const s of content.skill) {
      for (const language of ['pt', 'en'] as const) {
        for (const display of ['emoji', 'text'] as const) expect(formatStatRequirements(statGroups(s), content, { language, display })).not.toMatch(/undefined|NaN/);
        expect(formatCost(costsOf(s), content, language)).not.toMatch(/undefined|NaN/);
        expect(formatSkillRequirements(skillGroups(s), content, language)).not.toMatch(/undefined|[A-Z]{3}-\d/);
      }
    }
  });

  test('trait levels come out in the order their IDs were given', () => {
    for (const trait of content.trait) {
      const order = trait.levels.map((l) => Number(l.id.split('.')[1]));
      expect(order, trait.id).toEqual([...order].sort((a, b) => a - b));
    }
    expect(content.tiers.map((t) => t.name)).toEqual(tables().TraitTiers.map((t) => t.name));
  });
});
