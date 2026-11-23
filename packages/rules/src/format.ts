/**
 * How costs and requirements read on cards, in the Editor's preview and in the
 * compendium. Wander Data stores raw values (a stat code and a number, a cost number and
 * a unit), and every text is built here, so changing how they read is one change.
 *
 * Lists use Intl.ListFormat, so "a, b ou c" in Portuguese and "a, b, or c" in English
 * follow each language's own rules.
 *
 * English names come from the sheet's _en columns (Stats.abbr_en, Categories.name_en,
 * CostScales.name_en, the keyword of a cost unit, a skill's name_en). Without one, the
 * Translations tab's automatic translation is used, then the Portuguese text, so a card
 * never shows a blank (see inLanguage).
 */
import { inLanguage, type Content, type Cost, type Language, type SkillRequirementOption, type StatRequirement } from './domain.ts';

export type RequirementDisplay = 'emoji' | 'text';

const LOCALE: Record<Language, string> = { pt: 'pt-BR', en: 'en' };
const WORDS = {
  pt: { per: 'por', any: 'Qualquer' },
  en: { per: 'per', any: 'Any' },
} as const;

const listOf = (items: string[], language: Language, type: 'conjunction' | 'disjunction') =>
  new Intl.ListFormat(LOCALE[language], { style: 'long', type }).format(items);

const fold = (text: string) => text.toLocaleLowerCase('pt-BR');

/** The translation when there is one, the Portuguese text otherwise (for texts with no automatic one). */
const translated = (pt: string, en: string, language: Language) => (language === 'en' && en ? en : pt);

/** Config req_display, emoji unless the sheet says text. */
export const requirementDisplay = (content: Content): RequirementDisplay => (content.config.req_display === 'text' ? 'text' : 'emoji');

/* --- stat requirements ----------------------------------------------------------- */

export interface StatFormatOptions {
  language: Language;
  display?: RequirementDisplay;
}

/**
 * Emoji: "🔥5", "👁️5🧘5" (both needed), "💪5 ou 🔧5" (either). Text: "5 ESP",
 * "5 SEN e 5 INS", "5 FÍS, 5 TÉC ou 5 SEN". A stat with no emoji is written as text in
 * either display. A group of alternatives next to another group gets parentheses, so
 * "(💪5 ou 🔧5)🧘5" can't be misread.
 */
export function formatStatRequirements(groups: StatRequirement[][], content: Content, options: StatFormatOptions) {
  const { language } = options;
  const display = options.display ?? requirementDisplay(content);
  const stat = new Map(content.stats.map((s) => [s.code, s]));
  let allEmoji = true;
  const pair = ({ stat: code, value }: StatRequirement) => {
    const s = stat.get(code);
    if (display === 'emoji' && s?.emoji) return `${s.emoji}${value}`;
    allEmoji = false;
    return `${value} ${s ? translated(s.abbr_pt, s.abbr_en, language) : code}`;
  };
  const parts = groups.map((group) => {
    const text = listOf(group.map(pair), language, 'disjunction');
    return group.length > 1 && groups.length > 1 ? `(${text})` : text;
  });
  // Fichas v15 writes emoji groups side by side ("👁️5🧘5"). Text needs words between them.
  return display === 'emoji' && allEmoji ? parts.join('') : listOf(parts, language, 'conjunction');
}

/* --- costs ----------------------------------------------------------------------- */

/** "10 Fadiga", "5 Fadiga por Alvo", "1 Ferida e 1 Motivação". Empty when there is no cost. */
export function formatCost(costs: Cost[], content: Content, language: Language) {
  const unit = (name: string) => {
    const keyword = content.keyword.find((k) => fold(k.name_pt) === fold(name));
    return keyword ? translated(keyword.name_pt, keyword.name_en, language) : name;
  };
  const scale = (name: string) => translateName(content, 'CostScales', name, language);
  const one = (cost: Cost) => `${cost.value} ${unit(cost.unit)}${cost.scale ? ` ${WORDS[language].per} ${scale(cost.scale)}` : ''}`;
  return costs.length ? listOf(costs.map(one), language, 'conjunction') : '';
}

/* --- skill requirements ---------------------------------------------------------- */

/**
 * "Bênção e Cura" (both), "Infundir Fogo, Infundir Gelo ou Infundir Vento" (any one),
 * "Qualquer (Magia, Trevas)". A skill that isn't in the content (deleted, or a typo the
 * Validation tab reports) is shown by its ID.
 */
export function formatSkillRequirements(groups: SkillRequirementOption[][], content: Content, language: Language) {
  const option = (o: SkillRequirementOption) => {
    if (o.kind === 'skill') {
      const skill = content.skillsById.get(o.skill_id);
      return skill ? inLanguage(content, language, { tab: 'Skills', id: skill.id, field: 'name' }, skill.name, skill.name_en) : o.skill_id;
    }
    const names = o.categories.map((name) => translateName(content, 'Categories', name, language));
    return `${WORDS[language].any} (${names.join(', ')})`;
  };
  const parts = groups.map((group) => {
    const text = listOf(group.map(option), language, 'disjunction');
    return group.length > 1 && groups.length > 1 ? `(${text})` : text;
  });
  return listOf(parts, language, 'conjunction');
}

/* --- small labels ---------------------------------------------------------------- */

type LookupTab = 'Categories' | 'CastTimes' | 'TraitTiers' | 'CostScales';
const LOOKUPS: Record<LookupTab, (content: Content) => { name: string; name_en: string }[]> = {
  Categories: (c) => c.categories,
  CastTimes: (c) => c.castTimes,
  TraitTiers: (c) => c.tiers,
  CostScales: (c) => c.costScales,
};

/** A category, cast time, tier or cost scale in the chosen language. A name not in its tab stays as it is. */
export function translateName(content: Content, tab: LookupTab, name: string, language: Language) {
  const row = LOOKUPS[tab](content).find((r) => fold(r.name) === fold(name));
  return row ? inLanguage(content, language, { tab, id: row.name, field: 'name' }, row.name, row.name_en) : name;
}
