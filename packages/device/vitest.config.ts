import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'device',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
