import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from 'ssh2'
import { SshTerminalService } from './SshTerminalService'
import { sshConnectionManager } from './SshConnectionManager'
import type { SshTerminalDataEvent, SshTerminalExitEvent } from '@shared/types/lab'

interface MockShellStream {
  _writtenData: string[]
  _lastWindow: { rows: number; cols: number; height: number; width: number } | null
}

interface MockClientProps {
  _mockShellData?: string
  _mockShellError?: string
  _lastShellWindow?: { cols?: number; rows?: number; term?: string }
  _lastShellStream?: MockShellStream
}

function mockProps(client: Client): MockClientProps {
  return client as unknown as MockClientProps
}

function waitForAsyncEvents(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

test('SshTerminalService', async (t) => {
  const originalGetClient = sshConnectionManager.getClient.bind(sshConnectionManager)
  const originalIsConnected = sshConnectionManager.isConnected.bind(sshConnectionManager)

  t.afterEach(() => {
    sshConnectionManager.getClient = originalGetClient
    sshConnectionManager.isConnected = originalIsConnected
  })

  await t.test('未连接时 openTerminal 返回失败', async () => {
    const service = new SshTerminalService()
    sshConnectionManager.getClient = () => null
    sshConnectionManager.isConnected = () => false

    const result = await service.openTerminal('lab-offline', { cols: 80, rows: 24 })

    assert.equal(result.success, false)
    assert.match(result.error || '', /未连接/)
    service.shutdown()
  })

  await t.test('打开终端后发送输出事件', async () => {
    const service = new SshTerminalService()
    const client = new Client()
    mockProps(client)._mockShellData = 'remote prompt$ '
    const events: SshTerminalDataEvent[] = []

    sshConnectionManager.getClient = () => client
    sshConnectionManager.isConnected = () => true
    service.onData((event) => events.push(event))

    const result = await service.openTerminal('lab-1', { cols: 100, rows: 30 })
    await waitForAsyncEvents()
    await waitForAsyncEvents()

    assert.equal(result.success, true)
    assert.ok(result.sessionId)
    assert.equal(mockProps(client)._lastShellWindow?.term, 'xterm-256color')
    assert.equal(mockProps(client)._lastShellWindow?.cols, 100)
    assert.equal(mockProps(client)._lastShellWindow?.rows, 30)
    assert.equal(events.length, 1)
    assert.equal(events[0].labId, 'lab-1')
    assert.equal(events[0].sessionId, result.sessionId)
    assert.equal(events[0].data, 'remote prompt$ ')
    service.shutdown()
  })

  await t.test('writeTerminal 写入 SSH shell stream', async () => {
    const service = new SshTerminalService()
    const client = new Client()

    sshConnectionManager.getClient = () => client
    sshConnectionManager.isConnected = () => true

    const result = await service.openTerminal('lab-2', { cols: 80, rows: 24 })
    assert.ok(result.sessionId)

    const writeResult = service.writeTerminal(result.sessionId, 'ls -la\r')

    assert.equal(writeResult.success, true)
    assert.deepEqual(mockProps(client)._lastShellStream?._writtenData, ['ls -la\r'])
    service.shutdown()
  })

  await t.test('resizeTerminal 同步终端尺寸', async () => {
    const service = new SshTerminalService()
    const client = new Client()

    sshConnectionManager.getClient = () => client
    sshConnectionManager.isConnected = () => true

    const result = await service.openTerminal('lab-3', { cols: 80, rows: 24 })
    assert.ok(result.sessionId)

    const resizeResult = service.resizeTerminal(result.sessionId, { cols: 120, rows: 40 })

    assert.equal(resizeResult.success, true)
    assert.deepEqual(mockProps(client)._lastShellStream?._lastWindow, {
      rows: 40,
      cols: 120,
      height: 720,
      width: 960
    })
    service.shutdown()
  })

  await t.test('closeTerminal 清理会话并发送 exit 事件', async () => {
    const service = new SshTerminalService()
    const client = new Client()
    const exits: SshTerminalExitEvent[] = []

    sshConnectionManager.getClient = () => client
    sshConnectionManager.isConnected = () => true
    service.onExit((event) => exits.push(event))

    const result = await service.openTerminal('lab-4', { cols: 80, rows: 24 })
    assert.ok(result.sessionId)

    const closeResult = service.closeTerminal(result.sessionId)

    assert.equal(closeResult.success, true)
    assert.equal(exits.length, 1)
    assert.equal(exits[0].sessionId, result.sessionId)
    assert.match(exits[0].reason || '', /客户端关闭/)
    assert.equal(service.writeTerminal(result.sessionId, 'pwd\r').success, false)
    service.shutdown()
  })

  await t.test('SSH 断开时关闭该 lab 的终端会话', async () => {
    const service = new SshTerminalService()
    const client = new Client()
    const exits: SshTerminalExitEvent[] = []

    sshConnectionManager.getClient = () => client
    sshConnectionManager.isConnected = () => true
    service.onExit((event) => exits.push(event))

    const result = await service.openTerminal('lab-5', { cols: 80, rows: 24 })
    assert.ok(result.sessionId)

    service.closeLabTerminals('lab-5', 'SSH 连接已断开')

    assert.equal(exits.length, 1)
    assert.equal(exits[0].sessionId, result.sessionId)
    assert.equal(exits[0].reason, 'SSH 连接已断开')
    assert.equal(service.writeTerminal(result.sessionId, 'pwd\r').success, false)
    service.shutdown()
  })

  // --- readBuffer 模型专用缓冲读取（Task 8）---
  await t.test('readBuffer 不存在的 session 返回 closed', async () => {
    const standalone = new SshTerminalService()
    const r = await standalone.readBuffer('nonexist-session')
    assert.equal(r.closed, true)
    assert.equal(r.data, '')
  })

  await t.test('readBuffer 是 SshTerminalService 的方法', () => {
    const standalone = new SshTerminalService()
    assert.equal(typeof standalone.readBuffer, 'function')
  })
})
