/**
 * Turns the raw records from the tabs into Wander Data rows, and logs every decision
 * and problem for the report. Nothing is dropped or fixed without a report entry.
 */
import { castTimeOf, isBlank, parseCost, parseSkillRequirement, parseStatRequirement, type SkillRequirementOption } from './fields.ts';
import type { RulesSection } from './rules.ts';
import { seedConditions, seedKeywords, type Dictionary } from './seeds.ts';
import { emptyTables, STATS, type Row, type Tables } from '@wander/content';
import { compareTiers } from '@wander/rules';
import { isDisciplineTab, readDisciplineTab, readTraitsTab, type Origin, type RawSkill } from './tabs.ts';
import type { Grid } from './workbook.ts';

export interface Finding {
  kind: string;
  origin?: Origin;
  id?: string;
  detail: string;
}

/** Each discipline tab, by its header: ID prefix, display name, source game. */
const DISCIPLINES: Record<string, { code: string; name: string; source: string; skillStatus?: string }> = {
  'ARCANISMO': { code: 'ARC', name: 'Arcanismo', source: 'Wander' },
  'ATIRADOR': { code: 'ATI', name: 'Atirador', source: 'Wander' },
  'ALQUIMIA': { code: 'ALQ', name: 'Alquimia', source: 'Wander' },
  'CLARIVIDENCIA': { code: 'CLA', name: 'Clarividência', source: 'Wander' },
  'COMBATE': { code: 'COM', name: 'Combate', source: 'Wander' },
  'FOGO': { code: 'FOG', name: 'Fogo', source: 'Wander' },
  'GRAPPLING': { code: 'GRA', name: 'Grappling', source: 'Wander' },
  'LIDERANCA': { code: 'LID', name: 'Liderança', source: 'Wander' },
  'LUZ': { code: 'LUZ', name: 'Luz', source: 'Wander' },
  'TREVAS': { code: 'TRE', name: 'Trevas', source: 'Wander' },
  'VIDA': { code: 'VID', name: 'Vida', source: 'Wander' },
  '[RASCUNHO]': { code: 'RAS', name: 'Rascunho', source: 'Wander', skillStatus: 'draft' },
  '[CAIRN]': { code: 'CAI', name: 'Cairn', source: 'Cairn' },
  '[OSE]': { code: 'OSE', name: 'OSE', source: 'OSE' },
  '[WWN]': { code: 'WWN', name: 'WWN', source: 'WWN' },
  '[OUTWARD]': { code: 'OUT', name: 'Outward', source: 'Outward' },
  '[OUTWARD] PASSIVAS': { code: 'OUP', name: 'Outward Passivas', source: 'Outward' },
  '[OUTWARD] ESTAMINA': { code: 'OUE', name: 'Outward Estamina', source: 'Outward' },
};

const TRAITS_TAB = /benef[ií]cios/i;

/**
 * Tier costs I corrected after reading the migration report. Fichas v15 is never
 * written to, so its mistakes are fixed here and every one shows up in the report.
 */
const TIER_COST_CORRECTIONS: Record<string, number> = {
  Neutro: 0, // Fichas v15 says 1, the same as Bom (2026-11-22)
};
const MIGRATED_ON = '2026-11-22';

export const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/\s+/g, ' ').trim();
const pad = (n: number) => String(n).padStart(2, '0');
const SMALL_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o']);
/** "SENSO DE DIREÇÃO" → "Senso de Direção", "HOBBY / VÍCIO" → "Hobby / Vício". */
export const titleCase = (text: string) =>
  text.toLowerCase().split(/(\s+|\/|-)/).map((word, i) => (i > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1))).join('');

