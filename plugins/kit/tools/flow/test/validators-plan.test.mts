import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkPlan } from '../src/validators/plan.mts'
import { validateDocument } from '../src/validators/index.mts'

const HEADER = ['# План', '', '> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans', '', '## Global Constraints', '', '- Применяется `rules/base/minimal-change.md`.', ''].join('\n')

const task = (n: number, body = 'Описание задачи на русском языке.', ids = ''): string => [`### Task ${n}: Название задачи ${n}`, '', ...(ids ? [`**Test IDs:** ${ids}`, ''] : []), body, '', '- [ ] **Step 1: Сделать работу**', ''].join('\n')

const NONE = { testPlan: { mode: 'none' } } as const

const SEPARATE = { mode: 'separate', path: 'x.md' } as const

test('корректный план проходит и считает задачи', () => {
  const result = checkPlan([HEADER, task(1), task(2)].join('\n'), NONE)

  assert.deepEqual(result, { problems: [], taskCount: 2 })
})

test('нет заголовка для агентов', () => {
  const text = [HEADER.replace(/> .*\n/, ''), task(1)].join('\n')

  assert.equal(checkPlan(text, NONE).problems.some(problem => /For agentic workers/.test(problem)), true)
})

test('в Global Constraints нет minimal-change', () => {
  const text = [HEADER.replace('minimal-change', 'другое'), task(1)].join('\n')

  assert.equal(checkPlan(text, NONE).problems.some(problem => /minimal-change/.test(problem)), true)
})

test('план без задач', () => {
  assert.equal(checkPlan(HEADER, NONE).problems.some(problem => /Task/.test(problem)), true)
})

test('заголовок задачи по-русски вместо Task не считается задачей', () => {
  const text = [HEADER, '### Задача 1: Название', '', '- [ ] **Step 1: Сделать**'].join('\n')

  assert.equal(checkPlan(text, NONE).taskCount, 0)
})

test('заголовок Task внутри блока кода не считается задачей', () => {
  const fixture = ['```markdown', '### Task 2: Пример из фикстуры', '', '- [ ] **Step 1: Пример**', '```'].join('\n')
  const text = [HEADER, task(1, fixture)].join('\n')

  assert.deepEqual(checkPlan(text, NONE), { problems: [], taskCount: 1 })
})

test('нумерация задач с пропуском', () => {
  assert.equal(checkPlan([HEADER, task(1), task(3)].join('\n'), NONE).problems.some(problem => problem.includes('Task 3')), true)
})

test('в задаче нет чекбоксов', () => {
  const text = [HEADER, '### Task 1: Название задачи', '', 'Только описание на русском языке.'].join('\n')

  assert.equal(checkPlan(text, NONE).problems.some(problem => problem.includes('Task 1') && /чекбокс/.test(problem)), true)
})

test('заголовок задачи без русского названия', () => {
  const text = [HEADER, '### Task 1: Title', '', 'Описание на русском языке.', '', '- [ ] **Step 1: Do**'].join('\n')

  assert.equal(checkPlan(text, NONE).problems.some(problem => problem.includes('Task 1') && /русск/.test(problem)), true)
})

test('шаг коммита в блоке после «Run:» запрещён', () => {
  const text = [HEADER, task(1, 'Run:\n```bash\ngit commit -m "x"\n```')].join('\n')

  assert.equal(checkPlan(text, NONE).problems.some(problem => /commit|коммит/.test(problem)), true)
})

test('команда коммита в строке «Run:» запрещена', () => {
  const text = [HEADER, task(1, 'Run: `git commit -m "x"`')].join('\n')

  assert.equal(checkPlan(text, NONE).problems.some(problem => /commit|коммит/.test(problem)), true)
})

test('shell-код изменяемого файла без «Run:» принимается', () => {
  const text = [HEADER, task(1, 'Содержимое скрипта хука:\n```bash\ngit commit --amend --no-edit\n```')].join('\n')

  assert.deepEqual(checkPlan(text, NONE).problems, [])
})

test('шаг-чекбокс с коммитом запрещён', () => {
  const text = [HEADER, task(1), '- [ ] **Step 9: git commit изменений**'].join('\n')

  assert.equal(checkPlan(text, NONE).problems.some(problem => /commit|коммит/.test(problem)), true)
})

