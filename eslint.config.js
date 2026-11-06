// eslint.config.js
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  // Ignore generated, archived, external, and non-project executable artifacts.
  {
    ignores: [
      'dist',
      'eslint.config.js',
      'scripts/**/*.mjs',
      'playground',
      'test/**/*.js',
      '.external',
      'test-results/**',
      'docs/security/scans/**',
    ],
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
    rules: {
      curly: 'warn',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['vscode-jsonrpc', 'vscode-jsonrpc/*'],
              message:
                "Import from 'vscode-languageserver-protocol' (or '/node'). Its request descriptors only work with the vscode-jsonrpc copy it bundles; a second copy fails with 'Unknown parameter structure byName'.",
            },
          ],
        },
      ],
    },
  },

  // Apply the Prettier config last to override any formatting rules.
  prettierConfig
);
