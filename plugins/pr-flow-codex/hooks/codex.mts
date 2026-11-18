import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { wantsPr } from './shared/commands.ts'
import { checkCommand } from './check.mts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
try {
  const event = JSON.parse(readFileSync(0, 'utf8'))
  let output: object = {}
  if (event.hook_event_name === 'UserPromptSubmit' && typeof event.prompt === 'string' && wantsPr(event.prompt)) {
    const skill = resolve(root, 'skills/pr-flow/SKILL.md')
    output = { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: `Навык PR-flow: ${skill}\n${readFileSync(skill, 'utf8')}` } }
  } else if (event.hook_event_name === 'PreToolUse' && typeof event.tool_input?.command === 'string') {
    const result = checkCommand(event.tool_input.command, event.cwd)
    const reason = [result.problem, result.incomplete].filter(Boolean).join(' ')
    if (reason) output = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }
  }
  process.stdout.write(JSON.stringify(output))
} catch {
  process.stderr.write('PR-flow: ошибка обработки события.\n')
  process.exitCode = 1
}
