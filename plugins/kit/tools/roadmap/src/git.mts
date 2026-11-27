import { execFileSync } from 'node:child_process'

export function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

export function tryGit(root: string, ...args: string[]): string | null {
  try {
    return git(root, ...args)
  } catch {
    return null
  }
}

export function defaultBranch(root: string): string | null {
  const ref = tryGit(root, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD')
  return ref ? ref.replace(/^origin\//, '') : null
}

export function showFile(root: string, ref: string, path: string): string | null {
  try {
    return execFileSync('git', ['show', `${ref}:${path}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return null
  }
}

export function listFiles(root: string, ref: string, dir: string): string[] {
  const out = tryGit(root, 'ls-tree', '-r', '--name-only', ref, `${dir}/`)
  return out ? out.split('\n').filter(Boolean) : []
}
