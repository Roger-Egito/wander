import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import * as builtTheme from '@wander/ui/theme';

/**
 * Puts both palettes and the theme script in <head>, so the first paint already has the
 * remembered theme. theme.ts stays the only place a color is written.
 *
 * On the dev server, theme.ts is loaded through Vite's module graph on every page
 * request, so a color change shows on the next reload without restarting the server.
 * The build uses the copy imported above.
 */
const theme = (): Plugin => ({
  name: 'wander-theme',
  async transformIndexHtml(_, ctx) {
    const { themeCss, themeScript } = ctx.server ? ((await ctx.server.ssrLoadModule('@wander/ui/theme')) as typeof builtTheme) : builtTheme;
    return [
      { tag: 'style', children: themeCss, injectTo: 'head' },
      { tag: 'script', children: themeScript, injectTo: 'head' },
    ];
  },
});

/**
 * GitHub Pages answers any path it has no file for with 404.html. A copy of the app
 * there means a link straight to /wander/editor loads the app, which then shows the
 * right page, instead of GitHub's error page.
 */
const spaFallback = (): Plugin => ({
  name: 'wander-404',
  apply: 'build',
  closeBundle() {
    const dist = resolve(import.meta.dirname, 'dist');
    copyFileSync(resolve(dist, 'index.html'), resolve(dist, '404.html'));
  },
});

export default defineConfig(({ command, isPreview }) => ({
  // The site lives at roger-egito.github.io/<repository>/. The deploy workflow passes the
  // repository's exact name, since that part of the URL is case-sensitive. `vite preview`
  // serves the build, so it needs the same path (it runs as "serve", hence isPreview).
  base: command === 'build' || isPreview ? (process.env.BASE_PATH ?? '/wander/') : '/',
  plugins: [react(), theme(), spaFallback()],
  server: { port: 5173, strictPort: true },
}));
