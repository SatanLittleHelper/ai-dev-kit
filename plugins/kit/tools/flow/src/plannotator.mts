export function plannotatorCommand(draft: string, resultFile: string): { command: string; args: string[]; env: Record<string, string> } {
  return { command: 'plannotator', args: ['annotate', draft, '--gate', '--json', '--result-file', resultFile], env: { PLANNOTATOR_ANNOTATE_HISTORY: '1' } }
}

export type Decision =
  | { kind: 'approved'; feedback?: string }
  | { kind: 'dismissed' }
  | { kind: 'annotated'; feedback: string; annotationCount?: number }
  | { kind: 'nothing-to-send' }
  | { kind: 'invalid'; error?: string }

const NO_FEEDBACK = /^\s*(?:the )?user reviewed the document and has no feedback[.!]?\s*$/i

export function parseDecision(raw: string): Decision {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { kind: 'invalid' }
  }

  if (!json || typeof json !== 'object') return { kind: 'invalid' }

  const { error, decision, feedback, annotationCount, nothingToSend } = json as Record<string, unknown>
  if (typeof error === 'string') return { kind: 'invalid', error }
  const text = typeof feedback === 'string' ? feedback : ''
  if (decision === 'approved') return { kind: 'approved', ...(text ? { feedback: text } : {}) }
  if (decision === 'dismissed') return { kind: 'dismissed' }
  if (nothingToSend === true || NO_FEEDBACK.test(text)) return { kind: 'nothing-to-send' }
  if (decision === 'annotated') {
    return { kind: 'annotated', feedback: text, ...(typeof annotationCount === 'number' ? { annotationCount } : {}) }
  }

  return { kind: 'invalid' }
}
