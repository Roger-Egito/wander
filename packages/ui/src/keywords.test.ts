import { describe, expect, test } from 'vitest';
import { emptyTables } from '@wander/content';
import { loadContent } from '@wander/rules';
import { keywordTerms, splitKeywords, type Segment } from './keywords.ts';

function content() {
  const t = emptyTables();
  t.Keywords.push(
    { id: 'PCH-32', name_pt: 'Descanso', variants_pt: 'Descansos, Descansar', name_en: 'Rest', status: 'draft' },
    { id: 'PCH-46', name_pt: 'Descanso Longo', variants_pt: 'Descansos Longos', name_en: 'Long Rest', status: 'draft' },
    { id: 'PCH-40', name_pt: 'Alvo', variants_pt: 'Alvos', name_en: 'Target', variants_en: 'Targets', status: 'draft' },
    { id: 'PCH-41', name_pt: 'Fadiga', name_en: '', status: 'draft' },
    { id: 'PCH-99', name_pt: 'Apagada', status: 'deleted' },
  );
  t.Conditions.push({ id: 'CON-03', name: 'Queimando', name_en: 'Burning', status: 'playtest' }, { id: 'CON-09', name: 'Alvo', status: 'draft' });
  t.Skills.push({ id: 'FOG-01', name: 'Bola de Fogo', status: 'playtest' });
  return loadContent(t);
}

/** Segments as text, with matches in brackets: "Gaste [Fadiga]". */
const show = (segments: Segment[]) => segments.map((s) => (typeof s === 'string' ? s : `[${s.text}]`)).join('');

describe('finding keywords', () => {
  const c = content();
  const pt = keywordTerms(c, 'pt');

  test('the longest term wins, and case is ignored', () => {
    expect(show(splitKeywords('Após um descanso longo, você recupera.', pt))).toBe('Após um [descanso longo], você recupera.');
  });

  test('only whole words match', () => {
    expect(show(splitKeywords('Na Alvorada, escolha um Alvo.', pt))).toBe('Na Alvorada, escolha um [Alvo].');
  });

  test('variants match, and each term is linked once', () => {
    expect(show(splitKeywords('Até 3 Alvos. Cada Alvo sofre Fadiga. Fadiga de novo.', pt))).toBe('Até 3 [Alvos]. Cada Alvo sofre [Fadiga]. Fadiga de novo.');
  });

  test('skill and condition names are keywords too, but a keyword wins a tie', () => {
    const segments = splitKeywords('Lança Bola de Fogo e deixa o Alvo Queimando.', pt);
    expect(segments.filter((s) => typeof s !== 'string').map((s) => typeof s !== 'string' && `${s.term.type}:${s.term.id}`)).toEqual([
      'skill:FOG-01', 'keyword:PCH-40', 'condition:CON-03',
    ]);
  });

  test("a row's own name doesn't link to itself", () => {
    expect(show(splitKeywords('Bola de Fogo explode.', pt, 'FOG-01'))).toBe('Bola de Fogo explode.');
  });

  test('English uses the English names, and deleted keywords are gone', () => {
    const en = keywordTerms(c, 'en');
    expect(show(splitKeywords('Pick two Targets, then a Long Rest. Burning.', en))).toBe('Pick two [Targets], then a [Long Rest]. [Burning].');
    expect(pt.some((t) => t.text === 'Apagada')).toBe(false);
  });
});
