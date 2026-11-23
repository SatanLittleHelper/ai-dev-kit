import { checkRussian } from './language.mts'
import { placeholderProblems, stripCode } from './markdown.mts'

export function checkSpec(markdown: string): string[] {
  const problems = checkRussian(markdown)
  if (!/^# \S/m.test(stripCode(markdown))) problems.push('В спеке отсутствует заголовок первого уровня («# Название»).')

  return [...problems, ...placeholderProblems(markdown)]
}
