import { detect } from './remote.mts'
import type { Repo } from './types.mts'

export const TOKEN_ENV = ['FORGEJO_TOKEN', 'GITEA_TOKEN'] as const

export interface RepoFlags {
  host?: string
  owner?: string
  repo?: string
}

export interface Config {
  repo: Repo
  token: string
}

export function resolveConfig({ flags, env, remoteUrl }: { flags: RepoFlags; env: (name: string) => string | undefined; remoteUrl: string }): Config {
  const fromFlags = flags.host && flags.owner && flags.repo ? { host: flags.host, owner: flags.owner, repo: flags.repo } : null
  const repo = fromFlags ?? detect(remoteUrl)
  if (!repo) throw new Error(`Remote «${remoteUrl}» не похож на Forgejo/Gitea: укажите --host, --owner и --repo.`)
  const token = TOKEN_ENV.map(name => env(name)).find(value => value?.trim())
  if (!token) throw new Error(`Нет токена Forgejo/Gitea: задайте переменную ${TOKEN_ENV.join(' или ')} в окружении терминала.`)
  return { repo, token: token.trim() }
}
