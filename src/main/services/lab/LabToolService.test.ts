import { test } from 'node:test'
import assert from 'node:assert/strict'
import { labToolService } from './LabToolService'

test('ssh_connect / ssh_disconnect 已从工具集移除（防止 sshTools 被重新引入）', () => {
  // 直接查 getTools 全量列表（传 computer 学科），连接工具不应再出现
  const all = labToolService.getTools({ discipline: 'computer' })
  const names = all.map((t) => t.name)
  assert.ok(!names.includes('lab__ssh_connect'), 'ssh_connect 应已移除')
  assert.ok(!names.includes('lab__ssh_disconnect'), 'ssh_disconnect 应已移除')
})

test('文件管理工具 read_file/list_files/delete_file 已注册', () => {
  const names = labToolService.getTools({ discipline: 'computer' }).map((t) => t.name)
  assert.ok(names.includes('lab__read_file'), 'read_file 应已注册')
  assert.ok(names.includes('lab__list_files'), 'list_files 应已注册')
  assert.ok(names.includes('lab__delete_file'), 'delete_file 应已注册')
})

test('PTY 工具 pty_open/send/read/close 已注册', () => {
  const names = labToolService.getTools({ discipline: 'computer' }).map((t) => t.name)
  assert.ok(names.includes('lab__pty_open'), 'pty_open 应已注册')
  assert.ok(names.includes('lab__pty_send'), 'pty_send 应已注册')
  assert.ok(names.includes('lab__pty_read'), 'pty_read 应已注册')
  assert.ok(names.includes('lab__pty_close'), 'pty_close 应已注册')
})

test('无 ctx 时 getTools 返回空数组', () => {
  assert.equal(labToolService.getTools().length, 0)
})

test('computer 学科 getTools 返回该学科工具且含 ask_user', () => {
  const tools = labToolService.getTools({ discipline: 'computer' })
  const names = tools.map((t) => t.name)
  assert.ok(names.includes('lab__exec_command'))
  assert.ok(names.includes('lab__read_file'))
  assert.ok(names.includes('lab__pty_open'))
  assert.ok(names.includes('lab__ask_user'))
})

test('未知学科 getTools 返回空', () => {
  assert.equal(labToolService.getTools({ discipline: 'nonexist' as never }).length, 0)
})
