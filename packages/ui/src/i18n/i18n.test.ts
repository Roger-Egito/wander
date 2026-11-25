import { describe, expect, test } from 'vitest';
import en from './en.json' with { type: 'json' };
import pt from './pt-BR.json' with { type: 'json' };
import { interpolate, translate } from './messages.ts';

const variables = (message: string) => [...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('the locale files', () => {
  test('have the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
  });

  test('use the same variables in each message', () => {
    for (const key of Object.keys(pt) as (keyof typeof pt)[]) expect(variables(en[key]), key).toEqual(variables(pt[key]));
  });

  test('have no empty message', () => {
    for (const [key, message] of [...Object.entries(pt), ...Object.entries(en)]) expect(message.trim(), key).not.toBe('');
  });
});

test('every singular form belongs to a message with a count', () => {
  for (const key of Object.keys(pt).filter((k) => k.endsWith('_one'))) {
    const base = key.slice(0, -'_one'.length) as keyof typeof pt;
    expect(pt[base], key).toBeDefined();
    expect(variables(pt[key as keyof typeof pt]), key).toEqual(variables(pt[base]));
    expect(variables(pt[base]), key).toContain('count');
  }
});

test('the singular form is for exactly one', () => {
  expect(translate('pt', 'editor.selected', { count: 1 })).toBe('1 selecionado');
  expect(translate('pt', 'editor.selected', { count: 0 })).toBe('0 selecionados');
  expect(translate('pt', 'editor.selected', { count: 2 })).toBe('2 selecionados');
  expect(translate('en', 'editor.count', { count: 1 })).toBe('1 item');
  expect(translate('en', 'editor.count', { count: 3 })).toBe('3 items');
  // A message without a singular form stays as it is.
  expect(translate('pt', 'editor.selectAll', { count: 1 })).toBe('Selecionar todos os filtrados (1)');
});

test('interpolate fills variables and leaves unknown ones', () => {
  expect(interpolate('Nível {level}', { level: 3 })).toBe('Nível 3');
  expect(interpolate('Requer {levels}', {})).toBe('Requer {levels}');
});
