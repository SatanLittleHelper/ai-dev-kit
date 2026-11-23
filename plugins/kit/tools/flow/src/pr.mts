import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export interface PrInfo {
  state: 'open' | 'closed'
  merged: boolean
  headRef: string
  fromFork: boolean
  url: string
}

export type PrLookup = (root: string, number: number) => PrInfo | { error: string }

const PR_URL = /^https:\/\/[^/\s]+\/[^/\s]+\/[^/\s]+\/pulls?\/(\d+)\/?$/

const FORGEJO_CLI = fileURLToPath(new URL('../../forgejo/cli/main.mts', import.meta.url))

// Канонический вид ссылки для сравнения: без хвостового слеша, «pull» и «pulls» равны.
export const canonicalPrUrl = (value: string): string => value.trim().replace(/\/+$/, '').replace(/\/pulls?\//, '/pulls/')

export function parsePrUrl(value: string): number | null {
  const match = PR_URL.exec(value.trim())
  return match ? Number(match[1]) : null
}

export const lookupPr: PrLookup = (root, number) => {
  const run = spawnSync(process.execPath, [FORGEJO_CLI, 'pr', 'get', String(number)], { cwd: root, encoding: 'utf8', timeout: 60_000 })
  if (run.error || run.status !== 0) return { error: (run.error?.message ?? run.stderr.trim()) || `forgejo CLI завершился с кодом ${run.status}` }

  try {
    const pull = JSON.parse(run.stdout) as { state?: unknown; merged?: unknown; headRef?: unknown; fromFork?: unknown; url?: unknown }
    if ((pull.state !== 'open' && pull.state !== 'closed') || typeof pull.headRef !== 'string' || typeof pull.fromFork !== 'boolean') return { error: 'forgejo CLI вернул неполные данные PR.' }
    return { state: pull.state, merged: pull.merged === true, headRef: pull.headRef, fromFork: pull.fromFork, url: typeof pull.url === 'string' ? pull.url : '' }
  } catch {
    return { error: 'forgejo CLI вернул некорректный JSON.' }
  }
}

export function currentBranch(root: string): string {
  try {
    return execFileSync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}
