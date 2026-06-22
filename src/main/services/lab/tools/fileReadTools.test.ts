import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  readFileTool,
  listFilesTool,
  deleteFileTool,
  fileReadTools,
  isDangerousPath
} from './fileReadTools'

test('fileReadTools 导出三个工具', () => {
  assert.equal(fileReadTools.length, 3)
  assert.deepEqual(fileReadTools.map((t) => t.name).sort(), [
    'lab__delete_file',
    'lab__list_files',
    'lab__read_file'
  ])
})

test('readFileTool schema', () => {
  assert.deepEqual(readFileTool.inputSchema.required, ['path'])
  assert.ok(readFileTool.inputSchema.properties?.max_bytes)
  assert.ok(readFileTool.inputSchema.properties?.offset)
})

test('listFilesTool schema 无必填', () => {
  assert.equal(listFilesTool.inputSchema.required, undefined)
  assert.ok(listFilesTool.inputSchema.properties?.recursive)
})

test('deleteFileTool schema', () => {
  assert.deepEqual(deleteFileTool.inputSchema.required, ['path'])
})

test('高危路径 delete_file 触发 user_interaction（不依赖 ssh）', async () => {
  const r = await deleteFileTool.execute({ lab_id: 'lab-1', path: '/etc/passwd' })
  assert.equal(r.success, true)
  const payload = JSON.parse(r.content![0].text)
  assert.equal(payload.user_interaction_required, true)
})

test('serverName 均为 lab', () => {
  for (const t of fileReadTools) assert.equal(t.serverName, 'lab')
})

test('isDangerousPath 高危路径判定', () => {
  // 根目录、盘符根、穿越、通配、家目录、系统前缀、root 家目录、敏感文件
  for (const p of [
    '/',
    'C:\\',
    '..',
    'foo/../bar',
    '*',
    '~',
    '~/x',
    '/etc/passwd',
    '/root/x',
    '.ssh/id_rsa'
  ]) {
    assert.equal(isDangerousPath(p), true, `应判高危: ${p}`)
  }
})

test('isDangerousPath 普通路径不误判', () => {
  // 合法项目路径、含 .. 的合法文件名、系统前缀的近似拼写
  for (const p of [
    '/home/user/proj/file.txt',
    '/app/src/main.ts',
    'my..report.txt',
    '/etcpasswd',
    'report.txt'
  ]) {
    assert.equal(isDangerousPath(p), false, `不应判高危: ${p}`)
  }
})
