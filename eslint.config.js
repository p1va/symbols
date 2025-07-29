// eslint.config.js
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  // Add a global ignore for the dist directory and this config file
  {
    ignores: ['dist', 'eslint.config.js'],
  },

  // Apply the recommended and type-checked rulesets
  ...tseslint.configs.recommendedTypeChecked,

  // This object configures the parser for type-aware linting.
  // It tells typescript-eslint where to find your tsconfig.json.
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Apply the Prettier config last to override any formatting rules.
  prettierConfig
);
