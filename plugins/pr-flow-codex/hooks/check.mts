import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { detectPrCreate, extractPr, isGitCommit } from './shared/commands.ts'
import { validateBody } from './shared/body.ts'
import { classify, MIGRATION_PATH } from './shared/severity.ts'

type Outcome = { problem?: string, incomplete?: string }
const git = (cwd: string, args: string[]): string | undefined => {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
  catch { return undefined }
}
export function checkBody(body: string, base: string | undefined, cwd: string): Outcome {
  const ref = base ? `origin/${base.replace(/^origin\//, '')}` : git(cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
  const names = ref ? git(cwd, ['diff', '--name-status', '-M', `${ref}...HEAD`]) : undefined
  let incomplete: string | undefined
  let floor: ReturnType<typeof classify> | undefined
  if (names === undefined || !ref) incomplete = 'Не удалось определить изменения относительно base.'
  else {
    const range = `${ref}...HEAD`
    const files = names.split('\n').filter(Boolean).map(line => {
      const [status, ...paths] = line.split('\t')
      return { status: status ?? '', path: paths.at(-1) ?? '' }
    })
    const migrations = files.filter(f => f.status !== 'D' && MIGRATION_PATH.test(f.path)).map(f => f.path)
    const migrationDiff = migrations.length ? git(cwd, ['diff', range, '--', ...migrations]) : ''
    const packageDiff = files.some(f => f.path === 'package.json') ? git(cwd, ['diff', range, '--', 'package.json']) : ''
    if (migrationDiff === undefined || packageDiff === undefined) incomplete = 'Не удалось получить diff миграций или package.json.'
    else floor = classify({ files, migrationDiff, packageDiff })
  }
  return { problem: validateBody(body, floor), incomplete }
}
export function checkCommand(command: string, cwd: string): Outcome {
  command = command.replace(/^rtk\s+(?:proxy\s+)?/, '')
  if (isGitCommit(command) && !/\bgit\s+-[Cc]\s/.test(command)) {
    const branch = git(cwd, ['branch', '--show-current'])
    const head = git(cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])?.replace(/^origin\//, '')
    if (branch && ['main', 'master', head].includes(branch)) return { problem: 'Коммит в trunk запрещён.' }
  }
  const pr = detectPrCreate(command)
  if (!pr) return {}
  let body = pr.body
  let base = pr.base
  if (pr.json !== undefined) ({ body, base = base } = extractPr(pr.json))
  if (pr.file !== undefined) {
    let text: string
    try { text = readFileSync(resolve(cwd, pr.file), 'utf8') }
    catch { return { problem: 'Файл описания ПР не найден.' } }
    if (pr.kind === 'gh') body = text
    else { const parsed = extractPr(text); body = parsed.body; base = parsed.base ?? base }
  }
  if (body === undefined) return { problem: 'Не удалось определить описание ПР; используй --body-file или JSON-файл.' }
  return checkBody(body, base, cwd)
}
