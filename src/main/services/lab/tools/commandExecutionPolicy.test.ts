import test from 'node:test'
import assert from 'node:assert/strict'
import { getCommandExecutionPolicy } from './commandExecutionPolicy'
import {
  formatExecCommandToolResult,
  resolveProjectRootForWrite
} from './toolHelpers'

test('实验室沙箱命令策略允许容器内命令直接执行', () => {
  const commands = ['find /app -type f 2>/dev/null | head -10', 'rm -rf /tmp/lumina-sandbox-cache']

  for (const command of commands) {
    const decision = getCommandExecutionPolicy('lab_sandbox', command)
    assert.equal(decision.canExecute, true)
    assert.equal(decision.requiresUserInteraction, false)
  }
})

test('宿主机命令策略要求用户交互确认', () => {
  const decision = getCommandExecutionPolicy('host', 'rm -rf /tmp/lumina-host-cache')

  assert.equal(decision.canExecute, false)
  assert.equal(decision.requiresUserInteraction, true)
  assert.match(decision.reason || '', /宿主机命令/)
  assert.deepEqual(
    decision.options?.map((option) => option.value),
    ['allow_host', 'cancel', 'use_lab_sandbox']
  )
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
  assert.equal(
    resolveProjectRootForWrite({ backendType: 'ssh' }, '/app'),
    '/app'
  )
  assert.equal(resolveProjectRootForWrite({ backendType: 'ssh' }), undefined)
})
