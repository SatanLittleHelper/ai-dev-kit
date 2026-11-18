import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createForgejo } from '../src/provider.mts'
import type { Http } from '../src/types.mts'
import { run } from './run.mts'

const HTTP_TIMEOUT_MS = 30_000

const http: Http = async (url, init) => {
  const response = await fetch(url, init)
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

process.exitCode = await run(process.argv.slice(2), {
  env: name => process.env[name],
  remoteUrl,
  readFile: path => readFileSync(path, 'utf8'),
  out: text => process.stdout.write(`${text}\n`),
  err: text => process.stderr.write(`${text}\n`),
  createProvider: ({ repo, token }) => createForgejo({ repo, token, http, sleep, timeoutMs: HTTP_TIMEOUT_MS }),
})
