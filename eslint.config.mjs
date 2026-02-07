// @ts-check
import { defineConfig } from 'eslint/config';

import js from '@eslint/js';
import globals from 'globals';
import { configs, parser } from 'typescript-eslint';

// Additional Plugins
import simpleImportSort from 'eslint-plugin-simple-import-sort';

// Additional Configs
import prettierConfig from 'eslint-config-prettier';

export default defineConfig([
  // Global Ignores
  {
    ignores: [
      '**/dist*/**',
      '**/node_modules/**',
      '**/.env*',
      '**/.eslintcache',
      '**/coverage/**',
      'eslint.*'
    ],
  },

  // Base JS Configuration
  js.configs.recommended,

  // TypeScript Configuration
  ...[
    ...configs.strictTypeChecked,
    ...configs.stylisticTypeChecked,
  ].map((config) => ({
    ...config,
    files: ['src/**/*.{ts,mts,cts}'],
  })),

  // Main TS Configuration + Custom Rules
  {
    files: ['src/**/*.{ts,mts,cts}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: globals.node,
    },

    plugins: {
      'simple-import-sort': simpleImportSort,
    },

    rules: {
      // Sort Imports and Exports
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',

      // Security: Prevent console logs in production to avoid data leaks
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // Test Files Overrides
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    extends: [configs.disableTypeChecked],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Prettier Configuration Always Last
  prettierConfig,
]);
