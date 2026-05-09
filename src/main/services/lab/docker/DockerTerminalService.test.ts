import test from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'stream'
import { DockerTerminalService } from './DockerTerminalService'
import type { DockerTerminalDataEvent, DockerTerminalExitEvent } from '@shared/types/lab'

interface DockerTerminalTestHarness {
  service: DockerTerminalService
  stream: PassThrough & { writtenData: string[] }
  state: {
    running: boolean
    execOptions: unknown
    startOptions: unknown
    resizeOptions: unknown
  }
}

function createHarness(running = true): DockerTerminalTestHarness {
  const stream = new PassThrough() as PassThrough & { writtenData: string[] }
  stream.writtenData = []
  stream.write = ((chunk: string | Buffer): boolean => {
    stream.writtenData.push(Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : chunk)
    return true
  }) as typeof stream.write

  const state = {
    running,
    execOptions: null as unknown,
    startOptions: null as unknown,
    resizeOptions: null as unknown
  }

  const exec = {
    start: async (options: unknown) => {
      state.startOptions = options
      return stream
    },
    resize: async (options: unknown) => {
      state.resizeOptions = options
      return {}
    }
  }
  const container = {
    inspect: async () => ({
      State: { Running: state.running },
      Config: { WorkingDir: '/workspace' }
    }),
    exec: async (options: unknown) => {
      state.execOptions = options
      return exec
    }
  }
  const docker = {
    getContainer: () => container
  }

  return {
    service: new DockerTerminalService({
      getDocker: () => docker
    } as never),
    stream,
    state
  }
}

test('DockerTerminalService', async (t) => {
  await t.test('容器未运行时 openTerminal 返回失败', async () => {
    const { service } = createHarness(false)

    const result = await service.openTerminal('container-offline', { cols: 80, rows: 24 })

    assert.equal(result.success, false)
    assert.match(result.error || '', /未运行/)
    service.shutdown()
  })

  await t.test('打开终端后发送输出事件', async () => {
    const { service, stream, state } = createHarness()
    const events: DockerTerminalDataEvent[] = []
    service.onData((event) => events.push(event))

    const result = await service.openTerminal('container-1', { cols: 100, rows: 30 })
    stream.emit('data', Buffer.from('root@container:/workspace# '))

    assert.equal(result.success, true)
    assert.ok(result.sessionId)
    assert.deepEqual(state.execOptions, {
      Cmd: ['sh', '-lc', 'if command -v bash >/dev/null 2>&1; then exec bash -l; else exec sh; fi'],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      ConsoleSize: [30, 100],
      WorkingDir: '/workspace'
    })
    assert.deepEqual(state.startOptions, {
      hijack: true,
      stdin: true,
      Tty: true
    })
    assert.equal(events.length, 1)
    assert.equal(events[0].containerId, 'container-1')
    assert.equal(events[0].sessionId, result.sessionId)
    assert.equal(events[0].data, 'root@container:/workspace# ')
    service.shutdown()
  })

  await t.test('writeTerminal 写入 Docker exec stream', async () => {
    const { service, stream } = createHarness()

    const result = await service.openTerminal('container-2', { cols: 80, rows: 24 })
    assert.ok(result.sessionId)

    const writeResult = service.writeTerminal(result.sessionId, 'pwd\r')

    assert.equal(writeResult.success, true)
    assert.deepEqual(stream.writtenData, ['pwd\r'])
    service.shutdown()
  })

  await t.test('resizeTerminal 同步 exec 尺寸', async () => {
    const { service, state } = createHarness()

    const result = await service.openTerminal('container-3', { cols: 80, rows: 24 })
    assert.ok(result.sessionId)

    const resizeResult = await service.resizeTerminal(result.sessionId, { cols: 120, rows: 40 })

    assert.equal(resizeResult.success, true)
    assert.deepEqual(state.resizeOptions, { h: 40, w: 120 })
    service.shutdown()
  })

  await t.test('closeTerminal 清理会话并发送 exit 事件', async () => {
    const { service } = createHarness()
    const exits: DockerTerminalExitEvent[] = []
    service.onExit((event) => exits.push(event))

    const result = await service.openTerminal('container-4', { cols: 80, rows: 24 })
    assert.ok(result.sessionId)

    const closeResult = service.closeTerminal(result.sessionId)

    assert.equal(closeResult.success, true)
    assert.equal(exits.length, 1)
    assert.equal(exits[0].sessionId, result.sessionId)
    assert.match(exits[0].reason || '', /客户端关闭/)
    assert.equal(service.writeTerminal(result.sessionId, 'pwd\r').success, false)
    service.shutdown()
  })
})
