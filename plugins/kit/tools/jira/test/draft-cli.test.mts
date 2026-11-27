import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import * as argsModule from '../cli/args.mts'
const parseDraftArgs = (...args: any[]) => {
  const parse = (argsModule as any).parseDraftArgs
  assert.ok(parse, 'Разбор аргументов draft-cli должен существовать')
  return parse(...args)
}
import { CliError } from '../src/errors.mts'
import { sandbox, useFakeJira } from './support.mts'

const fake = useFakeJira()
const BODY = 'h3. Контекст\nАудит показал сбой экспорта.\n\nh3. Проблема\n* Экспорт падает\n\nh3. Критерии приемки\n* а\n* б\n* в'
const DRAFT = `\`\`\`\nНазвание задачи\n\`\`\`\n\n\`\`\`\n${BODY}\n\`\`\`\n`

test('DC1 U1: разбор аргументов draft', () => {
  assert.deepEqual(parseDraftArgs(['split', 'd.md']), { action: 'split', file: 'd.md' })
  assert.deepEqual(parseDraftArgs(['split', 'd.md', '--out-dir', 'out']), { action: 'split', file: 'd.md', outDir: 'out' })
  assert.deepEqual(parseDraftArgs(['lint', 'd.md']), { action: 'lint', file: 'd.md', kind: 'issue' })
  assert.deepEqual(parseDraftArgs(['lint', 'd.md', '--kind', 'markup']), { action: 'lint', file: 'd.md', kind: 'markup' })
  for (const args of [[], ['nope', 'd.md'], ['split'], ['split', 'd.md', '--kind', 'issue'], ['lint', 'd.md', '--kind', 'x'], ['lint', 'd.md', '--out-dir', 'o']]) {
    assert.throws(() => parseDraftArgs(args), CliError)
  }
})

test('DC1 I1: split пишет title.txt и body.txt рядом с черновиком', async () => {
  const box = sandbox(fake)
  writeFileSync(join(box.cwd, 'd.md'), DRAFT)
  const response = await box.run(['draft', 'split', 'd.md'])

  assert.equal(response.code, 0, response.stderr)
  assert.deepEqual(JSON.parse(response.stdout), { title: 'd.title.txt', body: 'd.body.txt' })
  assert.equal(readFileSync(join(box.cwd, 'd.title.txt'), 'utf8'), 'Название задачи')
  assert.equal(readFileSync(join(box.cwd, 'd.body.txt'), 'utf8'), BODY)
})

test('DC1 I2: split не по двум блокам — код 1 и причина в stderr', async () => {
  const box = sandbox(fake)
  writeFileSync(join(box.cwd, 'd.md'), '```\nТолько название\n```\n')
  const response = await box.run(['draft', 'split', 'd.md'])

  assert.equal(response.code, 1)
  assert.match(response.stderr, /block-count/)
})

test('DC1 I3: lint корректного черновика — код 0, ok true', async () => {
  const box = sandbox(fake)
  writeFileSync(join(box.cwd, 'd.md'), DRAFT)
  const response = await box.run(['draft', 'lint', 'd.md'])

  assert.equal(response.code, 0, response.stderr)
  assert.deepEqual(JSON.parse(response.stdout), { ok: true, errors: [] })
})

test('DC1 I4: lint с ошибкой — код 1, ошибки в stdout', async () => {
  const box = sandbox(fake)
  writeFileSync(join(box.cwd, 'd.md'), DRAFT.replace('* Экспорт падает', '- Экспорт падает'))
  const response = await box.run(['draft', 'lint', 'd.md'])

  assert.equal(response.code, 1)
  const result = JSON.parse(response.stdout)
  assert.equal(result.ok, false)
  assert.deepEqual(result.errors.map((error: { rule: string }) => error.rule), ['bullet-marker'])
})

test('DC1 I5: lint --kind markup проверяет весь файл как тело', async () => {
  const box = sandbox(fake)
  writeFileSync(join(box.cwd, 'c.txt'), 'Файл {{a.b}} тут')
  const response = await box.run(['draft', 'lint', 'c.txt', '--kind', 'markup'])

  assert.equal(response.code, 1)
  assert.deepEqual(JSON.parse(response.stdout).errors.map((error: { rule: string }) => error.rule), ['inline-code'])
})

test('DC1 I6: нет файла — код 1', async () => {
  const response = await sandbox(fake).run(['draft', 'lint', 'missing.md'])

  assert.equal(response.code, 1)
  assert.match(response.stderr, /не удалось прочитать файл/)
})
