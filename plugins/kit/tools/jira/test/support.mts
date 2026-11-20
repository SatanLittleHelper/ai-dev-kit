import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, beforeEach } from 'node:test'
import { startFakeJira } from './fake-jira.mts'
import type { FakeJira } from './fake-jira.mts'

const TOOL_DIR = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const CLI = join(TOOL_DIR, 'cli', 'main.mts')

interface CliResult { code: number; stdout: string; stderr: string }
interface Sandbox { cwd: string; home: string; run(args: string[]): Promise<CliResult> }

// Поднимает поддельную Jira на файл тестов; возвращаемый объект стабилен, а url/state делегируются запущенному серверу.
export function useFakeJira(): FakeJira {
  let started: FakeJira | undefined
  before(async () => { started = await startFakeJira() })
  after(async () => { await started?.close() })
  beforeEach(() => { started?.reset() })
  return {
    get url() { return started!.url },
    get state() { return started!.state },
    reset: () => started!.reset(),
    close: () => started!.close(),
  }
}

export const CREATE = ['create', '--title-file', 't.txt', '--body-file', 'b.txt']

export function sandbox(fake: FakeJira, { title = 'Заголовок задачи', body = 'h3. Контекст\n* пункт\n' } = {}): Sandbox {
  const root = mkdtempSync(join(tmpdir(), 'jira-e2e-'))
  const cwd = join(root, 'project')
  const home = join(root, 'home')
  mkdirSync(join(cwd, '.claude'), { recursive: true })
  writeFileSync(join(cwd, '.claude', 'dev-conventions.json'), JSON.stringify({
    ticketPrefix: 'ABC',
    jira: { baseUrl: fake.url, defaultIssueType: 'Task' },
  }))
  writeFileSync(join(cwd, 't.txt'), title)
  writeFileSync(join(cwd, 'b.txt'), body)
  const env = { ...process.env, JIRA_HOME: home, JIRA_PLAYWRIGHT_DIR: TOOL_DIR, JIRA_TIMEOUT_MS: '3000', JIRA_HEADLESS: '1' }
  return {
    cwd,
    home,
    run: args => new Promise(resolve => {
      const child = spawn(process.execPath, [CLI, ...args], { cwd, env })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', chunk => { stdout += chunk })
      child.stderr.on('data', chunk => { stderr += chunk })
      child.on('close', code => resolve({ code: code ?? -1, stdout, stderr }))
    }),
  }
}
