import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/**/test/**/*.test.ts',
      'test/**/*.test.ts',
    ],
    testTimeout: 60000,
  },
});
