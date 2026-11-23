import { describe, expect, test } from 'vitest';
import en from './en.json' with { type: 'json' };
import pt from './pt-BR.json' with { type: 'json' };
import { interpolate } from './messages.ts';

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

test('interpolate fills variables and leaves unknown ones', () => {
  expect(interpolate('Nível {level}', { level: 3 })).toBe('Nível 3');
  expect(interpolate('Requer {levels}', {})).toBe('Requer {levels}');
});
