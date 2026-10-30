import type { EngineInterface, Register } from 'claude-code'

import { validateBody } from './body'
import { detectPrCreate, extractPr, isGitCommit, wantsPr } from './commands'
import type { PrCreate } from './commands'
import { FLOW_INSTRUCTIONS } from './flow'
import { MIGRATION_PATH, classify } from './severity'
import type { ChangedFile, Severity } from './severity'

const TRUNKS = ['main', 'master']
const DEFAULT_HEAD = ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']

// Вывод git или `undefined`, если git упал: решения мода при сбое мягкие.
async function git($: EngineInterface, args: readonly string[]): Promise<string | undefined> {
  const { exitCode, stdout } = await $.process.run(['git', ...args])

  return exitCode === 0 ? stdout.trim() : undefined
}

async function isTrunk($: EngineInterface): Promise<boolean> {
  const branch = await git($, ['branch', '--show-current'])

  if (!branch) {
    return false
  }

  const head = await git($, DEFAULT_HEAD)

  return [...TRUNKS, ...(head ? [head.replace(/^origin\//, '')] : [])].includes(branch)
}

// Нижняя граница серьёзности по диффу ветки с base; `undefined`, если дифф получить не удалось.
async function floorFor($: EngineInterface, base: string | undefined): Promise<Severity | undefined> {
  const baseRef = base ? `origin/${base}` : await git($, DEFAULT_HEAD)

  if (!baseRef) {
    return undefined
  }

  const range = `${baseRef}...HEAD`
  const names = await git($, ['diff', '--name-status', '-M', range])

  if (names === undefined) {
    return undefined
  }

  const files: ChangedFile[] = names
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [status, ...paths] = line.split('\t')

      return { status: status ?? '', path: paths.at(-1) ?? '' }
    })
  const migrations = files.filter(file => file.status !== 'D' && MIGRATION_PATH.test(file.path)).map(file => file.path)
  const migrationDiff = migrations.length > 0 ? ((await git($, ['diff', range, '--', ...migrations])) ?? '') : ''
  const packageDiff = files.some(file => file.path === 'package.json')
    ? ((await git($, ['diff', range, '--', 'package.json'])) ?? '')
    : ''

  return classify({ files, migrationDiff, packageDiff })
}

// Замечание к команде создания ПР или `undefined`, если её можно выполнять.
async function checkPr($: EngineInterface, pr: PrCreate): Promise<string | undefined> {
  let body = pr.body
  let base = pr.base

  if (pr.json !== undefined) {
    const parsed = extractPr(pr.json)

    body = parsed.body
    base = parsed.base ?? base
  }

  if (pr.file !== undefined) {
    const text = await $.fs.read(pr.file).catch(() => undefined)

    if (typeof text !== 'string') {
      return `файл «${pr.file}» с описанием ПР не найден. Сначала запиши его отдельным шагом, затем создавай ПР.`
    }

    if (pr.kind === 'gh') {
      body = text
    } else {
      const parsed = extractPr(text)

      body = parsed.body
      base = parsed.base ?? base
    }
  }

  if (body === undefined) {
    return 'не удалось определить описание ПР из команды. Передай его через --body-file (gh) или JSON-файл в -d @файл (curl).'
  }

  return validateBody(body, await floorFor($, base))
}

export const register: Register = on => {
  on('prompt.submit', ($, e, next) =>
    e.command === undefined && e.isMeta !== true && wantsPr(e.text)
      ? next({ ...e, context: [...(e.context ?? []), FLOW_INSTRUCTIONS] })
      : next(e),
  ).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (isGitCommit(e.command) && (await isTrunk($))) {
      return {
        deny: `${$.plugin.name}: коммит в trunk запрещён. Предложи имя ветки по rules/base/git-and-commits.md, получи подтверждение пользователя, создай ветку и повтори коммит.`,
      }
    }

    const pr = detectPrCreate(e.command)
    const problem = pr ? await checkPr($, pr) : undefined

    return problem === undefined ? next(e) : { deny: `${$.plugin.name}: ${problem}` }
  }).catch(($, e, next) => next(e))
}
