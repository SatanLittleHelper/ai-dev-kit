import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const STAGE_RULE_FILES = {
  spec: ['skills/brainstorming.md'],
  'test-plan': ['skills/writing-test-plans.md', 'base/testing.md', 'base/test-execution-policy.md'],
  plan: ['skills/writing-plans.md', 'base/minimal-change.md'],
} as const

const ALL_FILES = [...Object.values(STAGE_RULE_FILES).flat(), 'nestjs/index.md', 'angular/index.md']

export const ruleText = (file: string): string => `Текст правила ${file}`

// Раскладывает файлы правил: по умолчанию как в репозитории кита (`rules/`), иначе как у потребителя (`.claude/ai-dev-kit/rules`).
export function seedRules(root: string, dir = 'rules'): void {
  for (const file of ALL_FILES) {
    const path = join(root, dir, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, ruleText(file))
  }
}

export function writeManifest(root: string, dependencies: Record<string, string>): void {
  writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies }))
}
