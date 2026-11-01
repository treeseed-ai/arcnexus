import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import { documentation, spacing } from './scripts/foundation/readability-rules.ts';

export default tseslint.config(
  { ignores: ['dist/**', '.test-build/**', '.fixture-build/**', 'node_modules/**', 'context/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,mts,cts,js,mjs}'],
    languageOptions: { globals: globals.node },
    plugins: { arcnexus: { rules: { documentation, spacing } } },
    linterOptions: { noInlineConfig: true },
    rules: {
      'arcnexus/documentation': 'error',
      'arcnexus/spacing': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'max-lines': ['error', { max: 500, skipBlankLines: false, skipComments: false }],
      'max-lines-per-function': [
        'error',
        { max: 30, skipBlankLines: false, skipComments: false, IIFEs: true },
      ],
    },
  },
);
