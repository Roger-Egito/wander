/**
 * Parsers for the skill fields Fichas v15 writes as free text: stat requirements,
 * skill requirements and costs. Each returns the raw values Wander Data stores, or a
 * problem for the report. Nothing here guesses silently: anything that doesn't match a
 * known shape comes back as a problem with the original text.
 */
import { STAT_EMOJIS, bareEmoji, statCodeOf } from '@wander/content';

/** "-", "--" and blanks all mean "nothing here" in Fichas v15. */
export const isBlank = (text: string | undefined) => !text || /^[-–—\s]*$/.test(text);

export type Parsed<T> = { ok: true; value: T } | { ok: false; problem: string };

/* --- stat requirements ----------------------------------------------------------- */

/** One row of StatRequirements. Rows sharing a group are alternatives. */
export interface StatRequirement {
  group: number;
  stat: string;
  value: number;
}

const emojiClass = STAT_EMOJIS.join('|');
// 🔥5, or 5 TÉC / 5 FÍS, written either way round.
const pairPattern = new RegExp(`(${emojiClass})\\s*(\\d+)|(\\d+)\\s*([A-Za-zÀ-ú]{3,4})`, 'gu');

/**
 * "👁️5🧘5" needs both (two groups). "5 TÉC ou 5 SEN" and "5 FÍS, 5 TÉC, ou 5 SEN" need
 * any one of them (one group): an "ou" anywhere makes every pair an alternative.
 */
export function parseStatRequirement(text: string): Parsed<StatRequirement[]> {
  if (isBlank(text)) return { ok: true, value: [] };
  const bare = bareEmoji(text);
  const alternatives = /\bou\b/i.test(bare);
  const pairs: { stat: string; value: number }[] = [];
  let consumed = bare;
  for (const match of bare.matchAll(pairPattern)) {
    const code = match[1] ? statCodeOf(match[1]) : statCodeOf(match[4]);
    const value = Number(match[2] ?? match[3]);
    if (!code) return { ok: false, problem: `unknown stat "${match[1] ?? match[4]}" in "${text}"` };
    pairs.push({ stat: code, value });
    consumed = consumed.replace(match[0], '');
  }
  // Whatever is left must be separators only, or the text had something we didn't read.
  if (pairs.length === 0 || !/^[\s,;]*(ou[\s,;]*)*$/i.test(consumed.replace(/\bou\b/gi, ' '))) {
    return { ok: false, problem: `couldn't read stat requirement "${text}"` };
  }
  return { ok: true, value: pairs.map((pair, i) => ({ group: alternatives ? 1 : i + 1, ...pair })) };
}

/* --- skill requirements ---------------------------------------------------------- */

/** One alternative inside a group: a named skill, or any skill with these categories. */
export type SkillRequirementOption = { kind: 'skill'; name: string } | { kind: 'categories'; categories: string[] };

/**
 * "A" one requirement. "A ou B" one group of alternatives. "A, B" two requirements,
 * both needed. "Qualquer (Magia, Trevas)" any skill with both of those categories; its
 * commas are inside the parentheses, so they never split requirements.
 */
export function parseSkillRequirement(text: string): Parsed<SkillRequirementOption[][]> {
  if (isBlank(text)) return { ok: true, value: [] };
  const groups: SkillRequirementOption[][] = [];
  for (const part of splitOutsideParens(text, ',')) {
    const options = part.split(/\s+ou\s+/i).map((option): SkillRequirementOption | null => {
      const any = /^Qualquer\s*\((.+)\)$/i.exec(option.trim());
      if (any) return { kind: 'categories', categories: any[1].split(',').map((c) => c.trim()).filter(Boolean) };
      const name = option.trim();
      return name ? { kind: 'skill', name } : null;
    });
    if (options.some((o) => o === null)) return { ok: false, problem: `empty alternative in skill requirement "${text}"` };
    groups.push(options as SkillRequirementOption[]);
  }
  return { ok: true, value: groups };
}

function splitOutsideParens(text: string, separator: string) {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === separator && depth === 0) {
      parts.push(current);
      current = '';
    } else current += char;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/* --- costs ----------------------------------------------------------------------- */

export interface Cost {
  cost_value: number | null;
  cost_unit: string;
  /** What the cost is per: "Alvo", "Nível da Arma". Empty for a flat cost. */
  cost_scale: string;
  cost2_value: number | null;
  cost2_unit: string;
}

const noCost: Cost = { cost_value: null, cost_unit: '', cost_scale: '', cost2_value: null, cost2_unit: '' };

const UNITS: Record<string, string> = { fadiga: 'Fadiga', motivacao: 'Motivação', ferida: 'Ferida', feridas: 'Ferida' };
const unitOf = (word: string) => UNITS[word.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()] ?? null;

/**
 * "10 Fadiga", "10 de Fadiga", "1 Motivação", "5 Fadiga por Alvo",
 * "10 de Fadiga por Vantagem por Nível da Arma", "1 Ferida e 1 Motivação". A bare number
 * is a Fatigue cost when the row was labeled "Custo de Fadiga".
 */
export function parseCost(text: string, defaultUnit = ''): Parsed<Cost> {
  if (isBlank(text)) return { ok: true, value: noCost };
  const trimmed = text.trim();
  if (/^\d+$/.test(trimmed) && defaultUnit) return { ok: true, value: { ...noCost, cost_value: Number(trimmed), cost_unit: defaultUnit } };
  const one = /^(\d+)\s+(?:de\s+)?([A-Za-zÀ-ú]+)(?:\s+por\s+(.+?))?(?:\s+e\s+(\d+)\s+(?:de\s+)?([A-Za-zÀ-ú]+))?$/i.exec(trimmed);
  if (!one) return { ok: false, problem: `couldn't read cost "${text}"` };
  const unit = unitOf(one[2]);
  const unit2 = one[5] ? unitOf(one[5]) : '';
  if (!unit || unit2 === null) return { ok: false, problem: `unknown cost unit in "${text}"` };
  return {
    ok: true,
    value: {
      cost_value: Number(one[1]),
      cost_unit: unit,
      cost_scale: one[3]?.trim() ?? '',
      cost2_value: one[4] ? Number(one[4]) : null,
      cost2_unit: unit2 ?? '',
    },
  };
}

/** "1 Ação", "1 Ação Especial", "1 Atividade". Blank when the sheet has a dash. */
export const castTimeOf = (text: string) => (isBlank(text) ? '' : text.trim());