export function migrate(tabs: Map<string, Grid>, rules: RulesSection[]) {
  const tables: Tables = emptyTables();
  const findings: Finding[] = [];
  const note = (kind: string, detail: string, origin?: Origin, id?: string) => findings.push({ kind, detail, origin, id });

  /* --- disciplines and skills ---------------------------------------------------- */

  interface Pending { raw: RawSkill; row: Row; disciplineId: string; originalName: string }
  const pending: Pending[] = [];
  const counters = new Map<string, number>();
  const nextId = (prefix: string) => {
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    return `${prefix}-${pad(n)}`;
  };

  for (const [tab, grid] of tabs) {
    if (!isDisciplineTab(grid)) continue;
    const { discipline, unknownLabels } = readDisciplineTab(tab, grid);
    for (const origin of unknownLabels) note('unknown row label', `row label "${grid[Number(origin.cell.slice(1)) - 1]?.[0]}" isn't a skill field and was ignored`, origin);
    let config = DISCIPLINES[fold(discipline.header)];
    if (!config) {
      const code = fold(discipline.header).replace(/[^A-Z]/g, '').slice(0, 3);
      config = { code, name: titleCase(discipline.header), source: 'Wander' };
      note('new discipline', `no entry for "${discipline.header}" in DISCIPLINES, so it got the code ${code}`, { tab, cell: 'A1' });
    }
    if (tables.Disciplines.some((d) => d.id === config.code)) {
      note('duplicate discipline', `a second tab is headed "${discipline.header}": its skills join ${config.code}`, { tab, cell: 'A1' });
    } else {
      tables.Disciplines.push({
        id: config.code, name: config.name, name_en: '', color_dark: '', color_light: '', icon: '',
        description: discipline.note, description_en: '', source: config.source, status: 'playtest',
      });
      if (discipline.note) note('discipline note', `B1's note became the discipline's description`, { tab, cell: 'B1' }, config.code);
    }

    for (const raw of discipline.skills) {
      // "...", "... Arcano" and "-" are slots never filled in.
      if (/^(\.{3}|[-–]+$)/.test(raw.name)) {
        note('placeholder skipped', `"${raw.name}" is a placeholder name, so the column wasn't imported${raw.description ? ` (its description: "${raw.description.slice(0, 80)}")` : ''}`, raw.origin);
        continue;
      }
      const id = nextId(config.code);
      let status = config.skillStatus ?? 'playtest';
      let name = raw.name;
      const notes: string[] = raw.notes && !isBlank(raw.notes) ? [raw.notes] : [];
      if (!name) {
        name = `Sem nome (${config.name}, nível ${raw.level})`;
        status = 'draft';
        note('unnamed skill', `has a description but no name: imported as "${name}", status draft`, raw.origin, id);
      }
      if (isBlank(raw.description) || raw.description.trim().length < 4) {
        status = 'draft';
        note('empty description', `description is ${raw.description ? `"${raw.description}"` : 'empty'}: status draft`, raw.origin, id);
      }

      const cost = parseCost(raw.cost, raw.costLabel === 'Custo de Fadiga' ? 'Fadiga' : '');
      if (!cost.ok) {
        note('unread cost', `${cost.problem}: kept in notes, cost left empty`, raw.origin, id);
        notes.push(`Custo (não lido na migração): ${raw.cost}`);
      }
      const stats = parseStatRequirement(raw.statRequirement);
      if (stats.ok) for (const requirement of stats.value) tables.StatRequirements.push({ skill_id: id, ...requirement });
      else {
        note('unread stat requirement', `${stats.problem}: kept in notes`, raw.origin, id);
        notes.push(`Req. de Atr. (não lido na migração): ${raw.statRequirement}`);
      }

      const categories = isBlank(raw.categories) || raw.categories === '...' ? '' : raw.categories.split(',').map((c) => c.trim()).filter(Boolean).join(', ');
      const row: Row = {
        id, name, name_en: '', discipline_id: config.code, level: raw.level, categories,
        cast_time: castTimeOf(raw.castTime),
        cost_value: cost.ok ? cost.value.cost_value : null, cost_unit: cost.ok ? cost.value.cost_unit : '',
        cost_scale: cost.ok ? cost.value.cost_scale : '', cost2_value: cost.ok ? cost.value.cost2_value : null,
        cost2_unit: cost.ok ? cost.value.cost2_unit : '',
        description: raw.description, description_en: '', notes: notes.join('\n\n'),
        inspired_by: isBlank(raw.inspiredBy) ? '' : raw.inspiredBy, stolen_from: isBlank(raw.stolenFrom) ? '' : raw.stolenFrom,
        source: config.source, status, edited_at: MIGRATED_ON, pos_x: '', pos_y: '',
      };
      tables.Skills.push(row);
      pending.push({ raw, row, disciplineId: config.code, originalName: raw.name });
    }
  }

  // Unique names across every discipline: the second one gets " (2)", the third " (3)".
  const seen = new Map<string, number>();
  for (const p of pending) {
    const key = fold(String(p.row.name));
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count > 1) {
      const first = pending.find((q) => fold(q.originalName || String(q.row.name)) === key && q !== p);
      p.row.name = `${p.row.name} (${count})`;
      note('renamed duplicate', `"${p.originalName}" already exists${first ? ` as ${first.row.id}` : ''}: renamed to "${p.row.name}"`, p.raw.origin, String(p.row.id));
    }
  }

  // Skill requirements, by original name: same discipline first, then anywhere.
  const byName = new Map<string, Pending[]>();
  for (const p of pending) if (p.originalName) byName.set(fold(p.originalName), [...(byName.get(fold(p.originalName)) ?? []), p]);
  const allCategories = new Set(tables.Skills.flatMap((s) => String(s.categories).split(', ').filter(Boolean)).map(fold));

  for (const p of pending) {
    const parsed = parseSkillRequirement(p.raw.skillRequirement);
    const id = String(p.row.id);
    if (!parsed.ok) {
      note('unread skill requirement', `${parsed.problem}: kept in notes`, p.raw.origin, id);
      p.row.notes = [p.row.notes, `Req. de Hab. (não lido na migração): ${p.raw.skillRequirement}`].filter(Boolean).join('\n\n');
      continue;
    }
    if (parsed.value.length > 1 && parsed.value.every((g) => g.length === 1 && g[0].kind === 'skill')) {
      note('comma list read as "all of"', `"${p.raw.skillRequirement}" was read as needing every one of them. If it means any one, change the rows to share one group`, p.raw.origin, id);
    }
    parsed.value.forEach((options, i) => {
      for (const option of options) addRequirement(p, id, i + 1, option);
    });
  }

  function addRequirement(p: Pending, id: string, group: number, option: SkillRequirementOption) {
    if (option.kind === 'categories') {
      const unknown = option.categories.filter((c) => !allCategories.has(fold(c)));
      if (unknown.length) note('unknown category in requirement', `"Qualquer (${option.categories.join(', ')})" names categories no skill has: ${unknown.join(', ')}`, p.raw.origin, id);
      tables.SkillRequirements.push({ skill_id: id, group, required_skill_id: '', required_categories: option.categories.join(', ') });
      return;
    }
    const candidates = byName.get(fold(option.name)) ?? [];
    const target = candidates.find((c) => c.disciplineId === p.disciplineId) ?? candidates[0];
    if (!target) {
      note('unresolved requirement', `requires "${option.name}", which isn't the name of any skill: kept in notes`, p.raw.origin, id);
      p.row.notes = [p.row.notes, `Requisito não encontrado na migração: ${option.name}`].filter(Boolean).join('\n\n');
      return;
    }
    if (candidates.length > 1) {
      note('ambiguous requirement', `"${option.name}" matches ${candidates.map((c) => c.row.id).join(' and ')}: linked to ${target.row.id}${target.disciplineId === p.disciplineId ? ' (same discipline)' : ''}`, p.raw.origin, id);
    }
    if (target === p) note('self requirement', `requires itself ("${option.name}")`, p.raw.origin, id);
    tables.SkillRequirements.push({ skill_id: id, group, required_skill_id: String(target.row.id), required_categories: '' });
  }

  // Cycles in the prerequisite graph.
  const edges = new Map<string, string[]>();
  for (const r of tables.SkillRequirements) if (r.required_skill_id) edges.set(String(r.skill_id), [...(edges.get(String(r.skill_id)) ?? []), String(r.required_skill_id)]);
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (node: string, path: string[]) => {
    if (state.get(node) === 'done') return;
    if (state.get(node) === 'visiting') {
      note('requirement cycle', `${[...path.slice(path.indexOf(node)), node].join(' → ')}`, undefined, node);
      return;
    }
    state.set(node, 'visiting');
    for (const next of edges.get(node) ?? []) visit(next, [...path, node]);
    state.set(node, 'done');
  };
  for (const node of edges.keys()) visit(node, []);

  /* --- traits (Facilidades e Complicações) --------------------------------------- */

  const traitsTab = [...tabs.keys()].find((name) => TRAITS_TAB.test(name));
  if (!traitsTab) note('missing tab', 'no Facilidades e Complicações tab (named "Benefícios / Malefícios") was found');
  const { traits, looseText } = traitsTab ? readTraitsTab(traitsTab, tabs.get(traitsTab)!) : { traits: [], looseText: [] };
  for (const origin of looseText) note('rule text, not a trait', `"${tabs.get(traitsTab!)![Number(origin.cell.slice(1)) - 1]?.[0]}" is a rule, not a trait: not imported (the rules engine enforces it)`, origin);

  // A tier's PD cost belongs to the tier (Bom is always 1), so it's read from every
  // level first: each tier gets the cost most levels give it, and any level that
  // disagrees is reported.
  const costsSeen = new Map<string, { cost: number; origin: Origin }[]>();
  for (const level of traits.flatMap((t) => t.levels)) {
    const cost = Number(level.cost);
    if (level.cost === '' || !Number.isFinite(cost)) note('unread PD cost', `level "${level.tier}" has cost "${level.cost}"`, level.origin);
    else costsSeen.set(level.tier, [...(costsSeen.get(level.tier) ?? []), { cost, origin: level.origin }]);
  }
  const tierCost = new Map<string, number>();
  for (const [tier, seenCosts] of costsSeen) {
    const counts = new Map<number, number>();
    for (const { cost } of seenCosts) counts.set(cost, (counts.get(cost) ?? 0) + 1);
    const cost = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    tierCost.set(tier, cost);
    for (const other of seenCosts.filter((s) => s.cost !== cost)) {
      note('tier cost differs', `tier "${tier}" costs ${other.cost} here but ${cost} in most traits: TraitTiers uses ${cost}`, other.origin);
    }
  }
  for (const [tier, cost] of Object.entries(TIER_COST_CORRECTIONS)) {
    if (!tierCost.has(tier)) note('unused correction', `TIER_COST_CORRECTIONS has "${tier}", but no trait uses that tier`);
    else if (tierCost.get(tier) === cost) note('unused correction', `Fichas v15 already gives "${tier}" a cost of ${cost}: the correction can go`);
    else {
      note('corrected tier cost', `"${tier}" costs ${tierCost.get(tier)} in Fichas v15: corrected to ${cost}`);
      tierCost.set(tier, cost);
    }
  }
  // Worst to best, then alphabetical when two tiers cost the same. Trait levels use the
  // same order, so their IDs (FAC-01.1, .2, ...) count up from the worst level.
  const byTier = (a: string, b: string) => compareTiers({ name: a, pd_cost: tierCost.get(a) }, { name: b, pd_cost: tierCost.get(b) });
  for (const name of [...tierCost.keys()].sort(byTier)) tables.TraitTiers.push({ name, name_en: '', pd_cost: tierCost.get(name)! });

  for (const trait of traits) {
    const id = nextId('FAC');
    const join = (values: string[], field: string) => {
      if (values.length > 1) note('differs between levels', `${field} has ${values.length} different values across the levels, joined with " / "`, trait.origin, id);
      return values.join(' / ');
    };
    tables.Traits.push({
      id, name: titleCase(trait.name), name_en: '', notes: join(trait.notes, 'Notas'), notes_en: '',
      inspired_by: join(trait.inspiredBy, 'Inspirado em'), stolen_from: join(trait.stolenFrom, 'Roubado de'), source: 'Wander', status: 'playtest',
    });
    [...trait.levels].sort((a, b) => byTier(a.tier, b.tier)).forEach((level, i) => {
      const levelId = `${id}.${i + 1}`;
      if (!tierCost.has(level.tier)) note('tier without a cost', `tier "${level.tier}" has no readable PD cost anywhere, so it isn't in TraitTiers`, level.origin, levelId);
      if (isBlank(level.description)) note('empty description', `level "${level.tier}" has no description`, level.origin, levelId);
      tables.TraitLevels.push({ id: levelId, trait_id: id, tier: level.tier, description: level.description, description_en: '' });
    });
  }

  /* --- conditions and keywords --------------------------------------------------- */

  // The Dicionário tab: a name in column A, its description (if any) in column B.
  const dictionaryTab = [...tabs.keys()].find((name) => /^dicion[aá]rio$/i.test(name));
  if (!dictionaryTab) note('missing tab', 'no Dicionário tab was found: its terms have no description');
  const dictionary: Dictionary = new Map();
  for (const row of dictionaryTab ? tabs.get(dictionaryTab)! : []) {
    const name = (row[0] ?? '').trim();
    if (name && name !== 'Nome') dictionary.set(name, (row[1] ?? '').trim());
  }
  const conditions = seedConditions(rules, dictionary, nextId);
  const keywords = seedKeywords(rules, dictionary, nextId);
  tables.Conditions.push(...conditions.rows);
  tables.Keywords.push(...keywords.rows);
  for (const p of [...conditions.problems, ...keywords.problems]) note(p.kind, p.detail, undefined, p.id);

  /* --- lookups, stats, config ---------------------------------------------------- */

  for (const name of [...new Set(tables.Skills.map((s) => String(s.cast_time)).filter(Boolean))]) tables.CastTimes.push({ name, name_en: '' });
  for (const name of [...new Set(tables.Skills.map((s) => String(s.cost_scale)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'))) {
    tables.CostScales.push({ name, name_en: '' });
  }
  for (const name of [...new Set(tables.Skills.flatMap((s) => String(s.categories).split(', ').filter(Boolean)))].sort((a, b) => a.localeCompare(b, 'pt'))) {
    tables.Categories.push({ name, name_en: '' });
  }

  for (const stat of STATS) tables.Stats.push({ ...stat });

  tables.Config.push({ key: 'req_display', value: 'emoji' }, { key: 'backup_keep', value: '' });
  for (const prefix of counters.keys()) tables.Config.push({ key: `next_id_${prefix}`, value: (counters.get(prefix) ?? 0) + 1 });

  // Validation stays empty here: in the sheet it's built from formulas, so it stays
  // current as rows change. The same problems are in the report.
  return { tables, findings };
}
