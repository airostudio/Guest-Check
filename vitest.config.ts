import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/tests/**/*.test.ts'],
    environment: 'node',
    // Each suite stubs globals and re-imports modules; isolate so module-level
    // state (e.g. the email service's "already warned" flag) can't leak.
    isolate: true,
  },
});
