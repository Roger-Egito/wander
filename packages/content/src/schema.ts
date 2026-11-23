/**
 * The tabs of Wander Data and their columns, in order. The spreadsheet's header rows
 * and the migration's output both come from here, so they can't disagree.
 *
 * Names are in English (tabs, columns, fixed values like status). The content the
 * players read stays in Portuguese, with an _en column beside it for the translation.
 *
 * Differences from the plan's data model, decided on 2026-11-22:
 *   - Stat requirements are rows in StatRequirements instead of atr1..val2, so a skill
 *     can need several stats or any one of a few (rows sharing a group).
 *   - SkillRequirements has group (alternatives share one) and required_categories,
 *     used instead of required_skill_id for "any skill with these categories".
 *   - Costs have cost_scale ("per Alvo") and a second cost, cost2_value/cost2_unit.
 *   - TraitLevels rows have their own id (FAC-01.3), so a Modifiers row can point at
 *     one level.
 *   - The PD cost is in TraitTiers, not on each trait's level: a tier always costs the
 *     same (Bom is 1, Mais-que-perfeito is 6), so storing it per level could only let
 *     the two disagree. A trait's levels are ordered by their tier's cost, worst to
 *     best, then by tier name, so no order column is stored either.
 */
export const TABS = {
  Disciplines: ['id', 'name', 'name_en', 'color_dark', 'color_light', 'icon', 'description', 'description_en', 'source', 'status'],
  Skills: [
    'id', 'name', 'name_en', 'discipline_id', 'level', 'categories', 'cast_time',
    'cost_value', 'cost_unit', 'cost_scale', 'cost2_value', 'cost2_unit',
    'description', 'description_en', 'notes', 'inspired_by', 'stolen_from', 'source', 'status', 'edited_at', 'pos_x', 'pos_y',
  ],
  SkillRequirements: ['skill_id', 'group', 'required_skill_id', 'required_categories'],
  StatRequirements: ['skill_id', 'group', 'stat', 'value'],
  Conditions: ['id', 'name', 'name_en', 'description', 'description_en', 'rule_url', 'status'],
  Traits: ['id', 'name', 'name_en', 'notes', 'notes_en', 'inspired_by', 'stolen_from', 'source', 'status'],
  TraitLevels: ['id', 'trait_id', 'tier', 'description', 'description_en'],
  TraitLevelRequirements: ['level_id', 'group', 'required_level_id'],
  Modifiers: ['origin_id', 'stat', 'value', 'temporary'],
  Keywords: ['id', 'name_pt', 'variants_pt', 'name_en', 'variants_en', 'description_pt', 'description_en', 'url_pt', 'url_en', 'category', 'status'],
  Stats: ['code', 'emoji', 'abbr_pt', 'abbr_en', 'name_pt', 'name_en', 'type'],
  Translations: ['table', 'id', 'field', 'auto_en', 'manual_from'],
  CastTimes: ['name', 'name_en'],
  CostScales: ['name', 'name_en'],
  Categories: ['name', 'name_en'],
  TraitTiers: ['name', 'name_en', 'pd_cost'],
  Releases: ['version', 'notes', 'requested_at'],
  Config: ['key', 'value'],
  Validation: ['problem', 'table', 'id', 'detail'],
} as const;

export type TabName = keyof typeof TABS;
export type Row = Record<string, string | number | boolean | null>;
export type Tables = Record<TabName, Row[]>;

export const emptyTables = (): Tables => Object.fromEntries(Object.keys(TABS).map((name) => [name, []])) as unknown as Tables;

/** Statuses a content row can have. deleted is a soft delete. */
export const STATUS = ['draft', 'playtest', 'final', 'deleted'] as const;

/** The games content can come from: Wander itself, or one it was adapted from. */
export const SOURCES = ['Wander', 'Outward', 'WWN', 'Cairn', 'OSE'] as const;

/** Resources a skill can cost. These are game terms, so they stay in Portuguese. */
export const COST_UNITS = ['Fadiga', 'Motivação', 'Ferida'] as const;
