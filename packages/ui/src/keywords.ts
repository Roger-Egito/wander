/**
 * Finding keywords in a description, so RichText can turn them into popovers.
 *
 * Terms are each keyword's name and variants, plus the names of every content type
 * marked keywordSource in the registry (skills, conditions), so a new condition is a
 * keyword everywhere without a Keywords row. Matching:
 *   - needs the capitals the term has (decided 2026-11-26): "Fadiga" and "FADIGA" link,
 *     "fadiga" doesn't, since game terms are capitalized in the rules. Words written in
 *     lowercase in the term ("Dano de Fogo") match in any case,
 *   - only takes whole words ("Alvo" doesn't match inside "Alvorada"),
 *   - prefers the longest term ("Descanso Longo" over "Descanso"),
 *   - links each term once per text, the first time it appears, so a paragraph that
 *     says "Fadiga" four times doesn't become four buttons.
 *
 * The terms, their regex and their lookup table are built once per read of the data and
 * language, and shared by every RichText. Built per card, a screen of 260 cards spent
 * about a second on them in a desktop browser.
 */
import { CONTENT_TYPES, type ContentType } from '@wander/content';
import { inLanguage, type Content, type Language } from '@wander/rules';

export interface Term {
  /** The words as they appear in text. */
  text: string;
  /** What the popover shows: a keyword, or a row of a keywordSource type. */
  type: string;
  id: string;
}

export type Segment = string | { text: string; term: Term };

// Plain toLowerCase: the same result as pt-BR's for Portuguese letters, and much faster
// than toLocaleLowerCase in Chrome.
const fold = (text: string) => text.toLowerCase();

const termCache = new WeakMap<Content, Map<Language, Term[]>>();

/**
 * Every term in this language. Keywords come first, so a keyword wins over a skill of the
 * same name. The same array for the same content and language.
 */
export function keywordTerms(content: Content, language: Language): Term[] {
  let byLanguage = termCache.get(content);
  if (!byLanguage) termCache.set(content, (byLanguage = new Map()));
  let terms = byLanguage.get(language);
  if (!terms) byLanguage.set(language, (terms = buildTerms(content, language)));
  return terms;
}

function buildTerms(content: Content, language: Language): Term[] {
  const terms: Term[] = [];
  for (const k of content.keyword) {
    const words = language === 'pt' ? [k.name_pt, ...k.variants_pt] : [k.name_en, ...k.variants_en];
    for (const text of words) if (text) terms.push({ text, type: 'keyword', id: k.id });
  }
  for (const type of CONTENT_TYPES as readonly ContentType[]) {
    if (!type.keywordSource) continue;
    const rows = content[type.id as keyof Content] as unknown as { id: string; [key: string]: unknown }[];
    for (const row of rows) {
      const pt = String(row[type.nameKey] ?? '');
      const en = String(row[`${type.nameKey}_en`] ?? '');
      const text = inLanguage(content, language, { tab: type.tab, id: row.id, field: type.nameKey }, pt, en);
      if (text) terms.push({ text, type: type.id, id: row.id });
    }
  }
  const seen = new Set<string>();
  return terms.filter((t) => !seen.has(fold(t.text)) && seen.add(fold(t.text)));
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = new WeakMap<Term[], RegExp>();
const lookups = new WeakMap<Term[], Map<string, Term>>();

/** Each term by its folded text. */
function lookupFor(terms: Term[]) {
  let lookup = lookups.get(terms);
  if (!lookup) lookups.set(terms, (lookup = new Map(terms.map((t) => [fold(t.text), t]))));
  return lookup;
}

/** One regex for all terms, longest first, so the alternation takes the longest match. */
function patternFor(terms: Term[]) {
  let pattern = patterns.get(terms);
  if (!pattern) {
    const alternatives = [...terms].sort((a, b) => b.text.length - a.text.length).map((t) => escape(t.text));
    pattern = alternatives.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}])`, 'giu') : /$^/g;
    patterns.set(terms, pattern);
  }
  return pattern;
}

const words = (text: string) => text.split(/[\s-]+/u).filter(Boolean);
const startsUpper = (word: string) => word[0] !== word[0].toLowerCase();

/** Whether every word the term capitalizes is capitalized in the text too. */
function capitalizedLike(found: string, term: string) {
  const [a, b] = [words(found), words(term)];
  return a.length === b.length && b.every((word, i) => !startsUpper(word) || startsUpper(a[i]));
}

/**
 * The text cut into plain strings and matched terms. `exclude` skips one row's own name
 * (a skill's description saying its name doesn't link to itself).
 */
export function splitKeywords(text: string, terms: Term[], exclude?: string): Segment[] {
  const byText = lookupFor(terms);
  const linked = new Set<string>();
  const segments: Segment[] = [];
  const pattern = patternFor(terms);
  pattern.lastIndex = 0;
  let last = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    // The regex ignores case, so it finds the longest term whatever its capitals. When
    // those don't fit ("Descanso longo"), a shorter term at the same spot may ("Descanso").
    let found: { text: string; term: Term } | null = { text: match[0], term: byText.get(fold(match[0]))! };
    if (!found.term || !capitalizedLike(found.text, found.term.text)) found = shorterAt(text, match.index, terms);
    if (!found) continue;
    pattern.lastIndex = match.index + found.text.length;
    const key = `${found.term.type}:${found.term.id}`;
    if (found.term.id === exclude || linked.has(key)) continue;
    linked.add(key);
    if (match.index > last) segments.push(text.slice(last, match.index));
    segments.push(found);
    last = match.index + found.text.length;
  }
  if (last < text.length) segments.push(text.slice(last));
  return segments;
}

const byLength = new WeakMap<Term[], Term[]>();
const wordChar = /[\p{L}\p{N}]/u;

/** The longest term written at `index` with its capitals, ending at a word's end. */
function shorterAt(text: string, index: number, terms: Term[]) {
  let sorted = byLength.get(terms);
  if (!sorted) byLength.set(terms, (sorted = [...terms].sort((a, b) => b.text.length - a.text.length)));
  for (const term of sorted) {
    const piece = text.slice(index, index + term.text.length);
    if (fold(piece) !== fold(term.text) || !capitalizedLike(piece, term.text)) continue;
    if (wordChar.test(text[index + term.text.length] ?? '')) continue;
    return { text: piece, term };
  }
  return null;
}
