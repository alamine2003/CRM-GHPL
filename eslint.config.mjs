// Configuration ESLint commune au portail, à l'application mobile et aux paquets.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.expo/**',
      'backend/**',
      'mobile/android/**',
      'mobile/ios/**',
      'packages/api-types/src/schema.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-globals': [
        'error',
        {
          name: 'localStorage',
          message:
            'Interdit pour les jetons (architecture-essentials §10) ; passer par un module dédié.',
        },
      ],
    },
  },
  {
    files: ['portail/src/**/*.tsx'],
    ignores: ['portail/src/main.tsx'],
    rules: { 'react-refresh/only-export-components': ['warn', { allowConstantExport: true }] },
  },
  {
    files: ['**/*.config.{js,cjs,mjs,ts}', 'mobile/babel.config.js', 'mobile/metro.config.js'],
    languageOptions: { globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
