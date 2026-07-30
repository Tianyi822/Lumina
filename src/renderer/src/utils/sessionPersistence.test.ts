import test from 'node:test'
import assert from 'node:assert/strict'
import {
  diffAppendableMessages,
  persistSessionIncrementally,
  serializeSessionMessages,
  type SessionPersistenceCursor
} from './sessionPersistence'
import type { SessionData, SessionMessage, SessionResult } from '@shared/types/session'

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

type SessionApiChannel = 'save' | 'appendMessages' | 'updateMeta'

interface RecordedCall {
  channel: SessionApiChannel
  args: unknown[]
}

/** 安装最小 window.api.session 桓，记录调用并按预设结果应答（默认成功） */
function installSessionApiStub(
  results: Partial<Record<SessionApiChannel, SessionResult>> = {}
): RecordedCall[] {
  const calls: RecordedCall[] = []
  const make =
    (channel: SessionApiChannel) =>
    async (...args: unknown[]): Promise<SessionResult> => {
      calls.push({ channel, args })
      return results[channel] ?? { success: true }
    }
  Object.assign(globalThis, {
    window: {
      api: {
        session: {
          save: make('save'),
          appendMessages: make('appendMessages'),
          updateMeta: make('updateMeta')
        }
      }
    }
  })
  return calls
}

function makeSelection(model = 'gpt'): NonNullable<SessionData['selectionState']> {
  return { selectedMCPTools: [], selectedKnowledgeBases: [], selectedModel: model }
}

function makeSession(
  messages: SessionMessage[],
  selectionState: SessionData['selectionState'] = makeSelection()
): SessionData {
  return {
    sessionId: 's1',
    title: '测试会话',
    sessionType: 'paper',
    createdAt: 't0',
    updatedAt: 't0',
    messages,
    selectionState
  }
}

function makeCursor(messages: SessionMessage[]): SessionPersistenceCursor {
  const serialized = serialize(messages)
  return { serialized, count: serialized.length }
}

test('persistSessionIncrementally', async (t) => {
  await t.test('append 路径：仅追加新消息，selection 未变不写 meta，游标前移', async () => {
    const calls = installSessionApiStub()
    const cursor = makeCursor([msg('a')])
    const nextMessages = [msg('a'), msg('b')]

    const result = await persistSessionIncrementally({
      session: makeSession([msg('a')]),
      nextMessages,
      selectionState: makeSelection(),
      cursor,
      errorLabel: '保存失败'
    })

    assert.deepEqual(result, { ok: true, nextSession: null })
    assert.deepEqual(
      calls.map((call) => call.channel),
      ['appendMessages']
    )
    assert.deepEqual(calls[0].args, ['s1', [msg('b')]])
    assert.deepEqual(cursor, { serialized: serialize(nextMessages), count: 2 })
  })

  await t.test('selection 变化：写 meta 并返回携新 selectionState 的会话', async () => {
    const calls = installSessionApiStub()
    const nextSelection = makeSelection('claude')

    const result = await persistSessionIncrementally({
      session: makeSession([msg('a')]),
      nextMessages: [msg('a')],
      selectionState: nextSelection,
      cursor: makeCursor([msg('a')]),
      errorLabel: '保存失败'
    })

    assert.equal(result.ok, true)
    assert.deepEqual(result.nextSession?.selectionState, nextSelection)
    assert.deepEqual(
      calls.map((call) => call.channel),
      ['updateMeta']
    )
    assert.deepEqual(calls[0].args, ['s1', { selectionState: nextSelection }])
  })

  await t.test('rewrite 路径：前缀变更时全量 save，不走 append/meta', async () => {
    const calls = installSessionApiStub()
    const cursor = makeCursor([msg('a'), msg('b')])
    const nextMessages = [msg('a'), msg('b', 'b-补写'), msg('c')]
    const nextSelection = makeSelection('claude')

    const result = await persistSessionIncrementally({
      session: makeSession([msg('a'), msg('b')]),
      nextMessages,
      selectionState: nextSelection,
      cursor,
      errorLabel: '保存失败'
    })

    assert.equal(result.ok, true)
    assert.deepEqual(result.nextSession?.messages, nextMessages)
    assert.deepEqual(result.nextSession?.selectionState, nextSelection)
    assert.deepEqual(
      calls.map((call) => call.channel),
      ['save']
    )
    assert.deepEqual(cursor, { serialized: serialize(nextMessages), count: 3 })
  })

  await t.test('forceRewrite：diff 为 noop 时仍走全量 save', async () => {
    const calls = installSessionApiStub()

    const result = await persistSessionIncrementally({
      session: makeSession([msg('a')]),
      nextMessages: [msg('a')],
      selectionState: makeSelection(),
      cursor: makeCursor([msg('a')]),
      forceRewrite: true,
      errorLabel: '保存失败'
    })

    assert.equal(result.ok, true)
    assert.notEqual(result.nextSession, null)
    assert.deepEqual(
      calls.map((call) => call.channel),
      ['save']
    )
  })

  await t.test('append 失败：游标不前移，error 取 result.error', async () => {
    const calls = installSessionApiStub({
      appendMessages: { success: false, error: '磁盘写入失败' }
    })
    const cursor = makeCursor([msg('a')])

    const result = await persistSessionIncrementally({
      session: makeSession([msg('a')]),
      nextMessages: [msg('a'), msg('b')],
      selectionState: makeSelection(),
      cursor,
      errorLabel: '保存失败'
    })

    assert.deepEqual(result, { ok: false, nextSession: null, error: '磁盘写入失败' })
    assert.deepEqual(
      calls.map((call) => call.channel),
      ['appendMessages']
    )
    assert.deepEqual(cursor, makeCursor([msg('a')]))
  })

  await t.test('updateMeta 失败：ok 为 false 但游标已前移（消息已落盘）', async () => {
    const calls = installSessionApiStub({
      updateMeta: { success: false, error: 'meta 写入失败' }
    })
    const cursor = makeCursor([msg('a')])
    const nextMessages = [msg('a'), msg('b')]

    const result = await persistSessionIncrementally({
      session: makeSession([msg('a')]),
      nextMessages,
      selectionState: makeSelection('claude'),
      cursor,
      errorLabel: '保存失败'
    })

    assert.deepEqual(result, { ok: false, nextSession: null, error: 'meta 写入失败' })
    assert.deepEqual(
      calls.map((call) => call.channel),
      ['appendMessages', 'updateMeta']
    )
    assert.deepEqual(cursor, { serialized: serialize(nextMessages), count: 2 })
  })
})
