import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'dist/'] },
  js.configs.recommended,
  {
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'multi-line'],
      'no-shadow': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-implicit-globals': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-console': 'error',
    },
  },
  { files: ['src/**/*.js'], languageOptions: { sourceType: 'module', globals: { ...globals.browser } } },
  { files: ['menu.js'], languageOptions: { sourceType: 'script', globals: { ...globals.browser } } },
  {
    // keymap.js is generated data: top-level variables are the globals that the page script reads
    files: ['keymap.js'],
    languageOptions: { sourceType: 'script' },
    rules: { 'no-var': 'off', 'no-unused-vars': 'off', 'no-implicit-globals': 'off' },
  },
  { files: ['test/**/*.js', 'scripts/**/*.mjs', 'eslint.config.js'], languageOptions: { sourceType: 'module', globals: { ...globals.node } }, rules: { 'no-console': 'off' } },
];
