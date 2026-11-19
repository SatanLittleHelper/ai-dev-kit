import type { PullDraft, Reply, ReviewDraft, Verdict } from '../src/types.mts'

const VERDICTS: readonly string[] = ['approve', 'request-changes', 'comment']
const INPUT_ERROR_CODE = 2

export class CliError extends Error {
  code: number
  constructor(message: string, code: number) {
    super(message)
    this.code = code
  }
}

function fail(message: string): never {
  throw new CliError(message, INPUT_ERROR_CODE)
}

function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text)
  } catch (error) {
    return fail(`${what}: не JSON (${(error as Error).message})`)
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parsePullDraft(text: string): PullDraft {
  const raw = parseJson(text, 'черновик PR')
  if (!isObject(raw)) return fail('черновик PR: нужен объект')
  const { base, head, title, body } = raw
  if (typeof base !== 'string' || !base.trim()) return fail('черновик PR: нужен непустой base')
  if (typeof head !== 'string' || !head.trim()) return fail('черновик PR: нужен непустой head')
  if (typeof title !== 'string' || !title.trim()) return fail('черновик PR: нужен непустой title')
  if (typeof body !== 'string') return fail('черновик PR: body должен быть строкой')
  return { base, head, title, body }
}

export function parseDraft(text: string): ReviewDraft {
  const raw = parseJson(text, 'черновик ревью')
  if (!isObject(raw)) return fail('черновик ревью: нужен объект')
  if (typeof raw.verdict !== 'string' || !VERDICTS.includes(raw.verdict)) return fail(`черновик ревью: поле verdict должно быть ${VERDICTS.join(' | ')}`)
  if (typeof raw.body !== 'string') return fail('черновик ревью: поле body должно быть строкой')
  const items = raw.comments === undefined ? [] : raw.comments
  if (!Array.isArray(items)) return fail('черновик ревью: поле comments должно быть массивом')
  const comments = items.map((item, index) => {
    if (!isObject(item) || typeof item.path !== 'string' || item.path === '') return fail(`черновик ревью: comments[${index}].path должен быть непустой строкой`)
    if (typeof item.line !== 'number' || !Number.isInteger(item.line)) return fail(`черновик ревью: comments[${index}].line должен быть целым числом`)
    if (typeof item.body !== 'string') return fail(`черновик ревью: comments[${index}].body должен быть строкой`)
    return { path: item.path, line: item.line, body: item.body }
  })
  return { verdict: raw.verdict as Verdict, body: raw.body, comments }
}

export function parseReplies(text: string): Reply[] {
  const raw = parseJson(text, 'ответы')
  if (!Array.isArray(raw)) return fail('ответы: нужен массив')
  if (raw.length === 0) return fail('ответы: массив пуст')
  return raw.map((item, index) => {
    if (!isObject(item) || typeof item.body !== 'string' || item.body === '') return fail(`ответы: [${index}].body должен быть непустой строкой`)
    if (item.threadId !== undefined && typeof item.threadId !== 'string') return fail(`ответы: [${index}].threadId должен быть строкой`)
    if (item.quote !== undefined && typeof item.quote !== 'string') return fail(`ответы: [${index}].quote должен быть строкой`)
    return { body: item.body, ...(item.threadId === undefined ? {} : { threadId: item.threadId }), ...(item.quote === undefined ? {} : { quote: item.quote }) }
  })
}
