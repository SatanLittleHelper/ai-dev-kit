import { existsSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { run } from './run.mts'

export function main(argv = process.argv.slice(2)): number {
  return run(argv, { cwd: process.cwd(), out: text => process.stdout.write(`${text}\n`) })
}

if (process.argv[1] && existsSync(process.argv[1]) && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  process.exitCode = main()
}
