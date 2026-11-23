import { defineConfig } from 'vite';

/**
 * One classic script for Apps Script: an IIFE that defines the global `Wander`, not
 * minified so it can be read in the Apps Script editor. public/ (appsscript.json and
 * the trigger functions) is copied next to it, and clasp pushes the whole dist/.
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    target: 'es2019',
    minify: false,
    lib: { entry: 'src/main.ts', formats: ['iife'], name: 'Wander', fileName: () => 'wander.js' },
  },
});
