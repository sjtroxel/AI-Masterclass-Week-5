import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      '**/__tests__/**/*.test.ts',
      '**/__tests__/**/*.spec.ts',
      '**/src/**/*.test.ts',
      '**/src/**/*.spec.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
});
