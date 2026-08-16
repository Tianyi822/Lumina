/**
 * trackerAccountScope 纯函数单测：账号归属判别与重置/认领语义。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { trackerNeedsResetForAccount, resetTrackerDataIfOwnerChanged } from './trackerAccountScope'

interface FakeData {
  schemaVersion: 1
  ownerAccountId?: string | null
  keys: Record<string, unknown>
}

function makeData(ownerAccountId?: string | null): FakeData {
  return { schemaVersion: 1, ownerAccountId, keys: { k1: 1 } }
}

function makeEmpty(): FakeData {
  return { schemaVersion: 1, keys: {} }
}

test('trackerNeedsResetForAccount：任一侧账号未知不重置', () => {
  assert.equal(trackerNeedsResetForAccount(null, 'account-b'), false)
  assert.equal(trackerNeedsResetForAccount('account-a', null), false)
  assert.equal(trackerNeedsResetForAccount(null, null), false)
})

test('trackerNeedsResetForAccount：账号一致不重置、变更重置', () => {
  assert.equal(trackerNeedsResetForAccount('account-a', 'account-a'), false)
  assert.equal(trackerNeedsResetForAccount('account-a', 'account-b'), true)
})

test('未绑定账号时认领当前账号且不动数据', () => {
  const data = makeData(undefined)
  const outcome = resetTrackerDataIfOwnerChanged(data, 'account-a', makeEmpty)
  assert.equal(outcome.reset, false)
  assert.equal(outcome.data, data)
  assert.equal(data.ownerAccountId, 'account-a')
  assert.deepEqual(data.keys, { k1: 1 })
})

test('账号一致时不动作', () => {
  const data = makeData('account-a')
  const outcome = resetTrackerDataIfOwnerChanged(data, 'account-a', makeEmpty)
  assert.equal(outcome.reset, false)
  assert.equal(outcome.data, data)
  assert.deepEqual(data.keys, { k1: 1 })
})

test('账号变更时重置为空数据并认领新账号', () => {
  const data = makeData('account-a')
  const outcome = resetTrackerDataIfOwnerChanged(data, 'account-b', makeEmpty)
  assert.equal(outcome.reset, true)
  assert.notEqual(outcome.data, data)
  assert.deepEqual(outcome.data.keys, {})
  assert.equal(outcome.data.ownerAccountId, 'account-b')
})

test('accountId 为 null 时一律不动作', () => {
  const data = makeData('account-a')
  const outcome = resetTrackerDataIfOwnerChanged(data, null, makeEmpty)
  assert.equal(outcome.reset, false)
  assert.equal(outcome.data, data)
  assert.equal(data.ownerAccountId, 'account-a')
})
