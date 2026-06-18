import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildExecCommandToolPayload,
  formatExecCommandToolResult,
  resolveProjectRootForWrite
} from './toolHelpers'
import type { ExecResult } from '@shared/types/lab'

const mk = (stdout: string, stderr = ''): ExecResult => ({
  exitCode: 0,
  stdout,
  stderr,
  duration: 10
})

test('无截断选项原样返回，无 truncated 标记', () => {
  const p = buildExecCommandToolPayload('ls', undefined, mk('hello'))
  assert.equal(p.stdout, 'hello')
  assert.equal('truncated' in p, false)
})

test('head 只返回前 N 行并标记 truncated', () => {
  const p = buildExecCommandToolPayload('x', undefined, mk('a\nb\nc\nd\ne'), { head: 2 })
  assert.equal(p.stdout, 'a\nb')
  assert.equal(p.truncated, true)
  // 行截断不产生字节总量，不应输出误导性的 total_bytes: 0
  assert.equal('total_bytes' in p, false)
})

test('tail 只返回后 N 行', () => {
  const p = buildExecCommandToolPayload('x', undefined, mk('a\nb\nc\nd\ne'), { tail: 2 })
  assert.equal(p.stdout, 'd\ne')
  assert.equal(p.truncated, true)
  // 行截断不产生字节总量，不应输出误导性的 total_bytes: 0
  assert.equal('total_bytes' in p, false)
})

test('head 与 tail 同给时 head 优先', () => {
  const p = buildExecCommandToolPayload('x', undefined, mk('a\nb\nc'), { head: 1, tail: 1 })
  assert.equal(p.stdout, 'a')
})

test('maxBytes 字节级截断，带 total_bytes', () => {
  const p = buildExecCommandToolPayload('x', undefined, mk('x'.repeat(100)), { maxBytes: 50 })
  assert.equal(p.stdout.length, 50)
  assert.equal(p.truncated, true)
  assert.equal(p.total_bytes, 100)
})

test('默认 maxBytes=20000 不触发', () => {
  const p = buildExecCommandToolPayload('x', undefined, mk('x'.repeat(100)))
  assert.equal(p.stdout.length, 100)
  assert.equal('truncated' in p, false)
})

test('stderr 也被 maxBytes 截断', () => {
  const p = buildExecCommandToolPayload('x', undefined, mk('ok', 'e'.repeat(100)), { maxBytes: 50 })
  assert.equal(p.stderr.length, 50)
})

test('lab__exec_command 非零退出码保留结构化输出且不视为工具失败', () => {
  const result = formatExecCommandToolResult('ls -la /app', undefined, {
    exitCode: 2,
    stdout: '',
    stderr: "ls: cannot access '/app': No such file or directory",
    duration: 12
  })

  assert.equal(result.success, true)
  const content = result.content as Array<{ type: string; text: string }>
  const payload = JSON.parse(content[0].text) as {
    command: string
    exit_code: number
    stdout: string
    stderr: string
  }

  assert.equal(payload.command, 'ls -la /app')
  assert.equal(payload.exit_code, 2)
  assert.equal(payload.stdout, '')
  assert.match(payload.stderr, /No such file or directory/)
})

// SSH 后端 resolveProjectRootForWrite 仅返回显式传入的路径
test('SSH 后端 resolveProjectRootForWrite 返回显式传入的 projectRoot', () => {
  assert.equal(resolveProjectRootForWrite({ backendType: 'ssh' }, '/app'), '/app')
  assert.equal(resolveProjectRootForWrite({ backendType: 'ssh' }), undefined)
})
