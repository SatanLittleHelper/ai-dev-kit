export interface ParsedArgs {
  command?: string
  positional: string[]
  flags: Record<string, string>
  text: boolean
  error?: string
}

const SWITCHES = ['--text']

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { positional: [], flags: {}, text: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (SWITCHES.includes(arg)) parsed.text = true
    else if (arg.startsWith('--')) {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) return { ...parsed, error: `Флаг ${arg} требует значение.` }
      parsed.flags[arg.slice(2)] = value
      index += 1
    } else if (parsed.command === undefined) parsed.command = arg
    else parsed.positional.push(arg)
  }
  return parsed
}
