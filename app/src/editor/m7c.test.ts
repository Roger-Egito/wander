import { describe, expect, test } from 'vitest';
import { emptyTables } from '@wander/content';
import { loadContent } from '@wander/rules';
import { keywordCandidates, nextVersion, phrasesIn } from './keywordCandidates.ts';
import { stateOf, translationEntries } from './translations.ts';

describe('translation entries', () => {
  function tables() {
    const t = emptyTables();
    t.Skills.push({ id: 'RAS-01', name: 'Primeira', name_en: 'First', description: 'Faz algo.', status: 'draft' }, { id: 'RAS-02', name: 'Apagada', status: 'deleted' });
    t.Traits.push({ id: 'FAC-14', name: 'Mau-Cheiro', status: 'playtest' });
    t.TraitLevels.push({ id: 'FAC-14.1', trait_id: 'FAC-14', tier: 'Ruim', description: 'Cheira mal.', description_en: 'Smells.' });
    t.Categories.push({ name: 'Magia', name_en: 'Magic' });
    t.Translations.push(
      { table: 'Skills', id: 'RAS-01', field: 'name', auto_en: 'First one', manual_from: 'Primeira' },
      { table: 'Skills', id: 'RAS-01', field: 'description', auto_en: 'Does something.' },
      { table: 'TraitLevels', id: 'FAC-14.1', field: 'description', auto_en: 'Smells bad.', manual_from: 'Cheira muito mal.' },
    );
    return t;
  }

  test('every translatable text, child rows and lookups included, deleted rows left out', () => {
    expect(translationEntries(tables()).map((e) => `${e.table} ${e.id} ${e.field} [${e.context}] ${e.state}`)).toEqual([
      'Skills RAS-01 name [Primeira] manual',
      'Skills RAS-01 description [Primeira] auto',
      'Traits FAC-14 name [Mau-Cheiro] missing',
      'TraitLevels FAC-14.1 description [Mau-Cheiro · Ruim] outdated',
      'Categories Magia name [Categoria] manual',
    ]);
  });

  test('states', () => {
    expect([stateOf('a', 'x', '', 'a'), stateOf('b', 'x', '', 'a'), stateOf('a', 'x', '', ''), stateOf('a', '', 'y', ''), stateOf('a', '', '', '')]).toEqual([
      'manual', 'outdated', 'manual', 'auto', 'missing',
    ]);
  });
});

describe('keyword candidates', () => {
  test('capitalized phrases, joined by de/da/do', () => {
    expect(phrasesIn('Você sofre Dano de Fogo e perde 1 Nível da Arma. Escolha um Alvo.').map((p) => `${p.phrase}${p.sentenceStart ? '*' : ''}`)).toEqual([
      'Você*', 'Dano de Fogo', 'Nível da Arma', 'Escolha*', 'Alvo',
    ]);
  });

  test("phrases that aren't keywords yet, counted, without sentence starts or known terms", () => {
    const t = emptyTables();
    t.Keywords.push({ id: 'PCH-40', name_pt: 'Alvo', variants_pt: 'Alvos', status: 'draft' });
    t.Conditions.push({ id: 'CON-03', name: 'Queimando', description: 'Sofre Dano de Fogo. Queimando dura até um Teste de Físico.', status: 'playtest' });
    t.Skills.push({ id: 'FOG-01', name: 'Bola de Fogo', description: 'Cause Dano de Fogo em 2 Alvos. Eles ficam Queimando. Afeta Criaturas e a Criatura maior.', status: 'playtest' });
    const candidates = keywordCandidates(loadContent(t));
    expect(candidates).toEqual([
      { phrase: 'Criatura', variants: ['Criaturas'], count: 2, examples: ['FOG-01'] },
      { phrase: 'Dano de Fogo', variants: [], count: 2, examples: ['FOG-01', 'CON-03'] },
      { phrase: 'Teste de Físico', variants: [], count: 1, examples: ['CON-03'] },
    ]);
  });
});

test('the next version is a patch bump of the highest one, keeping the beta label', () => {
  expect(nextVersion([])).toBe('0.1.0-beta');
  expect(nextVersion(['0.1.0-beta', '0.1.3-beta', 'rascunho'])).toBe('0.1.4-beta');
  // After leaving beta by typing 1.0.0, the label is gone for good.
  expect(nextVersion(['0.1.4-beta', '1.0.0'])).toBe('1.0.1');
});
