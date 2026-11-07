import { readdirSync, readFileSync } from 'node:fs'
import { resolve, dirname, relative, join } from 'node:path'

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  })
}
const violations = []
for (const file of files('src').filter((path) => /\.(ts|vue)$/.test(path))) {
  const source = relative('src', file).replaceAll('\\', '/')
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const imported = match[1]
    const target = imported.startsWith('.')
      ? relative('src', resolve(dirname(file), imported)).replaceAll('\\', '/')
      : imported
    if (
      source.startsWith('shared/') &&
      (target.startsWith('main/') ||
        target.startsWith('renderer/') ||
        target.startsWith('node:') ||
        target === 'electron')
    ) {
      violations.push(`${source} → ${target}`)
    }
    if (
      source.startsWith('renderer/') &&
      (target.startsWith('main/') ||
        target.startsWith('preload/') ||
        target.startsWith('node:') ||
        target === 'electron')
    ) {
      violations.push(`${source} → ${target}`)
    }
    if (source.startsWith('main/') && target.startsWith('renderer/')) {
      violations.push(`${source} → ${target}`)
    }
  }
}
if (violations.length) {
  throw new Error(`依赖边界违反：\n${violations.join('\n')}`)
}
process.stdout.write('依赖边界检查通过\n')
