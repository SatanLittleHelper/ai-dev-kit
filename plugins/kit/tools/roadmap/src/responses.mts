export type Response =
  | ({ result: 'ok' } & Record<string, unknown>)
  | ({ result: 'blocked'; reason: string } & Record<string, unknown>)
  | { result: 'needs-input'; question: string; options: string[] }

export const ok = (data: Record<string, unknown> = {}): Response => ({ result: 'ok', ...data })
export const blocked = (reason: string, extra: Record<string, unknown> = {}): Response => ({ result: 'blocked', reason, ...extra })
export const needsInput = (question: string, options: string[] = []): Response => ({ result: 'needs-input', question, options })

export const exitCode = (response: Response): number => (response.result === 'ok' ? 0 : response.result === 'blocked' ? 1 : 2)

export function renderText(response: Response): string {
  if (response.result === 'blocked') return `Отказ: ${response.reason}`
  if (response.result === 'needs-input') return [response.question, ...response.options.map((option, index) => `${index + 1}. ${option}`)].join('\n')
  return JSON.stringify(response, null, 2)
}
