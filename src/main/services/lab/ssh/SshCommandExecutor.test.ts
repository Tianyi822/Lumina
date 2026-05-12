import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { SshCommandExecutor } from './SshCommandExecutor'
import { sshConnectionManager } from './SshConnectionManager'
import { Client } from 'ssh2'

interface MockClientProps {
  _mockStdoutData?: string
  _mockStderrData?: string
  _mockExitCode?: number
  _mockExecError?: string
  _lastExecCommand?: string
}

function createMockClient(stdoutData?: string, execError?: string): Client {
  const client = new Client()
  const mock = client as unknown as MockClientProps
  if (stdoutData !== undefined) {
    mock._mockStdoutData = stdoutData
  }
  if (execError !== undefined) {
    mock._mockExecError = execError
  }
  return client
}

function mockProps(client: Client): MockClientProps {
  return client as unknown as MockClientProps
}

test('SshCommandExecutor', async (t) => {
  const executor = new SshCommandExecutor()
  const originalGetClient = sshConnectionManager.getClient.bind(sshConnectionManager)

  await t.test('客户端不存在时返回 null', async () => {
    sshConnectionManager.getClient = () => null
    try {
      const result = await executor.execCommand('lab-1', { command: 'ls' })
      assert.equal(result, null)
    } finally {
      sshConnectionManager.getClient = originalGetClient
    }
  })

  await t.test('正常执行返回 ExecResult', async () => {
    const mockClient = createMockClient('hello world\n')

    sshConnectionManager.getClient = (labId: string) => (labId === 'lab-1' ? mockClient : null)
    try {
      const result = await executor.execCommand('lab-1', { command: 'echo hello' })
      assert.ok(result !== null)
      assert.equal(result!.exitCode, 0)
      assert.equal(result!.stdout, 'hello world\n')
    } finally {
      sshConnectionManager.getClient = originalGetClient
    }
  })

  await t.test('exec 出错返回 systemError', async () => {
    const mockClient = createMockClient(undefined, 'command not found')

    sshConnectionManager.getClient = () => mockClient
    try {
      const result = await executor.execCommand('lab-2', { command: 'bad-command' })
      assert.ok(result !== null)
      assert.equal(result!.exitCode, -1)
      assert.equal(result!.systemError, true)
      assert.equal(result!.stderr, 'command not found')
    } finally {
      sshConnectionManager.getClient = originalGetClient
    }
  })

  await t.test('超时返回超时结果', async () => {
    const mockClient = new Client()
    // timeout 设为 0.5 秒，留充分余量避免 CI 高负载下 flaky
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mockClient as any).exec = () => {
      /* hang: never calls callback */
    }

    sshConnectionManager.getClient = () => mockClient
    try {
      const result = await executor.execCommand('lab-3', { command: 'sleep 100', timeout: 0.5 })
      assert.ok(result !== null)
      assert.equal(result!.exitCode, -1)
      assert.equal(result!.stderr, '命令执行超时')
    } finally {
      sshConnectionManager.getClient = originalGetClient
    }
  })

  await t.test('非零退出码正确反映', async () => {
    const mockClient = createMockClient('error output\n')
    mockProps(mockClient)._mockExitCode = 1
    mockProps(mockClient)._mockStderrData = 'something went wrong\n'

    sshConnectionManager.getClient = () => mockClient
    try {
      const result = await executor.execCommand('lab-4', { command: 'fail-command' })
      assert.ok(result !== null)
      assert.equal(result!.exitCode, 1)
      assert.equal(result!.stderr, 'something went wrong\n')
    } finally {
      sshConnectionManager.getClient = originalGetClient
    }
  })

  await t.test('包含 workdir 时切换到工作目录', async () => {
    const mockClient = createMockClient('ok\n')

    sshConnectionManager.getClient = () => mockClient
    try {
      const result = await executor.execCommand('lab-5', { command: 'ls', workdir: '/home/user' })
      assert.ok(result !== null)
      assert.equal(result!.stdout, 'ok\n')
      assert.equal(mockProps(mockClient)._lastExecCommand, 'cd "/home/user" && ls')
    } finally {
      sshConnectionManager.getClient = originalGetClient
    }
  })

  await t.test('包含环境变量时正确设置前缀', async () => {
    const mockClient = createMockClient('done\n')

    sshConnectionManager.getClient = () => mockClient
    try {
      const result = await executor.execCommand('lab-6', {
        command: 'npm test',
        env: { NODE_ENV: 'production' }
      })
      assert.ok(result !== null)
      assert.equal(result!.stdout, 'done\n')
      assert.equal(mockProps(mockClient)._lastExecCommand, "NODE_ENV='production' npm test")
    } finally {
      sshConnectionManager.getClient = originalGetClient
    }
  })

  await t.test('workdir 和 env 同时存在时命令顺序正确', async () => {
    const mockClient = createMockClient('result\n')

    sshConnectionManager.getClient = () => mockClient
    try {
      const result = await executor.execCommand('lab-8', {
        command: 'node server.js',
        workdir: '/app',
        env: { PORT: '3000', DEBUG: 'true' }
      })
      assert.ok(result !== null)
      assert.equal(result!.stdout, 'result\n')
      assert.equal(
        mockProps(mockClient)._lastExecCommand,
        "cd \"/app\" && PORT='3000' DEBUG='true' node server.js"
      )
    } finally {
      sshConnectionManager.getClient = originalGetClient
    }
  })

  await t.test('stream error 返回 systemError', async () => {
    const mockClient = new Client()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mockClient as any).exec = (
      _command: string,
      callback: (err: Error | null, stream?: EventEmitter) => void
    ) => {
      const stream = new EventEmitter() as EventEmitter & { stderr: EventEmitter }
      stream.stderr = new EventEmitter()
      callback(null, stream)
      setImmediate(() => {
        stream.emit('data', Buffer.from('partial output'))
      })
      setImmediate(() => {
        stream.emit('error', new Error('stream broken'))
      })
    }

    sshConnectionManager.getClient = () => mockClient
    try {
      const result = await executor.execCommand('lab-7', { command: 'ls' })
      assert.ok(result !== null)
      assert.equal(result!.exitCode, -1)
      assert.equal(result!.systemError, true)
      assert.equal(result!.stderr, 'stream broken')
      assert.ok(result!.stdout.includes('partial output'))
    } finally {
      sshConnectionManager.getClient = originalGetClient
    }
  })
})
