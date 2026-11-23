import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**'],
    // All files share one database: run them one at a time.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
