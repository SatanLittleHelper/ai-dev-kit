import { CliError, EXIT } from '../errors.mts'
import { parseDraft } from './split.mts'
import type { LintError } from './split.mts'

const SECTIONS = ['Контекст', 'Проблема', 'Решение', 'Критерии приемки', 'Дополнительно']
const REQUIRED = ['Контекст', 'Проблема', 'Критерии приемки']
const LIMITS: Record<string, { min: number; max: number }> = {
  Проблема: { min: 0, max: 3 },
  Решение: { min: 0, max: 3 },
  'Критерии приемки': { min: 3, max: 5 },
}
const CODE_FENCE = /\{(?:code|noformat)(?::[^}]*)?\}/g
const BULLET = /^\*+\s/

interface Section {
  name: string
  line: number
  lines: string[]
}

const splitLines = (text: string): string[] => text.replace(/\r\n/g, '\n').split('\n')

// Правила разметки Jira Wiki Markup, общие для задачи, комментария и правки. Содержимое {code}/{noformat} не проверяется.
export function lintMarkup(text: string, firstLine = 1): LintError[] {
  const errors: LintError[] = []
  let inCode = false
  for (const [index, line] of splitLines(text).entries()) {
    const number = firstLine + index
    const fences = line.match(CODE_FENCE)?.length ?? 0
    if (inCode || fences > 0) {
      if (fences % 2 === 1) inCode = !inCode
      continue
    }
    if (/^h2\./.test(line)) errors.push({ rule: 'heading-h2', line: number, message: 'Заголовок h2. не используется: тело начинается с h3.' })
    if (/^\s*-\s+/.test(line)) errors.push({ rule: 'bullet-marker', line: number, message: 'Маркер списка — «*», а не «-».' })
    for (const match of line.matchAll(/\{\{(.*?)\}\}/g)) {
      if (!/^[\p{L}\p{N}_()]+$/u.test(match[1])) {
        errors.push({ rule: 'inline-code', line: number, message: `В {{${match[1]}}} точки, двоеточия, пробелы и <> Jira не отрисует: запишите простым текстом.` })
      }
    }
    if (/\}\}\s*$/.test(line)) errors.push({ rule: 'inline-code-line-end', line: number, message: 'Строка не должна заканчиваться на {{...}}: добавьте слово или знак препинания.' })
  }
  return errors
}

export function lintTitle(title: string, line = 1): LintError[] {
  const value = title.trim()
  if (!value) return [{ rule: 'title-empty', line, message: 'Название пустое.' }]
  const errors: LintError[] = []
  if (value.includes('\n')) errors.push({ rule: 'title-lines', line, message: 'Название — одна строка.' })
  if (/^h\d\./.test(value)) errors.push({ rule: 'title-heading', line, message: 'В названии нет заголовочной разметки h2./h3.' })
  const prefixes = value.match(/^(?:\[[^\]]+\]\s*)+/)?.[0].match(/\[/g)?.length ?? 0
  if (prefixes > 2) errors.push({ rule: 'title-prefixes', line, message: `Контекстных префиксов [..] ${prefixes}, допустимо не больше двух.` })
  return errors
}

function lintContext(section: Section, errors: LintError[]): void {
  const text = section.lines.join(' ').trim()
  if (!text) {
    errors.push({ rule: 'context-empty', line: section.line, message: '«Контекст» пуст.' })
  } else if (section.lines.some(line => BULLET.test(line))) {
    errors.push({ rule: 'context-bullets', line: section.line, message: '«Контекст» — одно предложение, а не список.' })
  } else if (/[.!?…](?=\s+[A-ZА-ЯЁ])/.test(text)) {
    errors.push({ rule: 'context-sentences', line: section.line, message: '«Контекст» — одно предложение: зачем задача нужна сейчас.' })
  }
}

// Структура тела задачи: секции, порядок, лимиты пунктов. Содержательные правила (краткость, причина вместо симптома) остаются за агентом.
export function lintIssueBody(body: string, firstLine = 1): LintError[] {
  const errors = lintMarkup(body, firstLine)
  const sections: Section[] = []
  for (const [index, line] of splitLines(body).entries()) {
    const number = firstLine + index
    const heading = line.match(/^h3\.\s*(.+?)\s*$/)
    if (heading) sections.push({ name: heading[1], line: number, lines: [] })
    else if (sections.length > 0) sections[sections.length - 1].lines.push(line)
    else if (line.trim()) errors.push({ rule: 'before-first-section', line: number, message: 'Тело начинается с «h3. Контекст».' })
  }
  let previous = -1
  for (const section of sections) {
    const position = SECTIONS.indexOf(section.name)
    if (position < 0) {
      errors.push({ rule: 'section-name', line: section.line, message: `Неизвестная секция «${section.name}»; допустимы: ${SECTIONS.join(', ')}.` })
      continue
    }
    if (position <= previous) errors.push({ rule: 'section-order', line: section.line, message: `Секция «${section.name}» не на своём месте или повторена; порядок: ${SECTIONS.join(', ')}.` })
    previous = Math.max(previous, position)
  }
  for (const name of REQUIRED) {
    if (!sections.some(section => section.name === name)) errors.push({ rule: 'section-missing', line: firstLine, message: `Нет секции «h3. ${name}».` })
  }
  for (const section of sections) {
    const limit = LIMITS[section.name]
    const bullets = section.lines.filter(line => BULLET.test(line)).length
    if (limit && (bullets < limit.min || bullets > limit.max)) {
      errors.push({ rule: 'bullet-limit', line: section.line, message: `В «${section.name}» пунктов: ${bullets}, допустимо ${limit.min}–${limit.max}.` })
    }
    if (section.name === 'Контекст') lintContext(section, errors)
  }
  return errors.sort((a, b) => a.line - b.line)
}

// Черновик целиком: два fenced-блока, название, тело. Номера строк — по файлу черновика.
export function lintIssueDraft(markdown: string): LintError[] {
  const parsed = parseDraft(markdown)
  if (!parsed.ok) return parsed.errors
  return [...lintTitle(parsed.title, parsed.titleLine), ...lintIssueBody(parsed.body, parsed.bodyLine)]
}

export const formatErrors = (errors: LintError[]): string => errors.map(error => `строка ${error.line} [${error.rule}]: ${error.message}`).join('\n')

export function assertNoLintErrors(errors: LintError[], what: string): void {
  if (errors.length > 0) throw new CliError(`${what}: проверка разметки не пройдена.\n${formatErrors(errors)}`, EXIT.FAILURE)
}
