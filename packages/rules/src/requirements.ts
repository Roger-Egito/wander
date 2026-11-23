/**
 * Can a character take this skill or this trait level? Each check returns what's
 * missing, an empty list meaning yes, so a card can say why something is locked instead
 * of only greying it out.
 */
import { levelGroups, pdCost, skillGroups, statGroups, type Content, type Skill, type SkillRequirementOption, type StatRequirement } from './domain.ts';

/** What the character has, as far as requirements care. Stats are final values (modifiers applied). */
export interface Character {
  stats: Record<string, number>;
  skill_ids: string[];
  /** Every level held, repeats included: levels aren't exclusive, and one can be taken twice. */
  trait_level_ids: string[];
}

/** Every held level counts, repeats and levels brought in by a requirement included (decided 2026-11-22). */
export const TRAIT_LIMITS = { facilidade: 5, complicacao: 3 } as const;

export type TraitKind = 'facilidade' | 'complicacao' | 'neutral';

export type Unmet =
  | { kind: 'alreadyHas' }
  /** No alternative of this stat group is high enough. */
  | { kind: 'stat'; options: StatRequirement[] }
  /** No alternative of this skill group is met. */
  | { kind: 'skill'; options: SkillRequirementOption[] }
  /** Equipping these levels would go over the limit for their kind. */
  | { kind: 'traitLimit'; trait: Exclude<TraitKind, 'neutral'>; limit: number; total: number }
  /** A requirement with alternatives, none held: the player picks one (pass it in `picks`). */
  | { kind: 'choose'; level_id: string; options: string[] }
  /** A level that isn't in the content (deleted, or a typo the Validation tab reports). */
  | { kind: 'unknownLevel'; level_id: string }
  /** The level's tier has no PD cost, so it can't be counted. The Validation tab reports why. */
  | { kind: 'unknownTier'; level_id: string; tier: string };

/** A positive PD cost makes a Facilidade, a negative one a Complicação (Neutro is neither). */
export function traitKind(cost: number | null): TraitKind {
  if (!cost) return 'neutral';
  return cost > 0 ? 'facilidade' : 'complicacao';
}

const fold = (text: string) => text.toLocaleLowerCase('pt-BR');

/* --- skills ---------------------------------------------------------------------- */

function meetsSkillOption(character: Character, option: SkillRequirementOption, content: Content, self: string) {
  if (option.kind === 'skill') return character.skill_ids.includes(option.skill_id);
  const wanted = option.categories.map(fold);
  return character.skill_ids.some((id) => {
    if (id === self) return false;
    const categories = content.skillsById.get(id)?.categories.map(fold) ?? [];
    return wanted.every((c) => categories.includes(c));
  });
}

export function checkSkill(character: Character, skill: Skill, content: Content): Unmet[] {
  if (character.skill_ids.includes(skill.id)) return [{ kind: 'alreadyHas' }];
  const unmet: Unmet[] = [];
  for (const group of statGroups(skill)) {
    if (!group.some((r) => (character.stats[r.stat] ?? 0) >= r.value)) unmet.push({ kind: 'stat', options: group });
  }
  for (const group of skillGroups(skill)) {
    if (!group.some((o) => meetsSkillOption(character, o, content, skill.id))) unmet.push({ kind: 'skill', options: group });
  }
  return unmet;
}

/* --- trait levels ---------------------------------------------------------------- */

export interface TraitPlan {
  /** The levels equipping adds, the chosen one first. Empty when something is unmet. */
  add: string[];
  unmet: Unmet[];
}

/**
 * What equipping a trait level does. The level always goes in, even when the character
 * already holds it. Each of its requirement groups is then met by a level the character
 * already holds or that this plan adds, or else it brings one in: the only option, or
 * the one the player picked. Brought-in levels have their own requirements met the same
 * way, which is how a cycle (Mau-Cheiro Ruim and Bom require each other) ends: the
 * second level finds the first already in the plan.
 *
 * Every added level counts toward TRAIT_LIMITS, so one choice can use two slots and is
 * refused when they don't both fit.
 */
export function planTraitLevel(character: Character, levelId: string, content: Content, picks: string[] = []): TraitPlan {
  const unmet: Unmet[] = [];
  const add: string[] = [];
  const queue = [levelId];
  const held = (id: string) => character.trait_level_ids.includes(id) || add.includes(id) || queue.includes(id);

  while (queue.length) {
    const id = queue.shift()!;
    add.push(id);
    const level = content.traitLevelsById.get(id);
    if (!level) {
      unmet.push({ kind: 'unknownLevel', level_id: id });
      continue;
    }
    if (pdCost(content, level) === null) unmet.push({ kind: 'unknownTier', level_id: id, tier: level.tier });
    for (const group of levelGroups(level)) {
      if (group.some(held)) continue;
      const picked = group.length === 1 ? group[0] : group.find((option) => picks.includes(option));
      if (picked) queue.push(picked);
      else unmet.push({ kind: 'choose', level_id: id, options: group });
    }
  }

  const kindOf = (id: string) => {
    const level = content.traitLevelsById.get(id);
    return level ? traitKind(pdCost(content, level)) : 'neutral';
  };
  const added = new Set(add.map(kindOf));
  for (const kind of ['facilidade', 'complicacao'] as const) {
    // Only a kind this plan adds to: a character already over a limit can still take the other kind.
    const total = [...character.trait_level_ids, ...add].filter((id) => kindOf(id) === kind).length;
    if (added.has(kind) && total > TRAIT_LIMITS[kind]) unmet.push({ kind: 'traitLimit', trait: kind, limit: TRAIT_LIMITS[kind], total });
  }
  return unmet.length ? { add: [], unmet } : { add, unmet };
}
