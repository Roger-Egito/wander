import { describe, expect, test } from 'vitest';
import { emptyTables, type Tables } from '@wander/content';
import { changedValues, draftFrom, emptyDraft, isDirty, mergeDraft, nextChildId, PENDING_ID, problemsFor, typeById } from './draft.ts';

function tables(): Tables {
  const t = emptyTables();
  t.Disciplines.push({ id: 'RAS', name: 'Rascunho', source: 'Wander', status: 'playtest' });
  t.Stats.push({ code: 'ESP' }, { code: 'INF' });
  t.TraitTiers.push({ name: 'Ruim', pd_cost: -1 }, { name: 'Bom', pd_cost: 1 });
  t.Skills.push({ id: 'RAS-01', name: 'Primeira', discipline_id: 'RAS', level: 1, description: 'Uma descrição.', source: 'Wander', status: 'playtest' });
  t.StatRequirements.push({ skill_id: 'RAS-01', group: 1, stat: 'ESP', value: 5 });
  t.Traits.push({ id: 'FAC-14', name: 'Mau-Cheiro', source: 'Wander', status: 'playtest' });
  t.TraitLevels.push({ id: 'FAC-14.1', trait_id: 'FAC-14', tier: 'Ruim', description: 'Cheira mal.' }, { id: 'FAC-14.2', trait_id: 'FAC-14', tier: 'Bom', description: 'Assusta.' });
  t.TraitLevelRequirements.push({ level_id: 'FAC-14.1', group: 1, required_level_id: 'FAC-14.2' });
  t.Modifiers.push({ origin_id: 'FAC-14.2', stat: 'INF', value: -1, temporary: false });
  return t;
}

describe('drafts', () => {
  test('a trait loads with its levels, their requirements and modifiers', () => {
    const draft = draftFrom(typeById('trait'), tables(), 'FAC-14');
    expect(draft.values).toMatchObject({ id: 'FAC-14', name: 'Mau-Cheiro', name_en: '', status: 'playtest' });
    expect(draft.children.levels).toEqual([
      { id: 'FAC-14.1', tier: 'Ruim', description: 'Cheira mal.', description_en: '', children: { requirements: [{ group: 1, required_level_id: 'FAC-14.2' }], modifiers: [] } },
      { id: 'FAC-14.2', tier: 'Bom', description: 'Assusta.', description_en: '', children: { requirements: [], modifiers: [{ stat: 'INF', value: -1, temporary: false }] } },
    ]);
  });

  test('merging puts the unsaved draft in place of the saved row and its children', () => {
    const t = tables();
    const draft = draftFrom(typeById('skill'), t, 'RAS-01');
    draft.values.name = 'Renomeada';
    draft.children.stat_requirements = [{ group: 1, stat: 'INF', value: 3 }];
    const merged = mergeDraft(t, typeById('skill'), draft);
    expect(merged.Skills[0].name).toBe('Renomeada');
    expect(merged.StatRequirements).toEqual([{ group: 1, stat: 'INF', value: 3, skill_id: 'RAS-01' }]);
    // The originals are untouched.
    expect(t.Skills[0].name).toBe('Primeira');
    expect(t.StatRequirements[0].stat).toBe('ESP');
  });

  test("removing a level removes its requirements and modifiers from the merged data", () => {
    const t = tables();
    const draft = draftFrom(typeById('trait'), t, 'FAC-14');
    draft.children.levels = draft.children.levels.slice(0, 1);
    const merged = mergeDraft(t, typeById('trait'), draft);
    expect(merged.TraitLevels.map((r) => r.id)).toEqual(['FAC-14.1']);
    expect(merged.Modifiers).toEqual([]);
    expect(merged.TraitLevelRequirements).toEqual([{ group: 1, required_level_id: 'FAC-14.2', level_id: 'FAC-14.1' }]);
  });

  test('problems are the Validation rules, run on the draft as if saved', () => {
    const t = tables();
    const draft = draftFrom(typeById('skill'), t, 'RAS-01');
    expect(problemsFor(t, typeById('skill'), draft)).toEqual([]);
    draft.values.level = 0;
    draft.children.stat_requirements = [{ group: 1, stat: 'XYZ', value: 3 }];
    expect(problemsFor(t, typeById('skill'), draft).map((p) => `${p.problem}: ${p.detail}`).sort()).toEqual([
      'invalid number: level must be a whole number of at least 1',
      'unknown value: stat XYZ is not in Stats',
    ]);
  });

  test('a new row starts as a draft from Wander, with its pending ID', () => {
    const draft = emptyDraft(typeById('condition'));
    expect(draft.values).toMatchObject({ id: PENDING_ID, status: 'draft', name: '' });
    expect(draft.children).toEqual({ modifiers: [] });
    expect(problemsFor(tables(), typeById('condition'), draft).map((p) => p.problem)).toContain('missing name');
  });

  test('only changed columns are sent, and dirty means something changed', () => {
    const t = tables();
    const saved = draftFrom(typeById('skill'), t, 'RAS-01');
    const draft = structuredClone(saved);
    expect(isDirty(saved, draft)).toBe(false);
    draft.values.name = 'Outra';
    expect(changedValues(saved, draft)).toEqual({ name: 'Outra' });
    expect(isDirty(saved, draft)).toBe(true);
  });

  test("a new level gets its trait's next number", () => {
    expect(nextChildId('FAC-14', [{ id: 'FAC-14.1' }, { id: 'FAC-14.3' }])).toBe('FAC-14.4');
    expect(nextChildId(PENDING_ID, [])).toBe('NOVO.1');
  });
});
