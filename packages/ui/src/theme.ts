/**
 * Every color in Wander, for both themes, in one place.
 *
 * ── Editing this file ──────────────────────────────────────────────────────────
 *
 * Change a value between the quotes and save. The color updates everywhere it's used.
 * Any CSS color works: '#151515', 'white', 'rgb(0 0 0 / 0.5)'.
 *
 * Both palettes have the same names on the left. TypeScript refuses a light palette
 * missing a name the dark one has, so the themes can't drift apart. Don't rename the
 * names: the stylesheets ask for each color by it (`var(--color-txt)`).
 *
 * theme.test.ts measures text contrast in both palettes, so a change that makes text
 * hard to read fails the tests.
 */

export const dark = {
  /* ── the page ──────────────────────────────────────────────────────────────── */

  /** Behind everything. */
  bg: '#141311',
  /** Body text and headings. */
  txt: '#ebe5d9',
  /** Quieter text: labels, IDs, captions. */
  muted: '#a69d8d',

  /* ── cards and panels ──────────────────────────────────────────────────────── */

  /** A card's body, a shade lighter than the page so it reads as a panel. */
  raised: '#1e1c19',
  /** Inside a card: the requirement strip, a trait level's row. */
  sunken: '#171613',
  /** Hairlines around cards and between rows. */
  border: '#3a352e',

  /* ── emphasis ──────────────────────────────────────────────────────────────── */

  /** Wander's gold: the active toggle, keyword underlines, focus rings. */
  accent: '#e0ad4f',
  /** Text on top of an `accent` fill. */
  onAccent: '#1b1408',
  /** Links to the rules. */
  link: '#9cc2e6',

  /* ── game meaning ──────────────────────────────────────────────────────────── */

  /** A Facilidade, a stat raised by a modifier. */
  good: '#79c795',
  /** A Complicação, a stat lowered by a modifier. */
  bad: '#ec8b7b',
  /** A draft or playtest badge. */
  warn: '#e3c16f',

  /* ── shadows and overlays ──────────────────────────────────────────────────── */

  /** The shadow under a popover or a card being dragged. */
  shadow: 'rgb(0 0 0 / 0.45)',
  /** Dims the page behind a confirmation dialog. */
  backdrop: 'rgb(0 0 0 / 0.55)',
} as const satisfies Record<string, string>;

export type ColorName = keyof typeof dark;
export type Palette = Record<ColorName, string>;

export const light: Palette = {
  bg: '#f6f2ea',
  txt: '#1f1b15',
  muted: '#655c4f',

  raised: '#ffffff',
  sunken: '#efe9de',
  border: '#d8cfbf',

  accent: '#8a5c0a',
  onAccent: '#ffffff',
  link: '#1d5a94',

  good: '#2b7448',
  bad: '#ad3826',
  warn: '#7c5d06',

  shadow: 'rgb(60 40 10 / 0.18)',
  backdrop: 'rgb(40 28 10 / 0.35)',
};

export const THEMES = { dark, light } as const;
export type ThemeName = keyof typeof THEMES;

/* ─────────────────────────────────────────────────────────────────────────────── */
/* Below here is plumbing. Nothing to edit.                                        */
/* ─────────────────────────────────────────────────────────────────────────────── */

/** Where the chosen theme is remembered. */
export const THEME_STORAGE_KEY = 'wander-theme';

/** `onAccent` -> `on-accent`, so CSS gets the dashed names it expects. */
const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const block = (selector: string, palette: Palette, scheme: ThemeName) =>
  `${selector} {\n  color-scheme: ${scheme};\n${Object.entries(palette)
    .map(([name, value]) => `  --color-${kebab(name)}: ${value};`)
    .join('\n')}\n}`;

/**
 * Both palettes as CSS custom properties, chosen by the `data-theme` attribute on
 * <html>. The app's index.html gets this in its <head>, so `var(--color-bg)` works in
 * every stylesheet and the palettes above are the only place a color is written.
 */
export const themeCss = [block(':root, :root[data-theme="dark"]', dark, 'dark'), block(':root[data-theme="light"]', light, 'light')].join('\n');

/**
 * Runs in <head> before the page paints: the remembered theme, else the system's, set
 * on <html>. Without it the page would flash dark before switching to a remembered light.
 */
export const themeScript = `(function () {
  var theme;
  try { theme = localStorage.getItem('${THEME_STORAGE_KEY}'); } catch (e) {}
  if (theme !== 'light' && theme !== 'dark') theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
})();`;
