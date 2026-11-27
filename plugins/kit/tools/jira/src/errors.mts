export const EXIT = { FAILURE: 1, LOGIN: 2, NOT_FOUND: 3, LOCKED: 4, UNKNOWN: 5 } as const

export const firstLine = (error: unknown): string => error instanceof Error ? error.message.split('\n')[0] : String(error)

export class CliError extends Error {
  code: number

  constructor(message: string, code: number) {
    super(message)
    this.name = 'CliError'
    this.code = code
  }
}

export const unknownState = (reason: string): CliError => new CliError(`${reason} Состояние неизвестно, проверьте Jira.`, EXIT.UNKNOWN)
