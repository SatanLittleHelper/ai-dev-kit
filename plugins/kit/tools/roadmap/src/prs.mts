import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { tryGit } from './git.mts'

export interface PrInfo { number: number; title: string; headRef: string; baseRef: string; url: string; files: string[] }
export type PrResult = { ok: true; prs: PrInfo[] } | { ok: false; reason: string }

export const hostKind = (remote: string): 'github' | 'forgejo' => (/(^|[@/])github\.com[:/]/.test(remote) ? 'github' : 'forgejo')

export function parseGhPrs(json: string): PrInfo[] {
  return (JSON.parse(json) as { number: number; title: string; headRefName: string; baseRefName: string; url: string; files: { path: string }[] }[]).map(pr => ({
    number: pr.number, title: pr.title, headRef: pr.headRefName, baseRef: pr.baseRefName, url: pr.url, files: pr.files.map(file => file.path),
  }))
}

const reason = (error: unknown): string => (error instanceof Error ? error.message.split('\n')[0] : String(error))

export function listOpenPrs(root: string, env: NodeJS.ProcessEnv): PrResult {
  const remote = tryGit(root, 'remote', 'get-url', 'origin') ?? ''
  try {
    if (hostKind(remote) === 'github') {
      const out = execFileSync(env.ROADMAP_GH ?? 'gh', ['pr', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,headRefName,baseRefName,url,files'], { cwd: root, encoding: 'utf8', env })
      return { ok: true, prs: parseGhPrs(out) }
    }
    if (!(env.FORGEJO_TOKEN || env.GITEA_TOKEN)) return { ok: false, reason: 'не задан FORGEJO_TOKEN (или GITEA_TOKEN) в окружении терминала' }
    const cli = env.ROADMAP_FORGEJO_CLI ?? fileURLToPath(new URL('../../forgejo/cli/main.mts', import.meta.url))
    const call = (...args: string[]): string => execFileSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', env })
    const list = JSON.parse(call('pr', 'list')) as { number: number; title: string; headRef: string; baseRef: string; url: string }[]
    return { ok: true, prs: list.map(pr => ({ ...pr, files: JSON.parse(call('pr', 'files', String(pr.number))) as string[] })) }
  } catch (error) {
    return { ok: false, reason: `API недоступен: ${reason(error)}` }
  }
}
