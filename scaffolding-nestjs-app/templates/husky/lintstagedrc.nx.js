// Только для Nx-монорепозитория: выбирает eslint.config.mjs конкретного приложения под apps/<name>,
// иначе падает обратно на корневой eslint.base.config.mjs.
const path = require('path');
const fs = require('fs');

const DEFAULT_CONFIG = 'eslint.base.config.mjs';

module.exports = {
  '*.{ts,tsx,js,jsx}': (files) => {
    return files.map((file) => {
      const relativePath = path.relative(process.cwd(), file);
      const configPath = relativePath.startsWith('apps/')
        ? `apps/${relativePath.split(path.sep)[1]}/eslint.config.mjs`
        : DEFAULT_CONFIG;

      return `eslint --config ${fs.existsSync(configPath) ? configPath : DEFAULT_CONFIG} --fix ${file}`;
    });
  },
  '*.{json,css,scss,md,html}': ['prettier --write'],
};
