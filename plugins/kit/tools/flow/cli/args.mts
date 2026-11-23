export interface ParsedArgs {
  positional: string[]
  noTracker: boolean
  text: boolean
  confirmJira?: boolean
  noDryRun?: boolean
  command?: string
  task?: string
  reason?: string
  stepDir?: string
  draft?: string
  timeout?: string
  error?: string
}

const VALUE_FLAGS = { '--task': 'task', '--reason': 'reason', '--step-dir': 'stepDir', '--draft': 'draft', '--timeout': 'timeout' } as const

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { positional: [], noTracker: false, text: false }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--no-tracker') parsed.noTracker = true
    else if (arg === '--text') parsed.text = true
    else if (arg === '--confirm-jira') parsed.confirmJira = true
    else if (arg === '--no-dry-run') parsed.noDryRun = true
    else if (Object.hasOwn(VALUE_FLAGS, arg)) {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) return { ...parsed, error: `Флаг ${arg} требует значение.` }

      parsed[VALUE_FLAGS[arg as keyof typeof VALUE_FLAGS]] = value
      index += 1
    } else if (arg.startsWith('--')) return { ...parsed, error: `Неизвестный флаг ${arg}.` }
    else if (parsed.command === undefined) parsed.command = arg
    else parsed.positional.push(arg)
  }

  return parsed
}
