import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DocumentStageName } from './stages.mts'
import type { Stack } from './stack.mts'

export interface RuleText {
  name: string
  text: string
}

const RULES_DIRS = ['.claude/ai-dev-kit/rules', 'rules']

const MARKER_FILE = 'skills/writing-plans.md'

const STAGE_RULES: Record<DocumentStageName, string[]> = {
  spec: ['skills/brainstorming.md'],
  'test-plan': ['skills/writing-test-plans.md', 'base/testing.md', 'base/test-execution-policy.md'],
  plan: ['skills/writing-plans.md', 'base/minimal-change.md'],
}

const STACK_RULES: Record<Stack, string> = { nestjs: 'nestjs/index.md', angular: 'angular/index.md' }

export function loadRules(root: string, stage: DocumentStageName, stacks: Stack[]): { rules: RuleText[]; dir: string } | { reason: string } {
  const dir = RULES_DIRS.map(candidate => join(root, candidate)).find(candidate => existsSync(join(candidate, MARKER_FILE)))
  if (!dir) return { reason: `Не найдена папка правил кита: проверены ${RULES_DIRS.join(' и ')}. Установите ai-dev-kit (setup.sh) или запустите flow в репозитории кита.` }

  const names = [...STAGE_RULES[stage], ...(stage === 'plan' ? stacks.map(stack => STACK_RULES[stack]) : [])]
  const rules: RuleText[] = []

  for (const name of names) {
    const path = join(dir, name)
    if (!existsSync(path)) return { reason: `Не найден файл правил ${name} в ${dir}.` }

    rules.push({ name, text: readFileSync(path, 'utf8') })
  }

  return { rules, dir }
}
