import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { detectStacks } from '../src/stack.mts'
import { writeManifest } from './rules-support.mts'
import { tempRoot } from './support.mts'

test('NestJS определяется по @nestjs/core', () => {
  const root = tempRoot()
  writeManifest(root, { '@nestjs/core': '^11.0.0' })

  assert.deepEqual(detectStacks(root), ['nestjs'])
})

test('оба стека определяются вместе', () => {
  const root = tempRoot()
  writeManifest(root, { '@nestjs/core': '^11.0.0', '@angular/core': '^20.0.0' })

  assert.deepEqual(detectStacks(root), ['nestjs', 'angular'])
})

test('devDependencies тоже учитываются', () => {
  const root = tempRoot()
  writeFileSync(join(root, 'package.json'), JSON.stringify({ devDependencies: { '@angular/core': '^20.0.0' } }))

  assert.deepEqual(detectStacks(root), ['angular'])
})

test('без package.json стеков нет', () => {
  assert.deepEqual(detectStacks(tempRoot()), [])
})

test('битый package.json даёт пустой список, а не исключение', () => {
  const root = tempRoot()
  writeFileSync(join(root, 'package.json'), '{не json')

  assert.deepEqual(detectStacks(root), [])
})

test('посторонние зависимости стек не задают', () => {
  const root = tempRoot()
  writeManifest(root, { express: '^5.0.0' })

  assert.deepEqual(detectStacks(root), [])
})
