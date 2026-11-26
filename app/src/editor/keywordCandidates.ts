/**
 * Capitalized words in the descriptions that aren't keywords yet, for the Keywords
 * screen: Wander writes its terms with capitals ("Dano de Fogo", "Ação Especial"), so a
 * capitalized phrase nobody has defined is likely a keyword waiting to be written.
 *
 * A phrase is capitalized words joined by de/da/do/das/dos ("Nível da Arma"). A word
 * that starts a sentence is capitalized for that reason alone, so it's skipped, and
 * split from a phrase right after it ("Cause Dano de Fogo" counts "Dano de Fogo"). Anything that already matches a keyword, a keyword variant, or the name of a
 * skill or condition is skipped too. A plural is counted with its singular and listed
 * as a variant (most Portuguese plurals add an s, which covers Ataque/Ataques).
 */
import type { Content } from '@wander/rules';
import { keywordTerms } from '@wander/ui';

export interface Candidate {
  phrase: string;
  /** Plural spellings counted with it ("Ataques" with "Ataque"), for the keyword's variants. */
  variants: string[];
  count: number;
  /** A few rows it appears in. */
  examples: string[];
}

const CONNECTORS = new Set(['de', 'da', 'do', 'das', 'dos']);
const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const capitalized = (word: string) => /^\p{Lu}/u.test(word);

/** Every capitalized phrase in a text, with whether it opens a sentence. */
export function phrasesIn(text: string): { phrase: string; sentenceStart: boolean }[] {
  const words = [...text.matchAll(/\p{L}[\p{L}\p{N}'-]*/gu)];
  const out: { phrase: string; sentenceStart: boolean }[] = [];
  for (let i = 0; i < words.length; i++) {
    if (!capitalized(words[i][0])) continue;
    const before = text.slice(0, words[i].index).trimEnd();
    const sentenceStart = before === '' || /[.!?:;\n(]$/.test(before);
    let end = i;
    // Extend while the next word is capitalized, or a connector followed by a capitalized word.
    while (true) {
      const next = words[end + 1];
      const gap = next && text.slice(words[end].index! + words[end][0].length, next.index);
      if (!next || !/^ +$/.test(gap!)) break;
      if (capitalized(next[0])) { end++; continue; }
      const after = words[end + 2];
      const gap2 = after && text.slice(next.index! + next[0].length, after.index);
      if (CONNECTORS.has(next[0]) && after && /^ +$/.test(gap2!) && capitalized(after[0])) { end += 2; continue; }
      break;
    }
    const close = words[end].index! + words[end][0].length;
    if (sentenceStart && end > i) {
      // "Cause Dano de Fogo": the first word is capitalized only because it opens the
      // sentence, so it stands alone and the rest is its own phrase.
      out.push({ phrase: words[i][0], sentenceStart: true });
      let from = i + 1;
      if (CONNECTORS.has(words[from][0])) from++;
      out.push({ phrase: text.slice(words[from].index, close), sentenceStart: false });
    } else out.push({ phrase: text.slice(words[i].index, close), sentenceStart });
    i = end;
  }
  return out;
}

export function keywordCandidates(content: Content): Candidate[] {
  const known = new Set(keywordTerms(content, 'pt').map((t) => fold(t.text)));
  const texts: { id: string; text: string }[] = [
    ...content.skill.map((s) => ({ id: s.id, text: s.description })),
    ...content.condition.map((c) => ({ id: c.id, text: c.description })),
    ...content.trait.flatMap((t) => [{ id: t.id, text: t.notes }, ...t.levels.map((l) => ({ id: l.id, text: l.description }))]),
    ...content.keyword.map((k) => ({ id: k.id, text: k.description_pt })),
  ];
  const found = new Map<string, { spellings: Map<string, number>; count: number; examples: string[] }>();
  for (const { id, text } of texts) {
    for (const { phrase, sentenceStart } of phrasesIn(text)) {
      if (sentenceStart && !phrase.includes(' ')) continue;
      const key = fold(phrase);
      if (known.has(key)) continue;
      const entry = found.get(key) ?? { spellings: new Map<string, number>(), count: 0, examples: [] as string[] };
      entry.count++;
      entry.spellings.set(phrase, (entry.spellings.get(phrase) ?? 0) + 1);
      if (entry.examples.length < 3 && !entry.examples.includes(id)) entry.examples.push(id);
      found.set(key, entry);
    }
  }
  const spelling = (e: { spellings: Map<string, number> }) => [...e.spellings].sort((a, b) => b[1] - a[1])[0][0];
  const merged = new Map<string, Candidate>();
  // Singulars first, so a plural ("ataques") finds its singular ("ataque") already there.
  for (const [key, e] of [...found].sort(([a], [b]) => a.length - b.length)) {
    const singular = key.endsWith('s') ? merged.get(key.slice(0, -1)) : undefined;
    if (singular) {
      singular.count += e.count;
      singular.variants.push(spelling(e));
      for (const id of e.examples) if (singular.examples.length < 3 && !singular.examples.includes(id)) singular.examples.push(id);
    } else merged.set(key, { phrase: spelling(e), variants: [], count: e.count, examples: e.examples });
  }
  return [...merged.values()].sort((a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase, 'pt'));
}
