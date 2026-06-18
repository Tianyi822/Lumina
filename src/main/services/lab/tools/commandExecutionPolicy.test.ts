import test from 'node:test'
import assert from 'node:assert/strict'
import { getCommandExecutionPolicy } from './commandExecutionPolicy'
import { formatExecCommandToolResult, resolveProjectRootForWrite } from './toolHelpers'

test('单参数调用，固定 canExecute=true 无用户交互', () => {
  const d = getCommandExecutionPolicy('ls -la')
  assert.equal(d.canExecute, true)
  assert.equal(d.requiresUserInteraction, false)
  assert.equal(d.command, 'ls -la')
})

test('任意命令均直接可执行', () => {
  assert.equal(getCommandExecutionPolicy('rm -rf /tmp/x').canExecute, true)
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
