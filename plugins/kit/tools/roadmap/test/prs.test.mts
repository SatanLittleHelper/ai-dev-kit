import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hostKind, parseGhPrs } from '../src/prs.mts'

test('PR1: хост по адресу origin', () => {
  assert.equal(hostKind('git@github.com:org/repo.git'), 'github')
  assert.equal(hostKind('https://github.com/org/repo'), 'github')
  assert.equal(hostKind('https://git.example.com/org/repo.git'), 'forgejo')
  assert.equal(hostKind('/tmp/origin.git'), 'forgejo')
})

test('PR2: разбор вывода gh', () => {
  const json = JSON.stringify([{ number: 3, title: 'T', headRefName: 'h', baseRefName: 'main', url: 'u', files: [{ path: 'a' }, { path: 'b' }] }])
  assert.deepEqual(parseGhPrs(json), [{ number: 3, title: 'T', headRef: 'h', baseRef: 'main', url: 'u', files: ['a', 'b'] }])
})
