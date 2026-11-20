import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { CliError, EXIT } from './errors.mts'

export type PlaywrightModule = typeof import('playwright-core')

export const jiraHome = (env: NodeJS.ProcessEnv): string => env.JIRA_HOME ?? join(homedir(), '.config', 'ai-dev-kit', 'jira')

const hostDir = (home: string, host: string): string => join(home, host.replace(/[^A-Za-z0-9.-]/g, '_'))

export const profilePath = (home: string, host: string): string => join(hostDir(home, host), 'profile')

export const lockPath = (home: string, host: string): string => join(hostDir(home, host), 'lock')

function isAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function acquire(path: string): void {
  mkdirSync(dirname(path), { recursive: true })
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(path, String(process.pid), { flag: 'wx' })
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const pid = Number(readFileSync(path, 'utf8'))
      if (isAlive(pid)) throw new CliError(`Профиль Jira занят другим процессом (PID ${pid}): дождитесь его завершения.`, EXIT.LOCKED)
      rmSync(path, { force: true })
    }
  }
  throw new CliError('Не удалось захватить профиль Jira.', EXIT.LOCKED)
}

export async function withLock<T>(home: string, host: string, action: () => Promise<T>): Promise<T> {
  const path = lockPath(home, host)
  acquire(path)
  try {
    return await action()
  } finally {
    rmSync(path, { force: true })
  }
}

const hasPlaywright = (dir: string): boolean => existsSync(join(dir, 'node_modules', 'playwright-core', 'package.json'))

export function ensurePlaywright(dir: string, install: (dir: string) => void): void {
  if (hasPlaywright(dir)) return
  mkdirSync(dir, { recursive: true })
  install(dir)
}

export const PLAYWRIGHT_VERSION = '1.55.0'

export const npmInstallArgs = (dir: string): string[] => ['install', '--prefix', dir, `playwright-core@${PLAYWRIGHT_VERSION}`, '--no-audit', '--no-fund']

export function npmInstall(dir: string): void {
  execFileSync('npm', npmInstallArgs(dir), { stdio: ['ignore', 2, 2] })
}

export function loadPlaywright(dir: string): PlaywrightModule {
  if (!hasPlaywright(dir)) throw new CliError('playwright-core не установлен: выполните jira login.', EXIT.LOGIN)
  return createRequire(join(dir, 'noop.js'))('playwright-core')
}
