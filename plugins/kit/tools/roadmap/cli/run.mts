import { blocked, exitCode, renderText } from '../src/responses.mts'
import type { Response } from '../src/responses.mts'
import { parseArgs } from './args.mts'
import type { ParsedArgs } from './args.mts'

export interface Io {
  cwd: string
  env: NodeJS.ProcessEnv
  out(text: string): void
}

// Диспетчер: команды подключаются по мере появления в следующих задачах.
const COMMANDS: Record<string, (args: ParsedArgs, io: Io) => Response> = {}

export function run(argv: string[], io: Io): number {
  const args = parseArgs(argv)
  const handler = args.command ? COMMANDS[args.command] : undefined
  let response: Response
  try {
    response = args.error ? blocked(args.error) : handler ? handler(args, io) : blocked(`Неизвестная команда «${args.command ?? ''}». Доступны: ${Object.keys(COMMANDS).join(', ') || '—'}.`)
  } catch (error) {
    response = blocked(error instanceof Error ? error.message : String(error))
  }
  io.out(args.text ? renderText(response) : JSON.stringify(response))
  return exitCode(response)
}

export function register(name: string, handler: (args: ParsedArgs, io: Io) => Response): void {
  COMMANDS[name] = handler
}
