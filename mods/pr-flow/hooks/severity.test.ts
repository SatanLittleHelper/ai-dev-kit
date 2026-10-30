import { expect, test } from 'claude-code/testing'

import { classify, hasMajorBump } from './severity'
import type { ChangedFile } from './severity'

const M = (path: string): ChangedFile => ({ status: 'M', path })
const run = (files: ChangedFile[], migrationDiff = '', packageDiff = '') =>
  classify({ files, migrationDiff, packageDiff })

test('пустой дифф и «лёгкие» файлы дают Лёгкие', async () => {
  expect(run([]).level).toBe('Лёгкие')
  expect(run([]).reason).toBe('нет изменений')
  expect(run([M('README.md'), M('docs/a.md')]).level).toBe('Лёгкие')
  expect(run([M('src/a.spec.ts'), M('src/a.scss')]).level).toBe('Лёгкие')
  expect(run([{ status: 'R100', path: 'src/b.ts' }]).level).toBe('Лёгкие')
  expect(run([M('docs/auth.md')]).level).toBe('Лёгкие')
})

test('обычная правка исходников даёт Средние', async () => {
  expect(run([M('src/a.ts')]).level).toBe('Средние')
  expect(run([M('src/authors/list.ts')]).level).toBe('Средние')
})

test('миграции: безопасная Серьёзные, деструктивная Критичные', async () => {
  const migration = [{ status: 'A', path: 'db/migrations/001.sql' }]
  const safe = run(migration, '+CREATE TABLE a (id int);')
  expect(safe.level).toBe('Серьёзные')
  expect(safe.reason.includes('миграц')).toBe(true)

  const destructive = run(migration, '+DROP TABLE users;')
  expect(destructive.level).toBe('Критичные')
  expect(destructive.reason.includes('DROP')).toBe(true)
})

test('платежи и безопасность Критичные', async () => {
  const hit = run([M('src/payments/charge.ts')])
  expect(hit.level).toBe('Критичные')
  expect(hit.reason.includes('src/payments/charge.ts')).toBe(true)
})

test('auth, инфраструктура, конфиги Серьёзные', async () => {
  for (const path of [
    'src/auth/token.ts',
    '.github/workflows/ci.yml',
    'Dockerfile',
    '.env.example',
    'tsconfig.build.json',
  ]) {
    expect(run([M(path)]).level).toBe('Серьёзные')
  }
})

test('удаление исходного файла Серьёзные', async () => {
  const removed = run([{ status: 'D', path: 'src/old.ts' }])
  expect(removed.level).toBe('Серьёзные')
  expect(removed.reason.includes('удален')).toBe(true)
})

test('major-обновление зависимости Серьёзные, minor Средние', async () => {
  const major = run([M('package.json')], '', '-  "rxjs": "^6.6.0",\n+  "rxjs": "^7.8.0",')
  expect(major.level).toBe('Серьёзные')
  expect(major.reason.includes('rxjs')).toBe(true)

  const minor = run([M('package.json')], '', '-  "rxjs": "^7.5.0",\n+  "rxjs": "^7.8.0",')
  expect(minor.level).toBe('Средние')
  expect(hasMajorBump('-  "version": "1.0.0",\n+  "version": "2.0.0",')).toBe(undefined)
})

test('побеждает самый высокий уровень', async () => {
  expect(run([M('README.md'), M('src/payments/x.ts')]).level).toBe('Критичные')
  expect(run([M('src/a.ts'), M('Dockerfile')]).level).toBe('Серьёзные')
})
