import test from 'node:test'
import assert from 'node:assert/strict'
import { diffAppendableMessages, serializeSessionMessages } from './sessionPersistence'
import type { SessionMessage } from '@shared/types/session'

function msg(id: string, content = id): SessionMessage {
  return { id, role: 'user', content, timestamp: 't' }
}

function serialize(messages: SessionMessage[]): string[] {
  return serializeSessionMessages(messages)
}

test('diffAppendableMessages', async (t) => {
  await t.test('纯新增：返回尾部追加起点', () => {
    const prev = serialize([msg('a'), msg('b')])
    const next = serialize([msg('a'), msg('b'), msg('c')])
    assert.deepEqual(diffAppendableMessages(prev, next, 2), { kind: 'append', startIndex: 2 })
  })

  await t.test('已落盘数为 0 且有消息：首次也走追加', () => {
    const next = serialize([msg('a')])
    assert.deepEqual(diffAppendableMessages([], next, 0), { kind: 'append', startIndex: 0 })
  })

  await t.test('无变化：返回 noop', () => {
    const prev = serialize([msg('a')])
    assert.deepEqual(diffAppendableMessages(prev, serialize([msg('a')]), 1), { kind: 'noop' })
  })

  await t.test('前缀消息 id 变化：返回 rewrite', () => {
    const prev = serialize([msg('a'), msg('b')])
    const next = serialize([msg('a'), msg('B-edited'), msg('c')])
    assert.deepEqual(diffAppendableMessages(prev, next, 2), { kind: 'rewrite' })
  })

  await t.test('同 id 但内容被原地补写：返回 rewrite', () => {
    const prev = serialize([msg('a'), msg('b')])
    const next = serialize([msg('a'), msg('b', 'b-补写了 transcript')])
    assert.deepEqual(diffAppendableMessages(prev, next, 2), { kind: 'rewrite' })
  })

  await t.test('消息变少（删除）：返回 rewrite', () => {
    const prev = serialize([msg('a'), msg('b')])
    assert.deepEqual(diffAppendableMessages(prev, serialize([msg('a')]), 2), { kind: 'rewrite' })
  })

  await t.test('落盘游标小于已知前缀：以游标为准仍可追加', () => {
    const prev = serialize([msg('a'), msg('b')])
    const next = serialize([msg('a'), msg('b'), msg('c')])
    assert.deepEqual(diffAppendableMessages(prev, next, 1), { kind: 'append', startIndex: 1 })
  })
})
