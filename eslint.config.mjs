import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  {
    files: ['src/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: { project: ['./tsconfig.json'], tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      // Nest decorators rely on parameter properties and metadata emission.
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    files: ['qa/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
  },
);
