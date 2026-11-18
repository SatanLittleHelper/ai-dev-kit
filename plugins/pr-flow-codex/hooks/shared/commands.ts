export type PrCreate = {
  kind: 'gh' | 'curl'
  base?: string
  body?: string
  json?: string
  file?: string
}

const PR_REQUESTS = [
  /(?<![\p{L}])(сделай|создай|открой|оформи|подготовь)\s+(мне\s+|нам\s+)?(пр|pr|pull\s*request|пулл?-?реквест)(?![\p{L}])/iu,
  /(?<![\p{L}])(open|create|make)\s+(a\s+)?(pr|pull\s*request)(?![\p{L}])/iu,
]
const GIT_COMMIT = /(?:^|[;&|(]\s*)git\s+(?:-[Cc]\s+\S+\s+)*commit(?![\w-])/
const GH_PR_CREATE = /(?:^|[;&|(]\s*)gh\s+pr\s+create(?![\w-])/
const FORGEJO_PULLS = /\/api\/v1\/repos\/[^/\s'"]+\/[^/\s'"]+\/pulls(?:[?'"\s]|$)/
const CURL_DATA = /(?:^|\s)(?:-d|--data(?:-raw|-binary)?)\s+("[^"]*"|'[^']*'|\S+)/
const CURL_POST = /(?:^|\s)(?:-X|--request)\s+POST(?![\w-])/i
const DYNAMIC = /\$\(|`/

const unquote = (value: string): string => value.replace(/^(["'])([\s\S]*)\1$/, '$2')

function flag(command: string, names: readonly string[]): string | undefined {
  for (const name of names) {
    const match = new RegExp(`(?:^|\\s)${name}(?:\\s+|=)("[^"]*"|'[^']*'|\\S+)`).exec(command)

    if (match?.[1] !== undefined) {
      return unquote(match[1])
    }
  }

  return undefined
}

export const wantsPr = (text: string): boolean => PR_REQUESTS.some(pattern => pattern.test(text))

export const isGitCommit = (command: string): boolean => GIT_COMMIT.test(command)

export function detectPrCreate(command: string): PrCreate | undefined {
  if (GH_PR_CREATE.test(command)) {
    const body = flag(command, ['--body', '-b'])

    return {
      kind: 'gh',
      base: flag(command, ['--base', '-B']),
      file: flag(command, ['--body-file', '-F']),
      body: body !== undefined && !DYNAMIC.test(body) ? body : undefined,
    }
  }

  const data = CURL_DATA.exec(command)?.[1]

  if (/\bcurl\b/.test(command) && FORGEJO_PULLS.test(command) && (CURL_POST.test(command) || data !== undefined)) {
    const value = data === undefined ? undefined : unquote(data)

    return {
      kind: 'curl',
      file: value?.startsWith('@') ? value.slice(1) : undefined,
      json: value !== undefined && !value.startsWith('@') ? value : undefined,
    }
  }

  return undefined
}

export function extractPr(json: string): { body?: string; base?: string } {
  try {
    const parsed: unknown = JSON.parse(json)

    if (typeof parsed !== 'object' || parsed === null) {
      return {}
    }

    const { body, base } = parsed as { body?: unknown; base?: unknown }

    return {
      body: typeof body === 'string' ? body : undefined,
      base: typeof base === 'string' ? base : undefined,
    }
  } catch {
    return {}
  }
}
