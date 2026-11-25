/**
 * The generated row types, checked by the type checker (npm run typecheck): each line
 * fails to compile if entity.ts types that field wrongly. Vitest only runs the one test.
 */
import { expect, test } from 'vitest';
import type { Entities } from './entity.ts';

declare const e: Entities;

export function typeChecks() {
  const s = e.skill[0];
  const level: number | null = s.level;
  const status: 'draft' | 'alpha' | 'playtest' | 'official' | 'deleted' = s.status;
  const unit: '' | 'Fadiga' | 'Motivação' | 'Ferida' = s.cost_unit;
  const categories: string[] = s.categories;
  const nameEn: string = s.name_en;
  const group: number | null = s.stat_requirements[0].group;
  const parent: string = s.stat_requirements[0].skill_id;
  const level0 = e.trait[0].levels[0];
  const levelId: string = level0.id;
  const required: string = level0.requirements[0].required_level_id;
  const modifier: number = level0.modifiers[0].value;
  const descriptionEn: string = level0.description_en;
  const variants: string[] = e.keyword[0].variants_pt;
  const keywordEn: string = e.keyword[0].description_en;
  // @ts-expect-error not a column of Skills
  s.nope;
  // @ts-expect-error level requirement rows have no id of their own
  level0.requirements[0].id;
  return [level, status, unit, categories, nameEn, group, parent, levelId, required, modifier, descriptionEn, variants, keywordEn];
}

test('the row types compile (see npm run typecheck)', () => {
  expect(typeof typeChecks).toBe('function');
});
