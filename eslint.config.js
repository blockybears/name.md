import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'packages/*/dist', 'src-tauri/target']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Fast-refresh only applies to the app's React components, not the
    // framework-agnostic sketch engine or its barrels.
    files: ['src/**/*.{ts,tsx}', 'packages/*/src/react/**/*.{ts,tsx}', 'packages/*/demo/**/*.{ts,tsx}'],
    extends: [reactRefresh.configs.vite],
  },
])
