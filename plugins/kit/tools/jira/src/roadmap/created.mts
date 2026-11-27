import { CliError, EXIT } from '../errors.mts'
import { isIssueKey } from '../issue-key.mts'

interface Link {
  key: string
  url: string
}

export interface Created {
  story: Link | null
  children: Record<string, Link>
  unknown: string | null
}

export const emptyCreated = (): Created => ({ story: null, children: {}, unknown: null })

export const createdPath = (tickets: string): string => `${tickets.replace(/\.md$/, '')}.created.json`

export function loadCreated(path: string, readFile: (path: string) => string): Created {
  let raw: string
  try {
    raw = readFile(path)
  } catch {
    return emptyCreated()
  }
  try {
    const json = JSON.parse(raw) as Partial<Created>
    return { story: json.story ?? null, children: json.children ?? {}, unknown: json.unknown ?? null }
  } catch {
    throw new CliError(`${path} — невалидный JSON.`, EXIT.FAILURE)
  }
}

export function saveCreated(path: string, created: Created, writeFile: (path: string, content: string) => void): void {
  writeFile(path, `${JSON.stringify(created, null, 2)}\n`)
}

// --resolve <id>=<KEY> (тикет был создан) или <id>=retry (создать заново) — только для тикета в неизвестном состоянии.
export function applyResolve(created: Created, resolves: string[], urlOf: (key: string) => string): Created {
  const next: Created = { story: created.story, children: { ...created.children }, unknown: created.unknown }
  for (const entry of resolves) {
    const [id, value] = entry.split('=')
    if (!id || !value) throw new CliError(`--resolve ожидает <id>=<KEY> или <id>=retry, получено «${entry}».`, EXIT.FAILURE)
    if (next.unknown !== id) throw new CliError(`Тикет «${id}» не в неизвестном состоянии${next.unknown ? ` (неизвестен «${next.unknown}»)` : ''}.`, EXIT.FAILURE)
    if (value !== 'retry') {
      if (!isIssueKey(value)) throw new CliError(`«${value}» не похоже на ключ Jira (ABC-123).`, EXIT.FAILURE)
      if (id === 'story') next.story = { key: value, url: urlOf(value) }
      else next.children[id] = { key: value, url: urlOf(value) }
    }
    next.unknown = null
  }
  return next
}
