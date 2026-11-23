import { stripCode } from './markdown.mts'

const MIN_CYRILLIC_SHARE = 0.6

const TEMPLATE_LABELS = /\b(For agentic workers|REQUIRED SUB-SKILL|Global Constraints|Interfaces|Consumes|Produces|Files|Create|Modify|Test|Task|Step|Goal|Architecture|Tech Stack|Use|superpowers)\b/g

export function checkRussian(markdown: string): string[] {
  const prose = stripCode(markdown)
    .replace(/^>.*For agentic workers.*$/gm, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\S*[\\/]\S*/g, '')
    .replace(TEMPLATE_LABELS, '')

  const cyrillic = (prose.match(/[А-Яа-яЁё]/g) ?? []).length
  const latin = (prose.match(/[A-Za-z]/g) ?? []).length
  if (cyrillic + latin === 0) return ['Документ пуст или не содержит текста.']

  const share = cyrillic / (cyrillic + latin)
  if (share < MIN_CYRILLIC_SHARE) return [`Документ должен быть на русском языке: кириллица составляет ${Math.round(share * 100)}% букв текста.`]

  return []
}
