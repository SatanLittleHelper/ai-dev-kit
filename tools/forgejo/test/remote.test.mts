import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detect, parseRemote } from '../src/remote.mts'

test('U1: разбирает https, ssh и scp-формы remote', () => {
  const want = { host: 'git.example.org', owner: 'team', repo: 'app' }
  assert.deepEqual(parseRemote('https://git.example.org/team/app.git'), want)
  assert.deepEqual(parseRemote('ssh://git@git.example.org:2222/team/app.git'), want)
  assert.deepEqual(parseRemote('git@git.example.org:team/app.git'), want)
})

test('U2: для http-remote запоминает схему и порт хоста', () => {
  assert.deepEqual(parseRemote('http://git.local:3000/team/app'), { host: 'git.local:3000', owner: 'team', repo: 'app', scheme: 'http' })
})

test('U3: отклоняет remote без owner/repo и пустую строку', () => {
  assert.equal(parseRemote('git.example.org/team/app'), null)
  assert.equal(parseRemote('https://git.example.org/app'), null)
  assert.equal(parseRemote(''), null)
})

test('U4: detect не принимает GitHub, GitLab и Bitbucket', () => {
  assert.equal(detect('git@github.com:team/app.git'), null)
  assert.equal(detect('https://GitLab.com/team/app'), null)
  assert.equal(detect('https://bitbucket.org:443/team/app'), null)
})

test('U5: detect принимает собственный домен', () => {
  assert.deepEqual(detect('git@git.example.org:team/app.git'), { host: 'git.example.org', owner: 'team', repo: 'app' })
})
