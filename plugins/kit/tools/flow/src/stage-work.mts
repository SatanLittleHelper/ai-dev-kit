import { IMPLEMENT_METHODS } from './stages.mts'
import type { AgentStageName, ImplementMethod } from './stages.mts'
import type { AgentPackage, NeedsInputResponse } from './types.mts'

export const evidenceFile = (id: string, stage: AgentStageName): string => `tmp/flow/${id}/${stage}.md`

export const isImplementMethod = (value: string): value is ImplementMethod => (IMPLEMENT_METHODS as readonly string[]).includes(value)

export function methodQuestion(): NeedsInputResponse {
  return {
    result: 'needs-input',
    question: 'План согласован. Начинаем реализацию? Каким методом её вести? После ответа выполните: flow next --method <метод>.',
    options: [...IMPLEMENT_METHODS],
  }
}

function methodHint(method: ImplementMethod, planPath?: string): string {
  const plan = planPath ? `план: ${planPath}` : 'путь плана неизвестен (стадия plan пропущена): уточните его у пользователя'
  if (method === 'inline') return `выполняйте задачи плана сами, по порядку, по TDD (${plan})`
  if (method === 'subagent-driven-development') return `вызовите skill superpowers:subagent-driven-development и следуйте rules/skills/subagent-driven-development.md (${plan})`
  return `вызовите skill kit:codex-implement (${plan})`
}

const NATIVE_SIMPLIFY_AGENTS = ['claude']

export function agentPackage(id: string, stage: AgentStageName | 'review' | 'pr', options: { method?: ImplementMethod; agent?: string; planPath?: string } = {}): AgentPackage {
  if (stage === 'review') {
    return { stage, instructions: [
      'Ревью кода запускает код: выполните flow submit, затем flow wait.',
      'Ответ annotated содержит замечания: исправьте их и снова выполните flow submit. Ответ approved закрывает стадию сам.',
    ] }
  }
  if (stage === 'pr') {
    return { stage, instructions: [
      'Создайте PR через skill pr-flow и убедитесь, что он открыт из текущей ветки.',
      'Закройте стадию: flow done pr --evidence <URL PR>. Для задачи Jira после проверки PR тикет переводится в «Ревью».',
    ] }
  }

  const path = evidenceFile(id, stage)
  const close = `Сохраните итог в файл ${path} и закройте стадию: flow done ${stage} --evidence ${path}.`
  if (stage === 'implement') {
    const method = options.method!
    return { stage, evidencePath: path, method, instructions: [
      `Реализуйте согласованный план методом «${method}»: ${methodHint(method, options.planPath)}.`,
      'Ревью кода на этой стадии не делается: только финальный verification pass из плана (сборка, типы, линт, тесты).',
      `Запишите в файл ${path} выполненные команды и их итог, затем: flow done implement --evidence ${path}.`,
    ] }
  }
  if (stage === 'simplify') {
    const native = NATIVE_SIMPLIFY_AGENTS.includes(options.agent ?? 'claude')
    return { stage, evidencePath: path, instructions: [
      native ? 'Выполните нативный /simplify по изменениям задачи.' : 'Вызовите skill kit:simplify: в этом агенте нативного /simplify нет.',
      close,
    ] }
  }
  if (stage === 'check') {
    return { stage, evidencePath: path, instructions: [
      'Проведите ревью кода по skill superpowers:requesting-code-review. Найденное исправляйте молча, без отчёта пользователю.',
      close,
    ] }
  }

  return { stage, evidencePath: path, instructions: [
    'Проведите ручное тестирование изменений по skill kit:testing-changes и согласуйте отчёт с пользователем.',
    `Отчёт testing-changes после согласования удаляется, поэтому перенесите его итог в файл ${path} и закройте стадию: flow done local-test --evidence ${path}.`,
  ] }
}
