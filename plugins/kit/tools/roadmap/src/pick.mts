import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultBranch, git, tryGit } from './git.mts'
import { findRoadmaps } from './files.mts'
import { blocked, needsInput, ok } from './responses.mts'
import type { Response } from './responses.mts'
import { collectOverlays, computeStatus, loadData } from './status.mts'
import { readState, statePathOf, writeState } from './state.mts'

export interface PickOptions { slug?: string; base?: string; name?: string; stepSlug?: string; sync?: string }

const JIRA_KEY = /^[A-Z][A-Z0-9_]*-\d+$/

export function pickCommand(root: string, id: string | undefined, options: PickOptions, env: NodeJS.ProcessEnv): Response {
  if (!id) return blocked('Использование: roadmap pick <id> [--slug …] [--base …] [--name …] [--step-slug …] [--sync merge|rebase|skip].')
  if (git(root, 'status', '--porcelain') !== '') return blocked('Рабочее дерево не чистое: закоммитьте или уберите изменения (stash/discard инструмент не делает).')
  tryGit(root, 'fetch', 'origin', '--prune')
  const branch = defaultBranch(root)
  if (!branch) return blocked('Не удалось определить default-ветку (origin/HEAD).')

  const main = loadData(root, `origin/${branch}`)
  const holders = main.filter(data => data.roadmap.checkpoints.some(checkpoint => checkpoint.id === id && !checkpoint.checked))
  const owners = options.slug ? holders.filter(data => data.slug === options.slug) : holders
  if (owners.length === 0) return blocked(`Невыполненного шага «${id}» нет${options.slug ? ` в роадмапе «${options.slug}»` : ''}.`)
  if (owners.length > 1) return needsInput(`Шаг «${id}» есть в нескольких роадмапах. В каком?`, owners.map(data => data.slug))
  const owner = owners[0]

  const result = computeStatus(main, collectOverlays(root, env))
  const info = result.roadmaps.find(item => item.slug === owner.slug)!.steps.find(item => item.id === id)!
  if (info.state === 'in-flight') return blocked(`Шаг «${id}» уже в открытом PR #${info.pr!.number} (${info.pr!.status}).`)
  if (info.state === 'blocked') return blocked(`Шаг «${id}» заблокирован: ждёт ${info.waitingFor!.map(waiting => `${waiting.roadmap ? `${waiting.roadmap}:` : ''}${waiting.id}${waiting.pr ? ` (PR #${waiting.pr})` : ''}`).join(', ')}.`)

  const step = owner.state?.steps.find(candidate => candidate.id === id)
  const ticket = step && step.ticket !== 'TBD' ? step.ticket : null
  const stepFolder = step?.stepFolder ?? (options.stepSlug ? `docs/${owner.slug}/steps/${options.stepSlug}/` : null)
  if (!stepFolder) return needsInput(`Slug папки шага «${id}» (docs/${owner.slug}/steps/<slug>/)? Он берётся из названия шага «${info.title}»; придумывать его молча нельзя.`)

  // База ветки.
  const current = git(root, 'branch', '--show-current')
  const related = [id, ticket].some(token => token && current.toLowerCase().includes(token.toLowerCase()))
  let base: string
  if (info.state === 'stackable') {
    base = `origin/${info.base!.headRef}`
    tryGit(root, 'fetch', 'origin', `+refs/heads/${info.base!.headRef}:refs/remotes/origin/${info.base!.headRef}`)
  } else if (current === branch && !options.base) {
    base = `origin/${branch}`
  } else if (related && !options.base) {
    const behind = Number(tryGit(root, 'rev-list', '--count', `HEAD..origin/${branch}`) ?? '0')
    if (behind > 0 && !options.sync) return needsInput(`Ветка «${current}» отстаёт от origin/${branch} на ${behind} коммит(ов). Обновить её перед созданием новой?`, ['merge', 'rebase', 'skip'])
    if (options.sync === 'merge') git(root, 'merge', '--no-edit', `origin/${branch}`)
    if (options.sync === 'rebase') git(root, 'rebase', `origin/${branch}`)
    base = current
  } else if (options.base) base = options.base
  else return needsInput(`От какой ветки создать ветку шага «${id}»?`, [`origin/${branch}`, current])

  const name = options.name ?? ticket ?? id
  if (tryGit(root, 'rev-parse', '--verify', '--quiet', `refs/heads/${name}`) !== null) return blocked(`Ветка «${name}» уже существует.`)
  git(root, 'switch', '-c', name, '--no-track', base)

  // Изоляция: спрятать остальные роадмапы (чужой sparse-checkout не трогаем).
  const others = findRoadmaps(root).map(item => item.slug).filter(slug => slug !== owner.slug)
  let isolation: string | { hidden: string[] } = { hidden: [] }
  if ((tryGit(root, 'sparse-checkout', 'list') ?? '') !== '') isolation = 'skipped-user-config'
  else if (others.length > 0) {
    git(root, 'sparse-checkout', 'set', '--no-cone', '/*', ...others.map(slug => `!/docs/${slug}/`))
    mkdirSync(join(root, 'tmp', 'roadmap'), { recursive: true })
    writeFileSync(join(root, 'tmp', 'roadmap', 'isolated.json'), JSON.stringify({ hidden: others }))
    isolation = { hidden: others }
  }

  const path = statePathOf(root, owner.slug)
  const state = readState(path)
  const target = state?.steps.find(candidate => candidate.id === id)
  if (state && target && !target.stepFolder) {
    target.stepFolder = stepFolder
    writeState(path, state)
  }
  const flow = fileURLToPath(new URL('../../flow/cli/main.mts', import.meta.url))
  const taskId = ticket ?? id
  return ok({ branch: name, base, isolation, stepFolder, flow: `node ${flow} start ${taskId} --step-dir ${stepFolder.replace(/\/+$/, '')}${JIRA_KEY.test(taskId) ? '' : ' --no-tracker'}` })
}
