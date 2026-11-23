import { checkRussian } from './language.mts'
import { placeholderProblems } from './markdown.mts'

const CARD = /^\*\*([UIE]\d+) · .+\*\*\s+\[[^\]]+\]\s*$/gm

const FIELDS = ['Дано', 'Когда', 'Тогда', 'Ловит']

export function extractTestIds(markdown: string): string[] {
  return [...markdown.matchAll(CARD)].map(match => match[1])
}

function cardBlocks(markdown: string): { id: string; body: string }[] {
  const matches = [...markdown.matchAll(CARD)]

  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length
    const rest = markdown.slice(start, matches[index + 1]?.index ?? markdown.length)
    const end = rest.search(/^#{1,6} /m)

    return { id: match[1], body: end === -1 ? rest : rest.slice(0, end) }
  })
}

export function checkTestPlan(markdown: string): string[] {
  const problems = checkRussian(markdown)

  if (/^```/m.test(markdown)) problems.push('В тест-плане не должно быть кода: только описание поведения.')
  if (!/^## R\d+ · \S/m.test(markdown)) problems.push('Нет заголовков требований «## R<N> · <требование>».')

  const blocks = cardBlocks(markdown)
  if (blocks.length === 0) problems.push('Нет ни одной карточки кейса («**U1 · название**  [unit]»).')

  for (const { id, body } of blocks) {
    for (const field of FIELDS) {
      if (!new RegExp(`^- ${field}:\\s*\\S`, 'm').test(body)) problems.push(`В карточке ${id} нет поля «${field}».`)
    }
  }

  const seen = new Map<string, number>()
  for (const { id } of blocks) {
    const prefix = id[0]
    const number = Number(id.slice(1))
    const expected = (seen.get(prefix) ?? 0) + 1
    if (number !== expected) problems.push(`ID ${id} нарушает нумерацию: ожидался ${prefix}${expected}.`)
    seen.set(prefix, Math.max(number, expected))
  }

  return [...problems, ...placeholderProblems(markdown)]
}
