export interface LintError {
  rule: string
  line: number
  message: string
}

export type ParsedDraft =
  | { ok: true; title: string; body: string; titleLine: number; bodyLine: number }
  | { ok: false; errors: LintError[] }

interface Block {
  start: number
  lines: string[]
}

// Черновик задачи — ровно два fenced-блока (название, тело) и больше ничего.
export function parseDraft(markdown: string): ParsedDraft {
  const blocks: Block[] = []
  const errors: LintError[] = []
  let open: Block | undefined
  for (const [index, line] of markdown.replace(/\r\n/g, '\n').split('\n').entries()) {
    const number = index + 1
    if (!open && line.startsWith('```')) {
      open = { start: number + 1, lines: [] }
    } else if (open && /^```\s*$/.test(line)) {
      blocks.push(open)
      open = undefined
    } else if (open) {
      open.lines.push(line)
    } else if (line.trim()) {
      errors.push({ rule: 'outside-block', line: number, message: 'Текст вне fenced-блоков: в черновике только название и тело.' })
    }
  }
  if (open) errors.push({ rule: 'unclosed-block', line: open.start - 1, message: 'Fenced-блок не закрыт.' })
  if (blocks.length !== 2) {
    errors.push({ rule: 'block-count', line: 1, message: `Нужно ровно два fenced-блока (название и тело), найдено ${blocks.length}.` })
  }
  if (errors.length > 0) return { ok: false, errors }
  const [title, body] = blocks
  return {
    ok: true,
    title: title.lines.join('\n').trim(),
    body: body.lines.join('\n').trimEnd().replace(/^\n+/, ''),
    titleLine: title.start,
    bodyLine: body.start,
  }
}
