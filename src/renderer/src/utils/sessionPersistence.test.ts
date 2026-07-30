import test from 'node:test'
import assert from 'node:assert/strict'
import { diffAppendableMessages } from './sessionPersistence'
import type { SessionMessage } from '@shared/types/session'

function msg(id: string): SessionMessage {
  return { id, role: 'user', content: id, timestamp: 't' }
}

test('diffAppendableMessages', async (t) => {
  await t.test('纯新增：返回尾部追加的消息', () => {
    const prev = [msg('a'), msg('b')]
    const next = [msg('a'), msg('b'), msg('c')]
    const result = diffAppendableMessages(prev, next, 2)
    assert.deepEqual(result, { kind: 'append', messages: [msg('c')] })
  })

  await t.test('已落盘数为 0 且有消息：首次也走追加', () => {
    const next = [msg('a')]
    const result = diffAppendableMessages([], next, 0)
    assert.deepEqual(result, { kind: 'append', messages: [msg('a')] })
  })

  await t.test('无变化：返回 noop', () => {
    const prev = [msg('a')]
    const result = diffAppendableMessages(prev, [msg('a')], 1)
    assert.deepEqual(result, { kind: 'noop' })
  })

  await t.test('前缀被修改：返回 rewrite', () => {
    const prev = [msg('a'), msg('b')]
    const next = [msg('a'), msg('B-edited'), msg('c')]
    const result = diffAppendableMessages(prev, next, 2)
    assert.deepEqual(result, { kind: 'rewrite' })
  })

  await t.test('消息变少（删除）：返回 rewrite', () => {
    const prev = [msg('a'), msg('b')]
    const result = diffAppendableMessages(prev, [msg('a')], 2)
    assert.deepEqual(result, { kind: 'rewrite' })
  })

  await t.test('落盘游标小于已知前缀：以游标为准仍可追加', () => {
    const prev = [msg('a'), msg('b')]
    const next = [msg('a'), msg('b'), msg('c')]
    // persistedCount=1 表示只落盘了 a，b/c 都需追加
    const result = diffAppendableMessages(prev, next, 1)
    assert.deepEqual(result, { kind: 'append', messages: [msg('b'), msg('c')] })
  })
})
