import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/**/*.{ts,js}'],
      // Игнор для файлов без бизнес-логики / не покрываемых по конвенции проекта
      // (см. feedback_no_api_service_tests, feedback_no_repository_tests в CLAUDE.md/AGENTS.md).
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.test.ts',
        'src/main.ts',
        'src/**/index.ts',
        'src/**/*.module.ts',
        'src/**/*.controller.ts',
        'src/**/*.dto.ts',
        'src/**/*.decorator.ts',
        'src/**/*.type.ts',
        'src/**/*.interceptor.ts',
        'src/**/*.api.service.ts',
        'src/**/*.repository.ts',
        'src/**/api-exception-filter.ts',
      ],
      thresholds: {
        // Включить пороги покрытия, когда проект стабилизируется — не блокировать первые коммиты нового приложения.
        // perFile: true,
        // lines: 80,
        // functions: 80,
        // branches: 70,
        // statements: 80,
      },
    },
  },
});
