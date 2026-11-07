export default {
  extends: ['stylelint-config-standard'],
  overrides: [
    { files: ['**/*.less'], customSyntax: 'postcss-less' },
    { files: ['**/*.vue'], customSyntax: 'postcss-html' },
  ],
  rules: { 'selector-class-pattern': '^[a-z][a-z0-9-]*$', 'max-nesting-depth': 2 },
}
