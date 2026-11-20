import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveConfig } from '../src/config.mts'

const REMOTE = 'git@git.example.org:team/app.git'
const envOf = (values: Record<string, string>) => (name: string) => values[name]

test('U46: токен берётся из FORGEJO_TOKEN, затем GITEA_TOKEN, пробелы срезаются', () => {
  const token = (values: Record<string, string>) => resolveConfig({ flags: {}, env: envOf(values), remoteUrl: REMOTE }).token
  assert.equal(token({ FORGEJO_TOKEN: 'f', GITEA_TOKEN: 'g' }), 'f')
  assert.equal(token({ GITEA_TOKEN: 'g' }), 'g')
  assert.equal(token({ FORGEJO_TOKEN: '   ', GITEA_TOKEN: 'g' }), 'g')
  assert.equal(token({ FORGEJO_TOKEN: ' tok ' }), 'tok')
})

test('U47: без токена — понятная ошибка с именами переменных', () => {
  assert.throws(() => resolveConfig({ flags: {}, env: envOf({}), remoteUrl: REMOTE }), /FORGEJO_TOKEN.*GITEA_TOKEN/)
})

test('U48: репозиторий: флаги важнее remote; нераспознанный remote — ошибка', () => {
  const env = envOf({ FORGEJO_TOKEN: 'f' })
  assert.deepEqual(resolveConfig({ flags: { host: 'h.org', owner: 'o', repo: 'r' }, env, remoteUrl: REMOTE }).repo, { host: 'h.org', owner: 'o', repo: 'r' })
  assert.throws(() => resolveConfig({ flags: {}, env, remoteUrl: 'file:///x' }), /--host/)
  assert.throws(() => resolveConfig({ flags: {}, env, remoteUrl: '' }), /--host/)
})
