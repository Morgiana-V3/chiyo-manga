import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['out/**', 'node_modules/**', 'release/**'] },
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  { files: ['**/*.vue'], languageOptions: { parserOptions: { parser: tseslint.parser } } },
  {
    files: ['src/**/*.{ts,vue}', 'scripts/*.mjs', 'tests/*.ts'],
    rules: {
      curly: ['error', 'all'],
      'no-nested-ternary': 'error',
      'one-var': ['error', 'never'],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': ['error', { ignores: ['App'] }],
    },
  },
  prettier,
)
