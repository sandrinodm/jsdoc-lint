import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', '*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/check/config.ts',
        'src/check/constants.ts',
        'src/check/declarations.ts',
        'src/check/files.ts',
        'src/check/index.ts',
        'src/check/report.ts',
        'src/check/schema-declarations.ts',
        'src/cli/args.ts',
        'src/cli/index.ts',
        'src/cli/run.ts',
        'src/index.ts',
      ],
      reporter: ['text', 'lcov'],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
