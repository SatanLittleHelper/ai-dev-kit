import { basename, dirname, join } from 'node:path'
import type { Page } from 'playwright-core'
import { assertNoLintErrors, formatErrors, lintIssueDraft, lintMarkup, lintTitle } from '../src/draft/lint.mts'
import { parseDraft } from '../src/draft/split.mts'
import { commentIssue } from '../src/scenarios/comment-issue.mts'
import { editIssue } from '../src/scenarios/edit-issue.mts'
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
import { parseDraftArgs, parseCommentArgs, parseEditArgs, parseAfterMergeArgs, parseCreateArgs, parseTransitionArgs, parseGetArgs, usageError } from './args.mts'

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
  assertNoLintErrors([...lintTitle(args.title), ...lintMarkup(args.body)], 'Задача')
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
    const result = await getIssue(page, { key: args.key, config, timeoutMs: timeoutMs(io), withDescription: args.withDescription })
    io.out(JSON.stringify(result))
    return 0
  }))
}

function readText(io: Io, path: string): string {
  try {
    return io.readFile(path)
  } catch {
    throw usageError(`не удалось прочитать файл ${path}`)
  }
}

function writeText(io: Io, path: string, content: string): void {
  try {
    io.writeFile(path, content)
  } catch {
    throw new CliError(`Не удалось записать файл ${path}.`, EXIT.FAILURE)
  }
}

// Работает только с файлами: ни Jira, ни настройки проекта не нужны.
function draft(rest: string[], io: Io): number {
  const args = parseDraftArgs(rest)
  const text = readText(io, args.file)
  if (args.action === 'split') {
    const parsed = parseDraft(text)
    if (!parsed.ok) throw new CliError(`Черновик не разобран:\n${formatErrors(parsed.errors)}`, EXIT.FAILURE)
    const stem = join(args.outDir ?? dirname(args.file), basename(args.file).replace(/\.[^.]+$/, ''))
    writeText(io, `${stem}.title.txt`, parsed.title)
    writeText(io, `${stem}.body.txt`, parsed.body)
    io.out(JSON.stringify({ title: `${stem}.title.txt`, body: `${stem}.body.txt` }))
    return 0
  }
  const errors = args.kind === 'issue' ? lintIssueDraft(text) : lintMarkup(text)
  io.out(JSON.stringify({ ok: errors.length === 0, errors }))
  return errors.length === 0 ? 0 : EXIT.FAILURE
}

// Общая обвязка записи в существующую задачу. Пробный запуск открывает видимое окно и ждёт его закрытия; JIRA_HEADLESS=1 отключает это для автотестов.
async function writeToIssue<T>(
  io: Io,
  config: JiraConfig,
  dryRun: boolean,
  action: (page: Page, pause?: () => Promise<void>) => Promise<T>,
): Promise<T> {
  const headed = io.env.JIRA_HEADLESS === '0' || (dryRun && io.env.JIRA_HEADLESS !== '1')
  return withProfile(io, config, (pw, home) => withSession(pw, profilePath(home, config.host), !headed, async page => {
    const closed = headed && dryRun ? whenClosed(page.context()) : undefined
    return action(page, closed ? () => closed : undefined)
  }))
}

async function comment(rest: string[], io: Io): Promise<number> {
  const args = parseCommentArgs(rest, io.readFile)
  assertNoLintErrors(lintMarkup(args.body), 'Комментарий')
  const config = loadConfig(io.cwd, io.readFile)
  const dryRun = resolveDryRun(args.dryRun, config)
  if (dryRun && args.dryRun === undefined) io.err('Пробный запуск включён настройкой jira.dryRun; для настоящей записи добавьте --no-dry-run.')
  const result = await writeToIssue(io, config, dryRun, (page, pause) => commentIssue(page, {
    key: args.key, body: args.body, config, dryRun, timeoutMs: timeoutMs(io), pause,
  }))
  io.out(JSON.stringify(result))
  return 0
}

async function edit(rest: string[], io: Io): Promise<number> {
  const args = parseEditArgs(rest, io.readFile)
  assertNoLintErrors([...(args.title ? lintTitle(args.title) : []), ...(args.body ? lintMarkup(args.body) : [])], 'Правка')
  const config = loadConfig(io.cwd, io.readFile)
  const dryRun = resolveDryRun(args.dryRun, config)
  if (dryRun && args.dryRun === undefined) io.err('Пробный запуск включён настройкой jira.dryRun; для настоящей записи добавьте --no-dry-run.')
  const result = await writeToIssue(io, config, dryRun, (page, pause) => editIssue(page, {
    key: args.key, title: args.title, body: args.body, config, dryRun, timeoutMs: timeoutMs(io), pause,
  }))
  io.out(JSON.stringify(result))
  return 0
}

export async function run(argv: string[], io: Io): Promise<number> {
  try {
    const [command, ...rest] = argv
    if (command === 'create') return await create(rest, io)
    if (command === 'transition') return await transition(rest, io)
    if (command === 'after-merge') return await afterMerge(rest, io)
    if (command === 'get') return await get(rest, io)
    if (command === 'draft') return draft(rest, io)
    if (command === 'comment') return await comment(rest, io)
    if (command === 'edit') return await edit(rest, io)
    if (command === 'status') return await status(rest, io)
    if (command === 'login') return await login(rest, io)
    throw usageError('Неизвестная команда.')
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error))
    return error instanceof CliError ? error.code : EXIT.FAILURE
  }
}
