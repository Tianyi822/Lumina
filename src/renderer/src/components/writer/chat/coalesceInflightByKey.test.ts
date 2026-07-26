import assert from 'node:assert/strict'
import test from 'node:test'
import { coalesceInflightByKey, createInflightByKeyState } from './coalesceInflightByKey'

test('同一 key 的并发调用共享同一 Promise', async () => {
  const state = createInflightByKeyState<number>()
  let runs = 0

  const run = (): Promise<number> =>
    new Promise((resolve) => {
      runs += 1
      setTimeout(() => resolve(runs), 10)
    })

  const a = coalesceInflightByKey(state, 'doc-1', run)
  const b = coalesceInflightByKey(state, 'doc-1', run)
  assert.equal(a, b)

  const [ra, rb] = await Promise.all([a, b])
  assert.equal(ra, 1)
  assert.equal(rb, 1)
  assert.equal(runs, 1)
})

test('settled 后再次调用会重新执行', async () => {
  const state = createInflightByKeyState<string>()
  let runs = 0

  const first = await coalesceInflightByKey(state, 'doc-1', async () => {
    runs += 1
    return 'a'
  })
  assert.equal(first, 'a')
  assert.equal(runs, 1)
  assert.equal(state.promise, null)

  const second = await coalesceInflightByKey(state, 'doc-1', async () => {
    runs += 1
    return 'b'
  })
  assert.equal(second, 'b')
  assert.equal(runs, 2)
})

test('不同 key 不共享 inflight', async () => {
  const state = createInflightByKeyState<string>()
  const hold = { resolve: null as ((value: string) => void) | null }

  const a = coalesceInflightByKey(
    state,
    'doc-a',
    () =>
      new Promise<string>((resolve) => {
        hold.resolve = resolve
      })
  )

  // doc-a 仍在飞行中时切换到 doc-b，应启动新 Promise
  const b = coalesceInflightByKey(state, 'doc-b', async () => 'b-done')
  assert.notEqual(a, b)
  assert.equal(await b, 'b-done')

  assert.ok(hold.resolve)
  hold.resolve('a-done')
  assert.equal(await a, 'a-done')
})
