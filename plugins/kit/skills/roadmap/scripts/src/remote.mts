import type { Repo } from './types.mts'

const FOREIGN_HOSTS = ['github.com', 'gitlab.com', 'bitbucket.org']

export function parseRemote(url: string): Repo | null {
  const full = /^([a-z+]+):\/\/(?:[^@/]+@)?([^/:]+)(:\d+)?\/(.+)$/i.exec(url.trim())
  const scp = /^[^@\s/]+@([^:\s/]+):(.+)$/.exec(url.trim())
  const web = full && /^https?$/i.test(full[1]) ? full[1].toLowerCase() : undefined
  const host = full ? `${full[2]}${web ? full[3] ?? '' : ''}` : scp?.[1]
  const path = full ? full[4] : scp?.[2]
  if (!host || !path) return null
  const parts = path.replace(/\/+$/, '').replace(/\.git$/, '').split('/').filter(Boolean)
  if (parts.length < 2) return null
  return { host, owner: parts[parts.length - 2], repo: parts[parts.length - 1], ...(web === 'http' ? { scheme: 'http' as const } : {}) }
}

export function detect(remoteUrl: string): Repo | null {
  const repo = parseRemote(remoteUrl)
  return repo && !FOREIGN_HOSTS.includes(repo.host.split(':')[0].toLowerCase()) ? repo : null
}
