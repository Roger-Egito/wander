import { describe, expect, test } from 'vitest';
import { THEMES, type ColorName } from './theme.ts';

/** WCAG 2.2 relative luminance and contrast ratio (https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio). */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Text color, the backgrounds it sits on, and the ratio it needs (4.5 for body text, AA). */
const PAIRS: [ColorName, ColorName[], number][] = [
  ['txt', ['bg', 'raised', 'sunken'], 7],
  ['muted', ['bg', 'raised', 'sunken'], 4.5],
  ['accent', ['bg', 'raised', 'sunken'], 4.5],
  ['link', ['bg', 'raised', 'sunken'], 4.5],
  ['good', ['raised', 'sunken'], 4.5],
  ['bad', ['raised', 'sunken'], 4.5],
  ['warn', ['raised', 'sunken'], 4.5],
  ['onAccent', ['accent'], 4.5],
];

describe.each(Object.entries(THEMES))('the %s palette', (_, palette) => {
  test.each(PAIRS)('%s reads on its backgrounds', (text, backgrounds, minimum) => {
    for (const background of backgrounds) {
      expect(contrast(palette[text], palette[background]), `${text} on ${background}`).toBeGreaterThanOrEqual(minimum);
    }
  });
});
