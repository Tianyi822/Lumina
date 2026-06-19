import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DISCIPLINE_TOOL_SETS, getDisciplineToolSet, stripLabPrefix } from './disciplineToolSets'

test('DISCIPLINE_TOOL_SETS 包含 computer 学科且后端为 ssh', () => {
  assert.ok(DISCIPLINE_TOOL_SETS.computer)
  assert.equal(DISCIPLINE_TOOL_SETS.computer.backendType, 'ssh')
})

test('computer 学科 toolIds 包含全部目标工具', () => {
  const ids = DISCIPLINE_TOOL_SETS.computer.toolIds
  for (const id of [
    'exec_command',
    'write_project_files',
    'read_file',
    'list_files',
    'delete_file',
    'pty_open',
    'pty_send',
    'pty_read',
    'pty_close',
    'ask_user'
  ]) {
    assert.ok(ids.includes(id), `应包含 ${id}`)
  }
  // 已移除的连接工具不应出现
  assert.ok(!ids.includes('ssh_connect'))
  assert.ok(!ids.includes('ssh_disconnect'))
})

test('getDisciplineToolSet 已知学科返回工具集，未知返回 undefined', () => {
  assert.ok(getDisciplineToolSet('computer'))
  assert.equal(getDisciplineToolSet('nonexist' as never), undefined)
})

test('stripLabPrefix 去除 lab__ 前缀', () => {
  assert.equal(stripLabPrefix('lab__exec_command'), 'exec_command')
  assert.equal(stripLabPrefix('exec_command'), 'exec_command')
})
