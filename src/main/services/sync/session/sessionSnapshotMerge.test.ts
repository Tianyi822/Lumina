/**
 * sessionSnapshotMerge 纯函数单测：解析、去重、合并、回退。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeSessionJsonl, parseSessionJsonl } from './sessionSnapshotMerge'

function metaLine(updatedAt: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    kind: 'meta',
    v: 1,
    data: {
      sessionId: 'session-1000-abc',
      title: '测试会话',
      sessionType: 'default',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt,
      ...extra
    }
  })
}

function messageLine(id: string, timestamp: string, content = `内容-${id}`): string {
  return JSON.stringify({
    kind: 'message',
    data: { id, role: 'user', content, timestamp }
  })
}

test('parseSessionJsonl：meta 取最后一条，消息按 id 去重且后者覆盖', () => {
  const content = [
    metaLine('2026-08-01T01:00:00.000Z'),
    messageLine('m1', '2026-08-01T01:01:00.000Z'),
    metaLine('2026-08-01T02:00:00.000Z'),
    messageLine('m1', '2026-08-01T01:01:00.000Z', '覆盖后的内容')
  ].join('\n') + '\n'
  const parsed = parseSessionJsonl(content)
  assert.equal(parsed.hasBadLines, false)
  assert.equal(parsed.meta?.updatedAt, '2026-08-01T02:00:00.000Z')
  assert.equal(parsed.messages.length, 1)
  assert.equal(parsed.messages[0]?.content, '覆盖后的内容')
})

test('parseSessionJsonl：坏行标记 hasBadLines 且跳过', () => {
  const content = metaLine('2026-08-01T01:00:00.000Z') + '\n这不是JSON\n'
  const parsed = parseSessionJsonl(content)
  assert.equal(parsed.hasBadLines, true)
  assert.equal(parsed.meta !== null, true)
})

test('mergeSessionJsonl：双方各追加不同消息，union 后按 (timestamp, id) 排序', () => {
  const local = [metaLine('2026-08-01T01:00:00.000Z'), messageLine('m1', '2026-08-01T01:01:00.000Z'), messageLine('m3', '2026-08-01T01:03:00.000Z')].join('\n') + '\n'
  const remote = [metaLine('2026-08-01T01:00:00.000Z'), messageLine('m1', '2026-08-01T01:01:00.000Z'), messageLine('m2', '2026-08-01T01:02:00.000Z')].join('\n') + '\n'
  const merged = mergeSessionJsonl(local, remote)
  assert.equal(merged.fallback, false)
  assert.equal(merged.conflictResolved, false)
  assert.deepEqual(merged.messages.map((m) => m.id), ['m1', 'm2', 'm3'])
  const lines = merged.content.trim().split('\n')
  assert.equal(JSON.parse(lines[0] ?? '').kind, 'meta')
  assert.equal(lines.length, 4)
})

test('mergeSessionJsonl：meta 取 updatedAt 较新者', () => {
  const local = metaLine('2026-08-01T01:00:00.000Z', { title: '旧标题' }) + '\n'
  const remote = metaLine('2026-08-01T03:00:00.000Z', { title: '新标题' }) + '\n'
  const merged = mergeSessionJsonl(local, remote)
  assert.equal(merged.meta?.title, '新标题')
})

test('mergeSessionJsonl：同 id 内容不一致取远端并标记 conflictResolved', () => {
  const local = [metaLine('2026-08-01T01:00:00.000Z'), messageLine('m1', '2026-08-01T01:01:00.000Z', '本地改')].join('\n') + '\n'
  const remote = [metaLine('2026-08-01T01:00:00.000Z'), messageLine('m1', '2026-08-01T01:01:00.000Z', '远端改')].join('\n') + '\n'
  const merged = mergeSessionJsonl(local, remote)
  assert.equal(merged.conflictResolved, true)
  assert.equal(merged.messages[0]?.content, '远端改')
})

test('mergeSessionJsonl：一方有坏行回退整文件 LWW', () => {
  const local = metaLine('2026-08-01T05:00:00.000Z') + '\n坏行\n'
  const remote = metaLine('2026-08-01T01:00:00.000Z') + '\n'
  const merged = mergeSessionJsonl(local, remote)
  assert.equal(merged.fallback, true)
  assert.equal(merged.content, local, '本地 meta 更新，整文件取本地')
})
