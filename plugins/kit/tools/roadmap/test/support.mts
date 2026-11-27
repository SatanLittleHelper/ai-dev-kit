import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CLI = fileURLToPath(new URL('../cli/main.mts', import.meta.url))

export const ROADMAP = `# Роадмап: Пример

## Контекст

Нужно разложить большую задачу на шаги.

## Задачи

- [ ] A1 — Первый шаг (Jira: TBD) (est: 1–2д / agent: 0.5–1д)
  - Объём: сделать первое.
  - Готово, когда: первое работает.

- [ ] B1 — Второй шаг (Jira: TBD) (est: 2–3д / agent: 1–2д) (depends: A1)
  - Объём: сделать второе.
  - Готово, когда: второе работает.

## Оценка

| Показатель | Вручную | С агентом |
|---|---|---|
| Сумма по шагам | 0–0д | 0–0д |
| Критический путь (depends) | 0–0д | 0–0д |
| Осталось (незакрытые шаги) | 0–0д | 0–0д |

Допущения: день — 6 часов.
`

export const tempDir = (): string => mkdtempSync(join(tmpdir(), 'roadmap-'))

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim()
}

export function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), content)
}

// Рабочая копия с origin (bare): ветка main запушена, origin/HEAD задан.
export function makeRepo(files: Record<string, string> = {}): { work: string; origin: string } {
  const base = tempDir()
  const origin = join(base, 'origin.git')
  const work = join(base, 'work')
  git(base, 'init', '-q', '--bare', '-b', 'main', origin)
  git(base, 'clone', '-q', origin, work)
  git(work, 'checkout', '-q', '-b', 'main')
  write(work, 'README.md', 'x\n')
  for (const [path, content] of Object.entries(files)) write(work, path, content)
  git(work, 'add', '-A')
  git(work, 'commit', '-q', '-m', 'init')
  git(work, 'push', '-q', '-u', 'origin', 'main')
  git(work, 'remote', 'set-head', 'origin', 'main')
  return { work, origin }
}

export function roadmap(cwd: string, env: NodeJS.ProcessEnv, ...args: string[]): { code: number; json: any; stdout: string; stderr: string } {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } })
  let json: unknown = null
  try {
    json = JSON.parse(run.stdout)
  } catch {
    json = null
  }
  return { code: run.status ?? -1, json, stdout: run.stdout, stderr: run.stderr }
}
