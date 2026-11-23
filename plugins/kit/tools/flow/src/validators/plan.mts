import type { TestPlanMode } from '../types.mts'
import { checkRussian } from './language.mts'
import { maskFences, placeholderProblems } from './markdown.mts'
import { extractTestIds } from './test-plan.mts'

export interface PlanContext {
  testPlan: TestPlanMode
  testPlanText?: string
}

interface TaskBlock {
  number: number
  title: string
  body: string
  masked: string
}

const TASK_HEADING = /^### Task (\d+): (.*)$/gm

const DECLARATION = /^\*\*(?:Test IDs|ID тестов):\*\*[ \t]*(.+)$/m

const FORBIDDEN_STEPS = [/\bgit (add|commit)\b/, /\bgh pr create\b/, /\btea pulls? create\b/]

const RUN_BLOCK = /^Run:[ \t]*\n```(?:bash|sh|shell|zsh)[^\n]*\n([\s\S]*?)^```[ \t]*$/gm

// Исполняемые шаги плана — единый формат: строка «Run: <команда>», блок кода сразу после строки «Run:» и строки-чекбоксы вне кода.
// Прочие блоки кода (содержимое изменяемых файлов, фикстуры) не проверяются, даже если они на bash.
function executableLines(markdown: string, masked: string): string[] {
  const blocks = [...markdown.matchAll(RUN_BLOCK)].flatMap(match => match[1].split('\n'))
  const lines = masked.split('\n').filter(line => /^Run: \S/.test(line) || /^- \[[ x]\] /.test(line))

  return [...blocks, ...lines]
}

function sectionOf(masked: string, markdown: string, heading: string): string | null {
  const start = masked.search(new RegExp(`^## ${heading}\\s*$`, 'm'))
  if (start === -1) return null

  const rest = masked.slice(start + 1)
  const next = rest.search(/^## /m)

  return markdown.slice(start, next === -1 ? undefined : start + 1 + next)
}

// Секция тест-кейсов объединённого плана включает свои заголовки «## R<N> · …» и кончается на первой задаче или другом разделе.
function casesSection(masked: string, markdown: string): string | null {
  const start = masked.search(/^## Тест-кейсы\s*$/m)
  if (start === -1) return null

  const rest = masked.slice(start + 1)
  const end = rest.search(/^(### Task |## (?!R\d+ ·))/m)

  return markdown.slice(start, end === -1 ? undefined : start + 1 + end)
}

function taskBlocks(markdown: string, masked: string): TaskBlock[] {
  const matches = [...masked.matchAll(TASK_HEADING)]

  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length
    const stop = matches[index + 1]?.index ?? markdown.length
    const rest = masked.slice(start, stop)
    const end = rest.search(/^#{1,2} /m)

    const to = end === -1 ? stop : start + end

    return { number: Number(match[1]), title: match[2].trim(), body: markdown.slice(start, to), masked: masked.slice(start, to) }
  })
}

// ID тестов задача объявляет строкой «**Test IDs:** U1, U2» вне блоков кода; упоминания в тексте и коде не считаются.
function declaredIds(body: string): string[] {
  const line = DECLARATION.exec(body)?.[1]

  return line ? (line.match(/\b[UIE]\d+\b/g) ?? []) : []
}

function undeclared(tasks: TaskBlock[], known: string[]): string[] {
  return tasks.flatMap(task => declaredIds(task.masked).filter(id => !known.includes(id)).map(id => `Task ${task.number} объявляет ID ${id}, которого нет в тест-плане.`))
}

function traceability(tasks: TaskBlock[], markdown: string, masked: string, context: PlanContext): string[] {
  const { testPlan } = context

  if (testPlan.mode === 'separate') {
    if (context.testPlanText === undefined) return ['Не удалось прочитать согласованный тест-план для проверки ID.']

    const ids = extractTestIds(context.testPlanText)
    const missing = ids.flatMap(id => {
      const holders = tasks.filter(task => declaredIds(task.masked).includes(id))
      if (holders.length === 0) return [`ID ${id} из тест-плана не объявлен ни в одной задаче (строка «**Test IDs:** …»).`]
      if (holders.length > 1) return [`ID ${id} объявлен в нескольких задачах (${holders.map(task => `Task ${task.number}`).join(', ')}): нужна ровно одна.`]
      return []
    })

    return [...missing, ...undeclared(tasks, ids)]
  }

  if (testPlan.mode === 'combined') {
    const section = casesSection(masked, markdown)
    if (section === null) return ['В плане нет секции «## Тест-кейсы» (объединённый режим).']

    const ids = extractTestIds(section)
    const problems: string[] = []
    if (ids.length === 0) problems.push('В секции «## Тест-кейсы» нет ни одной карточки кейса.')
    if (tasks.length !== 1) problems.push(`В объединённом режиме план состоит ровно из одной задачи, найдено задач: ${tasks.length}.`)
    for (const id of ids) if (tasks[0] && !declaredIds(tasks[0].masked).includes(id)) problems.push(`ID ${id} не объявлен в Task 1 (строка «**Test IDs:** …»).`)

    return [...problems, ...undeclared(tasks, ids)]
  }

  return []
}

export function checkPlan(markdown: string, context: PlanContext): { problems: string[]; taskCount: number } {
  const masked = maskFences(markdown)
  const problems = checkRussian(markdown)

  if (!/^> \*\*For agentic workers:\*\*/m.test(masked)) problems.push('Нет строки «> **For agentic workers:** …» в начале плана.')

  const constraints = sectionOf(masked, markdown, 'Global Constraints')
  if (constraints === null) problems.push('Нет раздела «## Global Constraints».')
  else if (!constraints.includes('minimal-change')) problems.push('В «## Global Constraints» нет ссылки на minimal-change.')

  const tasks = taskBlocks(markdown, masked)
  if (tasks.length === 0) problems.push('Нет задач: нужны заголовки «### Task N: <название>».')

  for (const [index, task] of tasks.entries()) {
    if (task.number !== index + 1) problems.push(`Task ${task.number} нарушает нумерацию: ожидался Task ${index + 1}.`)
    if (!/[А-Яа-яЁё]/.test(task.title)) problems.push(`Название Task ${task.number} должно быть на русском.`)
    if (!/^- \[[ x]\] /m.test(task.body)) problems.push(`В Task ${task.number} нет чекбоксов «- [ ]».`)
  }

  for (const line of executableLines(markdown, masked)) {
    if (FORBIDDEN_STEPS.some(pattern => pattern.test(line))) problems.push(`В плане не должно быть шагов коммита и создания PR: «${line.trim()}».`)
  }

  return { problems: [...problems, ...traceability(tasks, markdown, masked, context), ...placeholderProblems(markdown)], taskCount: tasks.length }
}
