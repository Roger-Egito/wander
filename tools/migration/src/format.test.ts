/**
 * The plan's check for @wander/rules: formatting what the migration parsed gives back
 * the text Fichas v15 had. The parser's input is the expected output, so a formatter
 * that drops a value, swaps "e" for "ou" or loses a cost unit fails here.
 *
 * Fichas v15 isn't consistent, so both sides are normalized first, and only in these
 * ways: emoji variation selectors (👁 and 👁️ are the same stat), "10 de Fadiga" for
 * "10 Fadiga", a comma before "ou", and a bare number under "Custo de Fadiga".
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { emptyTables, STATS } from '@wander/content';
import { formatCost, formatStatRequirements, loadContent, type Cost, type StatRequirement } from '@wander/rules';
import { isBlank, parseCost, parseStatRequirement } from './fields.ts';
import { isDisciplineTab, readDisciplineTab, type RawSkill } from './tabs.ts';
import { readWorkbook } from './workbook.ts';

const INPUT = fileURLToPath(new URL('../input/Fichas v15.xlsx', import.meta.url));
const hasInput = existsSync(INPUT);

const normalize = (text: string) => text.replace(/\uFE0F/g, '').replace(/(\d+) de /g, '$1 ').replace(/,\s*ou\b/g, ' ou').trim();

describe.skipIf(!hasInput)('formatting reproduces Fichas v15', async () => {
  const skills: RawSkill[] = [];
  if (hasInput) {
    for (const [tab, grid] of await readWorkbook(INPUT)) if (isDisciplineTab(grid)) skills.push(...readDisciplineTab(tab, grid).discipline.skills);
  }
  const tables = emptyTables();
  tables.Stats.push(...STATS.map((stat) => ({ ...stat })));
  const content = loadContent(tables);

  test('stat requirements', () => {
    let compared = 0;
    for (const raw of skills) {
      const parsed = parseStatRequirement(raw.statRequirement);
      if (isBlank(raw.statRequirement) || !parsed.ok) continue;
      const groups = new Map<number, StatRequirement[]>();
      for (const { group, stat, value } of parsed.value) groups.set(group, [...(groups.get(group) ?? []), { stat, value }]);
      const display = /\p{Extended_Pictographic}/u.test(raw.statRequirement) ? 'emoji' : 'text';
      const formatted = formatStatRequirements([...groups.values()], content, { language: 'pt', display });
      expect(normalize(formatted), `${raw.origin.tab}!${raw.origin.cell}`).toBe(normalize(raw.statRequirement));
      compared++;
    }
    // Every stat requirement in Fichas v15 parsed, so every one is compared.
    expect(compared).toBe(skills.filter((raw) => !isBlank(raw.statRequirement)).length);
  });

  test('costs', () => {
    let compared = 0;
    const unread: string[] = [];
    for (const raw of skills) {
      const defaultUnit = raw.costLabel === 'Custo de Fadiga' ? 'Fadiga' : '';
      const parsed = parseCost(raw.cost, defaultUnit);
      if (!parsed.ok) unread.push(raw.cost);
      if (isBlank(raw.cost) || !parsed.ok) continue;
      const { cost_value, cost_unit, cost_scale, cost2_value, cost2_unit } = parsed.value;
      const costs: Cost[] = [{ value: cost_value!, unit: cost_unit, scale: cost_scale }];
      if (cost2_value !== null) costs.push({ value: cost2_value, unit: cost2_unit, scale: '' });
      const expected = /^\d+$/.test(raw.cost.trim()) ? `${raw.cost.trim()} ${defaultUnit}` : raw.cost;
      expect(normalize(formatCost(costs, content, 'pt')), `${raw.origin.tab}!${raw.origin.cell}`).toBe(normalize(expected));
      compared++;
    }
    // The one cost the migration couldn't read is in its report and the skill's notes.
    expect(unread).toEqual(['- ou 10 Fadiga']);
    expect(compared).toBe(skills.filter((raw) => !isBlank(raw.cost)).length - unread.length);
  });
});
