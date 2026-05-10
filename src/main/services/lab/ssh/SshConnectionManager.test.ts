import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from 'ssh2'
import { sshConnectionManager } from './SshConnectionManager'

interface MockClientPrototype {
  _mockConnectError?: string
  _mockConnectReady?: boolean
}

function mockClientPrototype(): MockClientPrototype {
  return (Client as unknown as { prototype: MockClientPrototype }).prototype
}

test('SshConnectionManager 初始连接错误会返回失败', async (t) => {
  const prototype = mockClientPrototype()
  prototype._mockConnectError = 'auth failed'

  t.after(async () => {
    delete prototype._mockConnectError
    await sshConnectionManager.disconnectAll()
  })

  const result = await sshConnectionManager.connect('lab-initial-error', {
    host: '127.0.0.1',
    port: 22,
    username: 'root'
  })

  assert.equal(result.success, false)
  assert.match(result.error || '', /auth failed/)
  assert.equal(sshConnectionManager.getStatus('lab-initial-error'), 'disconnected')
})
