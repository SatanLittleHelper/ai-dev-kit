import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createForgejo } from '../src/provider.mts'
import type { Http } from '../src/types.mts'
import { run } from './run.mts'
import type { Io } from './run.mts'

const HTTP_TIMEOUT_MS = 30_000

const http: Http = async (url, init) => {
  const creatingPull = init?.method === 'POST' && new URL(url).pathname.endsWith('/pulls')
  const response = await fetch(url, creatingPull ? { ...init, redirect: 'error' } : init)
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => { headers[key] = value })
  return { status: response.status, ok: response.ok, headers, text: await response.text() }
}

// Only request timeouts may stop keeping the process alive; reconciliation must finish.
const sleep = (ms: number, { ref = true }: { ref?: boolean } = {}): Promise<void> => new Promise(resolve => {
  const timer = setTimeout(resolve, ms)
  if (!ref) timer.unref()
})

function remoteUrl(): string {
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

export function main(argv = process.argv.slice(2), beforeCreate?: Io['beforeCreate']): Promise<number> {
  return run(argv, {
    env: name => process.env[name],
    remoteUrl,
    readFile: path => readFileSync(path, 'utf8'),
    out: text => process.stdout.write(`${text}\n`),
    err: text => process.stderr.write(`${text}\n`),
    createProvider: ({ repo, token }) => createForgejo({ repo, token, http, sleep, timeoutMs: HTTP_TIMEOUT_MS }),
    beforeCreate,
  })
}

if (process.argv[1] && existsSync(process.argv[1]) && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  process.exitCode = await main()
}
