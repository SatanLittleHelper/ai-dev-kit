import type { DocumentStageName } from './stages.mts'
import type { Stack } from './stack.mts'
import type { TestPlanMode } from './types.mts'

const COMMON = [
  'Документ пишется целиком на русском языке; код и идентификаторы остаются как есть.',
  'Пишите черновик в draftPath. В targetPath документ попадёт только после согласования, не создавайте его заранее.',
  'Перед показом пользователю проверьте черновик командой flow validate.',
  'Если в вашем агенте нет упомянутого skill, продолжайте по правилам кита из пакета.',
]

const BY_STAGE: Record<DocumentStageName, string[]> = {
  spec: ['Вызовите skill superpowers:brainstorming и напишите спеку по его процессу и правилам из пакета: цель, требования с критериями успеха, подход, ограничения. Вопросы пользователю задавайте по одному.'],
  'test-plan': [
    'Если спека даёт ровно один пункт плана реализации, тест-план не пишется: выполните flow skip test-plan --reason "combined: <причина>", тест-кейсы пойдут первой частью плана (секция «## Тест-кейсы»).',
    'Иначе опишите кейсы поведением, без кода: заголовки «## R<N> · <требование>», карточки «**U1 · название**  [unit]» с полями Дано / Когда / Тогда / Ловит.',
  ],
  plan: [
    'Вызовите skill superpowers:writing-plans и напишите план по правилам из пакета: заголовки «### Task N: <название>», строка «**Test IDs:** …» в каждой задаче с тестами, чекбоксы, раздел «## Global Constraints» со ссылкой на minimal-change, без шагов коммита и создания PR.',
  ],
}

const STACK_SKILLS: Record<Stack, string> = {
  nestjs: 'nestjs-best-practices:nestjs-best-practices',
  angular: 'angular-best-practices:angular-best-practices',
}

function stackLines(stacks: Stack[]): string[] {
  return stacks.map(stack => `В репозитории есть стек ${stack}. Если план его затрагивает, вызовите skill ${STACK_SKILLS[stack]} и прочитайте нужные темы стека из папки правил: <rulesDir>/${stack}/<тема>.md (список тем в индексе ${stack}/index.md, приложенном к пакету; пути «rules/…» в индексе читайте относительно rulesDir).`)
}

function testPlanLine(testPlan: TestPlanMode): string {
  if (testPlan.mode === 'separate') return `Тест-план согласован: ${testPlan.path}. Каждый его ID должен встретиться ровно в одной задаче плана.`
  if (testPlan.mode === 'combined') return 'Тест-кейсы идут первой частью плана в секции «## Тест-кейсы»; план состоит ровно из одной задачи (### Task 1), которая ссылается на ID кейсов.'

  return 'Тест-плана нет: добавьте в план строку «План тестов не требуется: <причина>».'
}

export function instructionsFor(stage: DocumentStageName, stacks: Stack[], testPlan?: TestPlanMode): string[] {
  return [...BY_STAGE[stage], ...(stage === 'plan' ? stackLines(stacks) : []), ...(stage === 'plan' && testPlan ? [testPlanLine(testPlan)] : []), ...COMMON]
}
