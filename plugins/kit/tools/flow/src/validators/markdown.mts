// Вырезает блоки кода и строчный код, чтобы проверки смотрели только на прозу.
export function stripCode(markdown: string): string {
  return markdown.replace(/^```[^\n]*\n[\s\S]*?^```[ \t]*$/gm, '').replace(/`[^`\n]*`/g, '')
}

// Заменяет содержимое блоков кода пробелами, сохраняя переводы строк и длину: индексы совпадают с исходным текстом.
export function maskFences(markdown: string): string {
  return markdown.replace(/^```[^\n]*\n[\s\S]*?^```[ \t]*$/gm, block => block.replace(/[^\n]/g, ' '))
}

const PLACEHOLDERS = [/\bTBD\b/g, /\bTODO\b/g, /и т\.д\./g, /аналогично [UIE]\d+/g, /Similar to Task/g]

export function findPlaceholders(markdown: string): string[] {
  const prose = stripCode(markdown)

  return PLACEHOLDERS.flatMap(pattern => prose.match(pattern) ?? [])
}

export const placeholderProblems = (markdown: string): string[] => [...new Set(findPlaceholders(markdown))].map(placeholder => `Заглушка в тексте: «${placeholder}».`)
