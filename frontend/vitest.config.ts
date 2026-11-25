import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests for pure frontend logic (src/**/*.test.ts). No DOM/E2E tests.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['src/**/*.test.ts', 'pwa/**/*.test.mjs', 'scripts/**/*.test.mjs'] },
});