test('та же строка в коде изменяемого файла принимается', () => {
  const text = [HEADER, task(1, '```ts\nconst command = "git commit"\n```')].join('\n')

  assert.deepEqual(checkPlan(text, NONE).problems, [])
})

test('separate: ID в двух задачах и ID ни в одной', () => {
  const testPlanText = '**U1 · а**  [unit]\n**U2 · б**  [unit]\n**U3 · в**  [unit]\n'
  const text = [HEADER, task(1, undefined, 'U1, U2'), task(2, undefined, 'U2')].join('\n')

  const { problems } = checkPlan(text, { testPlan: SEPARATE, testPlanText })

  assert.equal(problems.some(problem => problem.includes('U2') && /нескольких/.test(problem)), true)
  assert.equal(problems.some(problem => problem.includes('U3') && /не объявлен ни в одной/.test(problem)), true)
  assert.equal(problems.some(problem => problem.includes('U1')), false)
})

test('separate: каждый ID ровно в одной задаче проходит', () => {
  const testPlanText = '**U1 · а**  [unit]\n**U2 · б**  [unit]\n'
  const text = [HEADER, task(1, undefined, 'U1'), task(2, undefined, 'U2')].join('\n')

  assert.deepEqual(checkPlan(text, { testPlan: SEPARATE, testPlanText }).problems, [])
})

test('separate: объявление внутри блока кода не считается', () => {
  const testPlanText = '**U1 · а**  [unit]\n'
  const fixture = ['```markdown', '**Test IDs:** U1', '```'].join('\n')
  const text = [HEADER, task(1, fixture)].join('\n')

  assert.equal(checkPlan(text, { testPlan: SEPARATE, testPlanText }).problems.some(problem => problem.includes('U1') && /не объявлен/.test(problem)), true)
})

test('separate: упоминание ID в тексте без объявления не считается', () => {
  const testPlanText = '**U1 · а**  [unit]\n'
  const text = [HEADER, task(1, 'Покрывает U1.')].join('\n')

  assert.equal(checkPlan(text, { testPlan: SEPARATE, testPlanText }).problems.some(problem => problem.includes('U1') && /не объявлен/.test(problem)), true)
})

test('separate: лишний ID, которого нет в тест-плане', () => {
  const testPlanText = '**U1 · а**  [unit]\n'
  const text = [HEADER, task(1, undefined, 'U1, U9')].join('\n')

  assert.equal(checkPlan(text, { testPlan: SEPARATE, testPlanText }).problems.some(problem => problem.includes('U9') && /нет в тест-плане/.test(problem)), true)
})

test('combined: секция с заголовками R<N> и одна задача проходят', () => {
  const cases = ['## Тест-кейсы', '', '## R1 · Поведение', '', '**U1 · поведение**  [unit]', '- Дано: а', '', '## R2 · Ещё поведение', '', '**U2 · другое**  [unit]', '- Дано: б', ''].join('\n')

  assert.deepEqual(checkPlan([HEADER, cases, task(1, undefined, 'U1, U2')].join('\n'), { testPlan: { mode: 'combined' } }).problems, [])
})

test('combined: нет секции тест-кейсов', () => {
  assert.equal(checkPlan([HEADER, task(1)].join('\n'), { testPlan: { mode: 'combined' } }).problems.some(problem => /Тест-кейсы/.test(problem)), true)
})

test('combined: больше одной задачи', () => {
  const cases = ['## Тест-кейсы', '', '**U1 · поведение**  [unit]', ''].join('\n')

  assert.equal(checkPlan([HEADER, cases, task(1, undefined, 'U1'), task(2)].join('\n'), { testPlan: { mode: 'combined' } }).problems.some(problem => /ровно из одной/.test(problem)), true)
})

test('combined: ID кейса не объявлен в Task 1', () => {
  const cases = ['## Тест-кейсы', '', '**U1 · поведение**  [unit]', ''].join('\n')

  assert.equal(checkPlan([HEADER, cases, task(1)].join('\n'), { testPlan: { mode: 'combined' } }).problems.some(problem => problem.includes('U1') && /не объявлен в Task 1/.test(problem)), true)
})

test('validateDocument маршрутизирует по стадии', () => {
  assert.equal(validateDocument('spec', '# Спека\n\nОписание поведения на русском языке.', NONE).problems.length, 0)
  assert.equal(validateDocument('plan', [HEADER, task(1)].join('\n'), NONE).taskCount, 1)
})
