import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const source = resolve(root, 'mods/pr-flow/hooks')
const target = resolve(root, 'plugins/pr-flow-codex/hooks/shared')
const check = process.argv.includes('--check')
let different = false
for (const file of ['commands.ts', 'body.ts', 'severity.ts']) {
  const content = readFileSync(resolve(source, file), 'utf8').replaceAll("from './severity'", "from './severity.ts'")
  const dest = resolve(target, file)
  if (check) {
    try { if (readFileSync(dest, 'utf8') !== content) different = true } catch { different = true }
  } else { mkdirSync(target, { recursive: true }); writeFileSync(dest, content) }
}
if (different) { console.error('PR-flow: синхронизированные файлы отличаются'); process.exitCode = 1 }
