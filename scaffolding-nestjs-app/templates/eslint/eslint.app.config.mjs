// Только для Nx-монорепозитория: eslint.config.mjs конкретного приложения, расширяющий корневой eslint.base.config.mjs.
// Путь к базовому конфигу и tsconfig-файлам зависит от глубины apps/<app-name>/.
import baseConfig from '../../eslint.base.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: [
          'apps/__APP_NAME__/tsconfig.app.json',
          'apps/__APP_NAME__/tsconfig.json',
          'apps/__APP_NAME__/tsconfig.spec.json',
        ],
      },
    },
  },
];
