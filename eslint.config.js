import js from '@eslint/js'
import betterTailwindcss from 'eslint-plugin-better-tailwindcss'
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
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'better-tailwindcss': betterTailwindcss },
    settings: {
      'better-tailwindcss': {
        entryPoint: 'src/app/styles.css',
        rootFontSize: 16
      }
    },
    rules: {
      // Mirrors Tailwind IntelliSense's `suggestCanonicalClasses` hint so that
      // `eslint --fix` (and fix-on-save) applies it. Collapsing shorthand and
      // physical→logical rewrites stay off: those change meaning, not spelling.
      'better-tailwindcss/enforce-canonical-classes': [
        'error',
        { collapse: false, logical: false }
      ]
    }
  },
  // Keep this last: it disables every rule that would fight the Prettier formatter.
  prettier
)
