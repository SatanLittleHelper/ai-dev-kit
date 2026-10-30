import { LEVELS } from './severity'
import type { Level, Severity } from './severity'

const HEADLINE = /^\*\*Серьёзность:\s*(Лёгкие|Средние|Серьёзные|Критичные)\*\*\s*[—–-]\s*\S/u
const DONE_SECTION = /^##\s+Что сделано\s*$/m

// Текст замечания для агента или `undefined`, если описание годится; `floor` нет, когда границу посчитать не удалось.
export function validateBody(body: string, floor?: Severity): string | undefined {
  const first = body.split('\n').find(line => line.trim() !== '')?.trim() ?? ''
  const match = HEADLINE.exec(first)

  if (!match) {
    return 'Первая строка описания ПР должна быть «**Серьёзность: <Лёгкие|Средние|Серьёзные|Критичные>** — <причина>».'
  }

  const level = match[1] as Level

  if (floor && LEVELS.indexOf(level) < LEVELS.indexOf(floor.level)) {
    return `Заявлен уровень «${level}», но по диффу нижняя граница «${floor.level}» (${floor.reason}). Укажи уровень не ниже «${floor.level}».`
  }

  if (!DONE_SECTION.test(body)) {
    return 'В описании ПР нет раздела «## Что сделано».'
  }

  return undefined
}
