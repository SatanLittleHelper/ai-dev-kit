import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toCiStatus } from '../src/mappers.mts'

test('U63: combined-статус коммита → состояние CI и имена упавших проверок', () => {
  const status = (state: string, statuses: Array<{ status: string; context: string }>) => toCiStatus({ state, total_count: statuses.length, statuses })
  assert.deepEqual(status('failure', [{ status: 'success', context: 'a' }, { status: 'failure', context: 'b' }]), { state: 'failure', failed: ['b'] })
  assert.deepEqual(status('error', [{ status: 'error', context: 'c' }]), { state: 'failure', failed: ['c'] })
  assert.deepEqual(status('pending', [{ status: 'pending', context: 'a' }]), { state: 'pending', failed: [] })
  assert.deepEqual(status('success', [{ status: 'success', context: 'a' }]), { state: 'success', failed: [] })
  assert.deepEqual(toCiStatus({ state: 'pending', total_count: 0, statuses: [] }), { state: 'none', failed: [] })
})
