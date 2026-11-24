import { join } from 'node:path'
import { planAfterMerge, withTesterEmail } from '../src/after-merge.mts'
import { loadConfig, resolveDryRun, resolveIssueType, resolveProject } from '../src/config.mts'
import type { JiraConfig } from '../src/config.mts'
import { CliError, EXIT } from '../src/errors.mts'
import { launch, openJira, whenClosed, withSession } from '../src/browser.mts'
import { ensurePlaywright, jiraHome, loadPlaywright, npmInstall, profilePath, withLock } from '../src/profile.mts'
import type { PlaywrightModule } from '../src/profile.mts'
import { createIssue } from '../src/scenarios/create-issue.mts'
import { transitionIssue } from '../src/scenarios/transition-issue.mts'
import { getIssue } from '../src/scenarios/get-issue.mts'
import { parseAfterMergeArgs, parseCreateArgs, parseTransitionArgs, parseGetArgs, usageError } from './args.mts'

const DEFAULT_TIMEOUT_MS = 30_000

export interface Io {
  cwd: string
  env: NodeJS.ProcessEnv
  readFile(path: string): string
  writeFile(path: string, content: string): void
  out(text: string): void
  err(text: string): void
}

const playwrightDir = (io: Io): string => io.env.JIRA_PLAYWRIGHT_DIR ?? jiraHome(io.env)
const timeoutMs = (io: Io): number => Number(io.env.JIRA_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS

async function withProfile<T>(io: Io, config: JiraConfig, action: (pw: PlaywrightModule, home: string) => Promise<T>): Promise<T> {
  const home = jiraHome(io.env)
  return withLock(home, config.host, () => action(loadPlaywright(playwrightDir(io)), home))
}

function noArguments(rest: string[]): void {
  if (rest.length > 0) throw usageError(`Лишние аргументы: ${rest.join(' ')}`)
}

async function status(rest: string[], io: Io): Promise<number> {
  noArguments(rest)
  const config = loadConfig(io.cwd, io.readFile)
  return withProfile(io, config, (pw, home) => withSession(pw, profilePath(home, config.host), true, async page => {
    page.setDefaultTimeout(timeoutMs(io))
    await openJira(page, config.baseUrl)
    io.err('Сессия Jira активна.')
    return 0
  }))
}

async function login(rest: string[], io: Io): Promise<number> {
  noArguments(rest)
  const config = loadConfig(io.cwd, io.readFile)
  ensurePlaywright(playwrightDir(io), npmInstall)
  return withProfile(io, config, async (pw, home) => {
    const context = await launch(pw, profilePath(home, config.host), false)
    const page = context.pages()[0] ?? await context.newPage()
    await page.goto(config.baseUrl)
    io.err('Войдите в Jira в открытом окне, затем закройте его.')
    await whenClosed(context)
    return 0
  })
}

async function create(rest: string[], io: Io): Promise<number> {
  const config = loadConfig(io.cwd, io.readFile)
  const args = parseCreateArgs(rest, io.readFile)
  const dryRun = resolveDryRun(args.dryRun, config)
  if (dryRun && args.dryRun === undefined) io.err('Пробный запуск включён настройкой jira.dryRun; для настоящего создания добавьте --no-dry-run.')
  const request = { ...args, dryRun, project: resolveProject(args.project, config), type: resolveIssueType(args.type, config) }
  return withProfile(io, config, async (pw, home) => {
    // Пробный запуск всегда с видимым окном и ждёт его закрытия; JIRA_HEADLESS=1 отключает это для автотестов.
    const headed = Boolean(request.dryRun) && io.env.JIRA_HEADLESS !== '1'
    return withSession(pw, profilePath(home, config.host), !headed, async page => {
      // Подписка на закрытие окна — до заполнения формы, иначе ранее закрытое окно оставит CLI висеть.
      let pause: (() => Promise<void>) | undefined
      if (headed) {
        const closed = whenClosed(page.context())
        pause = () => closed
      }
      const result = await createIssue(page, { baseUrl: config.baseUrl, timeoutMs: timeoutMs(io), progress: io.err, pause }, request)
      io.out(JSON.stringify(result))
      return 0
    })
  })
}

async function transition(rest: string[], io: Io): Promise<number> {
  const args = parseTransitionArgs(rest)
  const config = loadConfig(io.cwd, io.readFile)
  const expectedInstance = io.env.JIRA_EXPECTED_INSTANCE
  if (expectedInstance && config.baseUrl !== expectedInstance) {
    throw new CliError(`Настройка jira.baseUrl не указывает на ожидаемый экземпляр Jira: ${expectedInstance}.`, EXIT.FAILURE)
  }
  const dryRun = resolveDryRun(args.dryRun, config)
  const headed = io.env.JIRA_HEADLESS === '0' || (dryRun && io.env.JIRA_HEADLESS !== '1')
  if (dryRun && args.dryRun === undefined) {
    io.err('Пробный запуск включён настройкой jira.dryRun. Для реального перехода добавьте --no-dry-run.')
  }
  return withProfile(io, config, (pw, home) => withSession(pw, profilePath(home, config.host), !headed, async page => {
    const closed = headed && dryRun ? whenClosed(page.context()) : undefined
    const result = await transitionIssue(page, {
      key: args.key,
      target: args.target,
      assignee: args.assignee,
      config,
      dryRun,
      timeoutMs: timeoutMs(io),
      pause: closed ? () => closed : undefined,
    })
    io.out(JSON.stringify(result))
    return 0
  }))
}

async function afterMerge(rest: string[], io: Io): Promise<number> {
  const args = parseAfterMergeArgs(rest)
  const path = join(io.cwd, '.claude', 'dev-conventions.json')
  let raw = '{}'
  try {
    raw = io.readFile(path)
  } catch {
    // Нет файла настроек — проект без Jira, план вернёт skipped.
  }
  let json: Parameters<typeof planAfterMerge>[0]
  try {
    json = JSON.parse(raw)
  } catch {
    throw new CliError(`${path} — невалидный JSON.`, EXIT.FAILURE)
  }
  const plan = planAfterMerge(json, args)
  if (plan.result !== 'ready') {
    io.out(JSON.stringify(plan))
    return 0
  }
  if (args.testerEmail) io.writeFile(path, withTesterEmail(raw, args.testerEmail))

  const argv = [plan.key, '--to', 'testing']
  if (plan.assignee) argv.push('--assignee', plan.assignee)
  if (args.dryRun !== undefined) argv.push(args.dryRun ? '--dry-run' : '--no-dry-run')
  let reply = ''
  const code = await transition(argv, { ...io, out: text => { reply = text } })
  if (code === 0) io.out(JSON.stringify({ result: 'done', ...JSON.parse(reply) }))
  return code
}

async function get(rest: string[], io: Io): Promise<number> {
  const args = parseGetArgs(rest)
  const config = loadConfig(io.cwd, io.readFile)
  return withProfile(io, config, (pw, home) => withSession(pw, profilePath(home, config.host), true, async page => {
    const result = await getIssue(page, { key: args.key, config, timeoutMs: timeoutMs(io) })
    io.out(JSON.stringify(result))
    return 0
  }))
}

export async function run(argv: string[], io: Io): Promise<number> {
  try {
    const [command, ...rest] = argv
    if (command === 'create') return await create(rest, io)
    if (command === 'transition') return await transition(rest, io)
    if (command === 'after-merge') return await afterMerge(rest, io)
    if (command === 'get') return await get(rest, io)
    if (command === 'status') return await status(rest, io)
    if (command === 'login') return await login(rest, io)
    throw usageError('Неизвестная команда.')
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error))
    return error instanceof CliError ? error.code : EXIT.FAILURE
  }
}
