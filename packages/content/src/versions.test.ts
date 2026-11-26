import { expect, test } from 'vitest';
import { compareVersions, latestVersion, nextVersion, parseVersion } from './versions.ts';

const order = (a: string, b: string) => Math.sign(compareVersions(parseVersion(a)!, parseVersion(b)!));

test('the next version is a patch bump of the highest one, keeping the beta label', () => {
  expect(nextVersion([])).toBe('0.1.0-beta');
  expect(nextVersion(['0.1.0-beta', '0.1.3-beta', 'rascunho'])).toBe('0.1.4-beta');
  // After leaving beta by typing 1.0.0, the label is gone for good.
  expect(nextVersion(['0.1.4-beta', '1.0.0'])).toBe('1.0.1');
});

test('versions order by their numbers, and a labeled one comes before the same numbers without', () => {
  expect(order('0.1.10-beta', '0.1.9-beta')).toBe(1);
  expect(order('0.2.0-beta', '0.1.9-beta')).toBe(1);
  expect(order('1.0.0-beta', '1.0.0')).toBe(-1);
  expect(order('0.1.0-beta', '0.1.0-beta')).toBe(0);
});

test('the latest version skips text that is not a version', () => {
  expect(latestVersion(['0.1.0-beta', 'rascunho', ' 0.1.2-beta '])).toBe('0.1.2-beta');
  expect(latestVersion(['', 'x'])).toBeNull();
});
