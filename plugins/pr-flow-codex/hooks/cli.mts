import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { checkBody } from './check.mts'

export function run(args: string[], cwd: string): number {
  const baseIndex = args.indexOf('--base')
  const bodyIndex = args.indexOf('--body-file')
  if (baseIndex < 0 || bodyIndex < 0 || !args[baseIndex + 1] || !args[bodyIndex + 1]) {
    process.stderr.write('Использование: --base <ветка> --body-file <файл>\n'); return 2
  }
  try {
    const body = readFileSync(resolve(cwd, args[bodyIndex + 1]), 'utf8')
    const result = checkBody(body, args[baseIndex + 1], cwd)
    if (result.problem) { process.stderr.write([result.problem, result.incomplete].filter(Boolean).join(' ') + '\n'); return 1 }
    if (result.incomplete) { process.stderr.write(result.incomplete + '\n'); return 2 }
    return 0
  } catch { process.stderr.write('PR-flow: файл описания недоступен.\n'); return 2 }
}
process.exitCode = run(process.argv.slice(2), process.cwd())
