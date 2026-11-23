import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { closeStage, getStatus } from '../src/flow.mts'
import { repoRelative } from '../src/evidence.mts'
import { begin, expectBlocked, expectOk, readStateFile, stageOf, tempRoot, writeDoc } from './support.mts'

test('U34: путь из подпапки сохраняется относительно корня', () => {
  const root = tempRoot()
  begin(root)
  writeDoc(root, 'x')

  expectOk(closeStage({ root, id: 'A1', stage: 'spec', evidence: './x.md', cwd: join(root, 'docs') }))

  const spec = stageOf(readStateFile(root, 'A1'), 'spec')
  assert.equal(spec?.evidence, 'docs/x.md')
  assert.equal(expectOk(getStatus({ root, id: 'A1' })).reset, undefined)
})

test('U35: путь вне репозитория отклоняется', () => {
  const root = tempRoot()
  begin(root)

  assert.equal(repoRelative(root, root, '../../outside.md'), null)
  assert.equal(repoRelative(root, root, '/etc/hosts'), null)
  const response = expectBlocked(closeStage({ root, id: 'A1', stage: 'spec', evidence: '../outside.md', cwd: root }))
  assert.match(response.reason, /вне репозитория/)
})
