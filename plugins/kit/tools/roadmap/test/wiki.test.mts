import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toWiki } from '../src/wiki.mts'

test('W1: заголовки, списки, жирный, ссылки', () => {
  assert.equal(toWiki('## Цель\n\n- первый\n  - вложенный\n1. раз\n**важно** и [док](http://x)'), 'h3. Цель\n\n* первый\n** вложенный\n# раз\n*важно* и [док|http://x]')
})

test('W2: код — простой идентификатор в {{}}, сложное и конец строки — простым текстом', () => {
  assert.equal(toWiki('Метод `getUser()` вызывает'), 'Метод {{getUser()}} вызывает')
  assert.equal(toWiki('Файл `a.b` лежит'), 'Файл a.b лежит')
  assert.equal(toWiki('Вызови `getUser()`'), 'Вызови getUser()')
})

test('W3: fenced-блок становится {code}', () => {
  assert.equal(toWiki('```ts\nconst a = 1\n```'), '{code}\nconst a = 1\n{code}')
})
