export interface ParsedArgs {
  positional: string[]
  noTracker: boolean
  text: boolean
  command?: string
  task?: string
  reason?: string
  stepDir?: string
  draft?: string
}

// TODO: неизвестные флаги и лишние позиционные аргументы не отклоняются, а `--task` без значения не задаёт задачу; ужесточить вместе с тест-кейсами, добавленными в тест-план.
export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { positional: [], noTracker: false, text: false }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--no-tracker') parsed.noTracker = true
    else if (arg === '--text') parsed.text = true
    else if (arg === '--task') parsed.task = argv[++index]
    else if (arg === '--reason') parsed.reason = argv[++index]
    else if (arg === '--step-dir') parsed.stepDir = argv[++index]
    else if (arg === '--draft') parsed.draft = argv[++index]
    else if (parsed.command === undefined) parsed.command = arg
    else parsed.positional.push(arg)
  }

  return parsed
}
