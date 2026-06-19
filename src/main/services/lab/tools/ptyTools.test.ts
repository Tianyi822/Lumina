import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ptyOpenTool, ptySendTool, ptyReadTool, ptyCloseTool, ptyTools } from './ptyTools'

test('ptyTools 导出四个工具', () => {
  assert.equal(ptyTools.length, 4)
  assert.deepEqual(
    ptyTools.map((t) => t.name),
    ['lab__pty_open', 'lab__pty_send', 'lab__pty_read', 'lab__pty_close']
  )
})

test('ptyOpenTool schema 含 cols/rows 默认尺寸', () => {
  assert.ok(ptyOpenTool.inputSchema.properties?.cols)
  assert.ok(ptyOpenTool.inputSchema.properties?.rows)
})

test('ptySendTool schema 必填 session_id/data', () => {
  assert.deepEqual(ptySendTool.inputSchema.required, ['session_id', 'data'])
})

test('ptyReadTool schema 必填 session_id，wait_ms/max_bytes 可选', () => {
  assert.deepEqual(ptyReadTool.inputSchema.required, ['session_id'])
  assert.ok(ptyReadTool.inputSchema.properties?.wait_ms)
  assert.ok(ptyReadTool.inputSchema.properties?.max_bytes)
})

test('ptyCloseTool schema 必填 session_id', () => {
  assert.deepEqual(ptyCloseTool.inputSchema.required, ['session_id'])
})

test('pty_send 缺 data 参数返回错误', async () => {
  const r = await ptySendTool.execute({ session_id: 's1' })
  assert.equal(r.success, false)
  assert.match(r.error!, /data/)
})

test('pty_read 缺 session_id 参数返回错误', async () => {
  const r = await ptyReadTool.execute({})
  assert.equal(r.success, false)
  assert.match(r.error!, /session_id/)
})

test('pty_send/pty_read/pty_close 缺 session_id 均返回错误', async () => {
  for (const tool of [ptySendTool, ptyReadTool, ptyCloseTool]) {
    const r = await tool.execute({ data: 'x' })
    assert.equal(r.success, false, `${tool.name} 应失败`)
    assert.match(r.error!, /session_id/, `${tool.name} 应报 session_id`)
  }
})

test('serverName 均为 lab', () => {
  for (const t of ptyTools) assert.equal(t.serverName, 'lab')
})
