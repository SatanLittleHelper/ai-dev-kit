import type { Checkpoint, Roadmap } from './model.mts'

const CHECKPOINT = /^- \[([ x])\] (\S+) — (.*)$/
const RANGE = '(\\d+(?:\\.\\d+)?)\\s*[–-]\\s*(\\d+(?:\\.\\d+)?)'
const EST = new RegExp(`\\(est:\\s*${RANGE}д\\s*/\\s*agent:\\s*${RANGE}д\\)`)
const DEPENDS = /\(depends:\s*([^)]*)\)/
const JIRA = /\(Jira:\s*([^)]*)\)/

function parseCheckpoint(match: RegExpExecArray, line: number): Checkpoint {
  const rest = match[3]
  const est = EST.exec(rest)
  const depends = DEPENDS.exec(rest)
  const jira = JIRA.exec(rest)
  const starts = [est, depends, jira].flatMap(found => (found ? [found.index] : []))
  const title = (starts.length > 0 ? rest.slice(0, Math.min(...starts)) : rest).trim()
  const tagOrderOk = (!est || !depends || est.index < depends.index) && (!depends || !jira || jira.index < depends.index)
  return {
    id: match[2],
    title,
    checked: match[1] === 'x',
    line,
    ticket: jira ? jira[1].trim() : null,
    estimate: est ? { manual: { min: Number(est[1]), max: Number(est[2]) }, agent: { min: Number(est[3]), max: Number(est[4]) } } : null,
    estimateMalformed: /\(est:/.test(rest) && !est,
    dependsOn: depends ? depends[1].split(',').map(part => part.trim()).filter(Boolean) : [],
    tagOrderOk,
    scope: '',
    done: '',
  }
}

export function parseRoadmap(text: string): Roadmap {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const heading = lines.find(line => /^# /.test(line))
  const title = (heading ?? '').replace(/^# /, '').replace(/^Роадмап:\s*/, '').trim()

  const start = lines.findIndex(line => /^## (Контекст|Context)\s*$/.test(line))
  const contextLines: string[] = []
  if (start >= 0) {
    for (const line of lines.slice(start + 1)) {
      if (/^## /.test(line)) break
      contextLines.push(line)
    }
  }

  const checkpoints: Checkpoint[] = []
  let current: Checkpoint | undefined
  let field: 'scope' | 'done' | undefined
  for (const [index, line] of lines.entries()) {
    const match = CHECKPOINT.exec(line)
    if (match) {
      current = parseCheckpoint(match, index + 1)
      checkpoints.push(current)
      field = undefined
      continue
    }
    if (!current || /^#{1,6} /.test(line)) {
      current = undefined
      continue
    }
    const detail = /^\s+- (Объём|Готово, когда):\s*(.*)$/.exec(line)
    if (detail) {
      field = detail[1] === 'Объём' ? 'scope' : 'done'
      current[field] = detail[2].trim()
    } else if (field && /^\s{4,}\S/.test(line)) {
      current[field] = `${current[field]} ${line.trim()}`.trim()
    } else if (line.trim() !== '' && !/^\s/.test(line)) {
      current = undefined
    }
  }
  return { title, context: contextLines.join('\n').trim(), checkpoints }
}
