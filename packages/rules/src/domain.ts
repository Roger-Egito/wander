/**
 * Wander Data as the game sees it. The row types (Skill, Trait, TraitLevel...) are
 * generated from the content types by @wander/content (entity.ts), so they follow the
 * registry. This file adds what isn't a field: the lookup tabs, trait levels ordered
 * worst to best, and helpers that turn rows into game terms (requirement groups, costs,
 * a tier's PD cost, text in the chosen language).
 *
 * Read-only: nothing here writes back to the sheet.
 */
import { loadEntities, num, text, type Entities, type Entity, type LoadOptions, type Modifier, type Row, type Stat, type Tables, type TabName, type TypeOf } from '@wander/content';

export type { LoadOptions, Modifier, Status } from '@wander/content';
export type Language = 'pt' | 'en';

export type Discipline = Entity<TypeOf<'discipline'>>;
export type Skill = Entity<TypeOf<'skill'>>;
export type Condition = Entity<TypeOf<'condition'>>;
export type Trait = Entity<TypeOf<'trait'>>;
export type TraitLevel = Trait['levels'][number];
export type Keyword = Entity<TypeOf<'keyword'>>;

/** A row of a lookup tab like Categories or CastTimes. */
export interface Named {
  name: string;
  name_en: string;
}

export interface Tier extends Named {
  pd_cost: number;
}

export interface StatRequirement {
  stat: string;
  value: number;
}

/** One way to meet a skill requirement group: a skill, or any skill with all these categories. */
export type SkillRequirementOption = { kind: 'skill'; skill_id: string } | { kind: 'categories'; categories: string[] };

export interface Cost {
  value: number;
  unit: string;
  /** What the cost is per ("Alvo", "Nível da Arma"). Empty for a flat cost. */
  scale: string;
}

export interface Content extends Entities {
  stats: Stat[];
  /** Worst to best. */
  tiers: Tier[];
  categories: Named[];
  castTimes: Named[];
  costScales: Named[];
  config: Record<string, string>;
  skillsById: Map<string, Skill>;
  traitLevelsById: Map<string, TraitLevel>;
  /** PD cost by tier name, lowercased. */
  tierCosts: Map<string, number>;
  /** The Translations tab's GOOGLETRANSLATE results, by `${table}|${id}|${field}`. */
  autoEnglish: Map<string, string>;
}

/* --- tiers ----------------------------------------------------------------------- */

/**
 * Worst to best by PD cost, then alphabetically when two tiers cost the same. A tier
 * without a cost goes last. Nothing in Wander Data stores an order: this is it.
 */
export function compareTiers(a: { name: string; pd_cost: number | null | undefined }, b: { name: string; pd_cost: number | null | undefined }) {
  return (a.pd_cost ?? Infinity) - (b.pd_cost ?? Infinity) || a.name.localeCompare(b.name, 'pt');
}

/** A trait level's PD cost, from its tier. Null when the tier isn't in TraitTiers. */
export const pdCost = (content: Content, level: Pick<TraitLevel, 'tier'>) => content.tierCosts.get(level.tier.toLocaleLowerCase('pt-BR')) ?? null;

/* --- rows into game terms -------------------------------------------------------- */

/** Rows sharing a group number become one array of alternatives, ordered by group number. */
export function alternatives<R extends { group: number | null }, T>(rows: R[], read: (row: R) => T | null): T[][] {
  const groups = new Map<number, T[]>();
  for (const row of rows) {
    const item = read(row);
    if (item === null) continue;
    const group = row.group ?? 1;
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([, items]) => items);
}

/** Each group must be met, by any one of its alternatives. Rows with no number are skipped. */
export const statGroups = (skill: Skill) =>
  alternatives(skill.stat_requirements, (r): StatRequirement | null => (r.stat && r.value !== null ? { stat: r.stat, value: r.value } : null));

