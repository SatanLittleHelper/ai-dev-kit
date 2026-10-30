export const LEVELS = ['Лёгкие', 'Средние', 'Серьёзные', 'Критичные'] as const
export type Level = (typeof LEVELS)[number]

export type ChangedFile = { status: string; path: string }
export type Severity = { level: Level; reason: string }
export type DiffInput = {
  files: readonly ChangedFile[]
  migrationDiff: string
  packageDiff: string
}

export const MIGRATION_PATH = /(^|\/)(migrations?|db\/migrate)\//i

// Документация, тесты и стили: правка по таким путям не поднимает уровень по имени пути.
const LIGHT_PATH = /(\.mdx?$|(^|\/)docs\/|\.(spec|test)\.[cm]?[jt]sx?$|\.(s?css|less)$)/
const CRITICAL_PATH = /(^|[/_.-])(payments?|billing|crypto|secrets?)([/_.-]|$)/i
const DESTRUCTIVE_SQL = /^\+.*\b(DROP\s+(TABLE|COLUMN)|TRUNCATE)\b/im
const SERIOUS_PATHS: readonly (readonly [RegExp, string])[] = [
  [MIGRATION_PATH, 'миграция схемы БД'],
  [/(^|[/_.-])(auth|authz|authn|authorization|guards?|permissions?|roles?)([/_.-]|$)/i, 'авторизация, роли или права'],
  [/^\.(github|forgejo|gitea)\//, 'CI'],
  [/(^|\/)(Dockerfile[^/]*|docker-compose[^/]*\.ya?ml)$/, 'инфраструктура'],
  [/(^|\/)\.env/, 'переменные окружения'],
  [/(^|\/)([^/]*\.config\.[cm]?[jt]s|tsconfig[^/]*\.json)$/, 'конфигурация'],
]
const VERSION_LINE = /^([-+])\s*"([^"]+)":\s*"[\^~>=<\s]*(\d+)\./

// Имя первой зависимости, у которой в диффе package.json сменился major; поле `version` самого пакета не считается.
export function hasMajorBump(packageDiff: string): string | undefined {
  const removed = new Map<string, string>()
  const added = new Map<string, string>()

  for (const line of packageDiff.split('\n')) {
    const match = VERSION_LINE.exec(line)

    if (match && match[2] !== 'version') {
      ;(match[1] === '-' ? removed : added).set(match[2] ?? '', match[3] ?? '')
    }
  }

  return [...added].find(([name, major]) => removed.has(name) && removed.get(name) !== major)?.[0]
}

export function classify({ files, migrationDiff, packageDiff }: DiffInput): Severity {
  if (files.length === 0) {
    return { level: 'Лёгкие', reason: 'нет изменений' }
  }

  const live = files.filter(file => !LIGHT_PATH.test(file.path))

  if (DESTRUCTIVE_SQL.test(migrationDiff)) {
    return { level: 'Критичные', reason: 'деструктивная миграция (DROP или TRUNCATE)' }
  }

  const critical = live.find(file => CRITICAL_PATH.test(file.path))

  if (critical) {
    return { level: 'Критичные', reason: `платежи, безопасность или секреты: ${critical.path}` }
  }

  for (const file of live) {
    for (const [pattern, label] of SERIOUS_PATHS) {
      if (pattern.test(file.path)) {
        return { level: 'Серьёзные', reason: `${label}: ${file.path}` }
      }
    }
  }

  const removed = live.find(file => file.status === 'D')

  if (removed) {
    return { level: 'Серьёзные', reason: `удален файл ${removed.path}` }
  }

  const bumped = hasMajorBump(packageDiff)

  if (bumped) {
    return { level: 'Серьёзные', reason: `major-обновление зависимости ${bumped}` }
  }

  if (files.every(file => LIGHT_PATH.test(file.path) || file.status === 'R100')) {
    return { level: 'Лёгкие', reason: 'документация, тесты, стили или переименования' }
  }

  return { level: 'Средние', reason: 'изменение исходников' }
}
