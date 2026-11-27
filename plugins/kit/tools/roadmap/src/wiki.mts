const SIMPLE = /^[\p{L}\p{N}_()]+$/u

function inline(line: string): string {
  let out = line.replace(/\*\*([^*]+)\*\*/g, '*$1*').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '[$1|$2]')
  out = out.replace(/`([^`]+)`/g, (_match, code: string, offset: number, whole: string) => {
    const atEnd = whole.slice(offset + code.length + 2).trim() === ''
    return SIMPLE.test(code) && !atEnd ? `{{${code}}}` : code
  })
  return out
}

export function toWiki(markdown: string): string {
  const out: string[] = []
  let fenced = false
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced
      out.push('{code}')
      continue
    }
    if (fenced) {
      out.push(line)
      continue
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (heading) {
      out.push(`h3. ${inline(heading[1])}`)
      continue
    }
    const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line)
    if (bullet) {
      out.push(`${'*'.repeat(Math.floor(bullet[1].length / 2) + 1)} ${inline(bullet[2])}`)
      continue
    }
    const numbered = /^(\s*)\d+\.\s+(.*)$/.exec(line)
    if (numbered) {
      out.push(`${'#'.repeat(Math.floor(numbered[1].length / 2) + 1)} ${inline(numbered[2])}`)
      continue
    }
    out.push(inline(line))
  }
  return out.join('\n')
}
