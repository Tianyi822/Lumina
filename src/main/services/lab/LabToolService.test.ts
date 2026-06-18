import { test } from 'node:test'
import assert from 'node:assert/strict'
import { labToolService } from './LabToolService'

test('ssh_connect / ssh_disconnect 已从工具集移除（防止 sshTools 被重新引入）', () => {
  // 直接查 getTools 全量列表，连接工具不应再出现
  const all = labToolService.getTools()
  const names = all.map((t) => t.name)
  assert.ok(!names.includes('lab__ssh_connect'), 'ssh_connect 应已移除')
  assert.ok(!names.includes('lab__ssh_disconnect'), 'ssh_disconnect 应已移除')
})

test('文件管理工具 read_file/list_files/delete_file 已注册', () => {
  const names = labToolService.getTools().map((t) => t.name)
  assert.ok(names.includes('lab__read_file'), 'read_file 应已注册')
  assert.ok(names.includes('lab__list_files'), 'list_files 应已注册')
  assert.ok(names.includes('lab__delete_file'), 'delete_file 应已注册')
})
