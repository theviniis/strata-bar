import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'src-tauri', 'research'] },
  {
    files: ['**/*.{js,ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ]
    }
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    extends: [reactHooks.configs.flat['recommended-latest']]
  },
  {
    files: ['src/**/*.tsx'],
    extends: [reactRefresh.configs.vite]
  },
  {
    files: ['*.{js,ts}'],
    languageOptions: { globals: globals.node }
  },
  // Keep this last: it disables every rule that would fight the Prettier formatter.
  prettier
)
