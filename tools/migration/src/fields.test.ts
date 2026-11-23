// The field parsers against every shape found in Fichas v15 (2026-11-22 export).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { castTimeOf, parseStatRequirement, parseCost, parseSkillRequirement } from './fields.ts';

const attr = (text: string) => {
  const result = parseStatRequirement(text);
  assert.ok(result.ok, `${text}: ${!result.ok && result.problem}`);
  return result.value.map((r) => `${r.group}:${r.stat}${r.value}`).join(' ');
};

test('stat requirements: emojis, with or without the variation selector', () => {
  assert.equal(attr('🔥5'), '1:ESP5');
  assert.equal(attr('👁5'), '1:SEN5');
  assert.equal(attr('👁️6'), '1:SEN6');
  assert.equal(attr('👁️5🧘5'), '1:SEN5 2:INS5'); // both needed
  assert.equal(attr('-'), '');
});

test('stat requirements: abbreviations, and "ou" alternatives in one group', () => {
  assert.equal(attr('7 TÉC'), '1:TEC7');
  assert.equal(attr('5 TÉC ou 5 SEN'), '1:TEC5 1:SEN5');
  assert.equal(attr('💪5 ou 🔧5'), '1:FIS5 1:TEC5');
  assert.equal(attr('5 FÍS, 5 TÉC, ou 5 SEN'), '1:FIS5 1:TEC5 1:SEN5');
  assert.equal(attr('10 TÉC'), '1:TEC10');
});

test('stat requirements: anything unread is a problem, not a guess', () => {
  assert.equal(parseStatRequirement('5 XYZ').ok, false);
  assert.equal(parseStatRequirement('Nível 3').ok, false);
});

const skills = (text: string) => {
  const result = parseSkillRequirement(text);
  assert.ok(result.ok);
  return result.value.map((group) => group.map((o) => (o.kind === 'skill' ? o.name : `[${o.categories.join('+')}]`)).join(' | '));
};

test('skill requirements: commas need all, "ou" needs one, Qualquer is by category', () => {
  assert.deepEqual(skills('-'), []);
  assert.deepEqual(skills('Atirador de Longa Distância'), ['Atirador de Longa Distância']);
  assert.deepEqual(skills('Concentração ou Enfurecer'), ['Concentração | Enfurecer']);
  assert.deepEqual(skills('Benção, Cura'), ['Benção', 'Cura']);
  assert.deepEqual(skills('Infundir Fogo ou Infundir Gelo ou Infundir Vento'), ['Infundir Fogo | Infundir Gelo | Infundir Vento']);
  assert.deepEqual(skills('Qualquer (Magia, Trevas)'), ['[Magia+Trevas]']);
  assert.deepEqual(skills('Qualquer (Magia, Trevas, Ataque), Maldição'), ['[Magia+Trevas+Ataque]', 'Maldição']);
  assert.deepEqual(skills('Runa: Dez, Runa: Egoth'), ['Runa: Dez', 'Runa: Egoth']);
});

const cost = (text: string, unit = '') => {
  const result = parseCost(text, unit);
  assert.ok(result.ok, `${text}: ${!result.ok && result.problem}`);
  const c = result.value;
  return [c.cost_value, c.cost_unit, c.cost_scale, c.cost2_value, c.cost2_unit].join('|');
};

test('costs: flat, per something, two resources, and a bare Fatigue number', () => {
  assert.equal(cost('10 Fadiga'), '10|Fadiga|||');
  assert.equal(cost('1 Motivação'), '1|Motivação|||');
  assert.equal(cost('5 Fadiga por Alvo'), '5|Fadiga|Alvo||');
  assert.equal(cost('10 de Fadiga por Nível da Arma'), '10|Fadiga|Nível da Arma||');
  assert.equal(cost('10 de Fadiga por Vantagem por Nível da Arma'), '10|Fadiga|Vantagem por Nível da Arma||');
  assert.equal(cost('1 Ferida e 1 Motivação'), '1|Ferida||1|Motivação');
  assert.equal(cost('10', 'Fadiga'), '10|Fadiga|||');
  assert.equal(cost('--'), '||||'); // no cost
});

test('costs: "- ou 10 Fadiga" is a problem for the report', () => {
  assert.equal(parseCost('- ou 10 Fadiga').ok, false);
});

test('cast times: dashes are blank', () => {
  assert.equal(castTimeOf('--'), '');
  assert.equal(castTimeOf('1 Ação Especial'), '1 Ação Especial');
});
