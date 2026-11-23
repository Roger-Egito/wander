import { defineConfig } from 'vitest/config';

// Every package's tests run from the root with one `npm test`.
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.{ts,tsx}', 'tools/*/src/**/*.test.ts', 'supabase/test/*.test.ts', 'app/src/**/*.test.ts', 'sheet-script/src/**/*.test.ts'],
  },
});