export const skillGroups = (skill: Skill) =>
  alternatives(skill.skill_requirements, (r): SkillRequirementOption | null => {
    if (r.required_skill_id) return { kind: 'skill', skill_id: r.required_skill_id };
    return r.required_categories.length ? { kind: 'categories', categories: r.required_categories } : null;
  });

/** The levels a trait level brings along: each group must be held, by any one of its level IDs. */
export const levelGroups = (level: TraitLevel) => alternatives(level.requirements, (r) => r.required_level_id || null);

/** The main cost, then the second one when there is one. */
export function costsOf(skill: Skill): Cost[] {
  const costs: Cost[] = [];
  if (skill.cost_value !== null && skill.cost_unit) costs.push({ value: skill.cost_value, unit: skill.cost_unit, scale: skill.cost_scale });
  if (skill.cost2_value !== null && skill.cost2_unit) costs.push({ value: skill.cost2_value, unit: skill.cost2_unit, scale: '' });
  return costs;
}

/** Where the skill tree draws it, when someone moved it by hand. */
export const positionOf = (skill: Skill) => (skill.pos_x !== null && skill.pos_y !== null ? { x: skill.pos_x, y: skill.pos_y } : null);

/* --- language -------------------------------------------------------------------- */

/**
 * A text in the chosen language. For English: the hand-written translation (the _en
 * column), else the Translations tab's automatic one, else the Portuguese text, so a
 * card never shows a blank.
 */
export function inLanguage(content: Content, language: Language, at: { tab: TabName; id: string; field: string }, pt: string, en: string) {
  if (language === 'pt') return pt;
  return en || content.autoEnglish.get(`${at.tab}|${at.id}|${at.field}`) || pt;
}

/* --- loading --------------------------------------------------------------------- */

export function loadContent(tables: Tables, options: LoadOptions = {}): Content {
  const entities = loadEntities(tables, options);

  const tiers = tables.TraitTiers.flatMap((row): Tier[] => {
    const cost = num(row.pd_cost);
    return text(row.name) && cost !== null ? [{ name: text(row.name), name_en: text(row.name_en), pd_cost: cost }] : [];
  }).sort(compareTiers);
  const tierCosts = new Map(tiers.map((tier) => [tier.name.toLocaleLowerCase('pt-BR'), tier.pd_cost]));
  const byTier = (a: TraitLevel, b: TraitLevel) =>
    compareTiers({ name: a.tier, pd_cost: tierCosts.get(a.tier.toLocaleLowerCase('pt-BR')) }, { name: b.tier, pd_cost: tierCosts.get(b.tier.toLocaleLowerCase('pt-BR')) });
  const traits = entities.trait.map((trait) => ({ ...trait, levels: [...trait.levels].sort(byTier) }));

  const named = (rows: Row[]) => rows.filter((row) => text(row.name)).map((row): Named => ({ name: text(row.name), name_en: text(row.name_en) }));

  return {
    ...entities,
    trait: traits,
    stats: tables.Stats.filter((row) => text(row.code)).map((row) => ({
      code: text(row.code), emoji: text(row.emoji), abbr_pt: text(row.abbr_pt), abbr_en: text(row.abbr_en),
      name_pt: text(row.name_pt), name_en: text(row.name_en), type: text(row.type) as Stat['type'],
    })),
    tiers,
    categories: named(tables.Categories),
    castTimes: named(tables.CastTimes),
    costScales: named(tables.CostScales),
    config: Object.fromEntries(tables.Config.filter((row) => text(row.key)).map((row) => [text(row.key), text(row.value)])),
    skillsById: new Map(entities.skill.map((skill) => [skill.id, skill])),
    traitLevelsById: new Map(traits.flatMap((trait) => trait.levels.map((level) => [level.id, level] as const))),
    tierCosts,
    autoEnglish: new Map(
      tables.Translations.filter((row) => text(row.auto_en)).map((row) => [`${text(row.table)}|${text(row.id)}|${text(row.field)}`, text(row.auto_en)]),
    ),
  };
}

