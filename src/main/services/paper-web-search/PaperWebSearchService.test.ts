import { describe, it, mock, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import childProcess from 'node:child_process'

const PYTHON_VERSION_STDOUT = Buffer.from('Python 3.10.0\n')
const DEPS_OK_STDOUT = Buffer.from('isolated\n')

mock.method(childProcess, 'exec', (_cmd: string, _opts: unknown, callback: (err: Error | null, result: { stdout: Buffer }) => void) => {
  if (typeof callback === 'function') {
    callback(null, { stdout: PYTHON_VERSION_STDOUT })
  }
})

mock.method(childProcess, 'spawn', () => {
  const EventEmitter = require('node:events')
  const emitter = new EventEmitter()

  const proc = {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: { write: () => {}, end: () => {} },
    on: emitter.on.bind(emitter),
    emit: emitter.emit.bind(emitter)
  }

  proc.stdout.on = (_event: string, handler: (data: Buffer) => void) => {
    handler(Buffer.from(JSON.stringify({
      success: true,
      query: 'test',
      quality: 'high',
      results: [],
      totalDiscovered: 0,
      totalCrawled: 0,
      totalRetained: 0,
      elapsedMs: 0
    })))
  }

  setImmediate(() => {
    proc.emit('close', 0)
  })

  return proc
})

import { PaperWebSearchService } from './PaperWebSearchService.ts'

describe('PaperWebSearchService', () => {
  afterEach(() => {
    mock.reset()
  })

  it('checkEnvironment 返回环境检测结果', async () => {
    const service = new PaperWebSearchService()
    const result = await service.checkEnvironment()

    assert.ok(typeof result.available === 'boolean')
    assert.equal(result.available, true)
    assert.ok('executable' in result)
    assert.ok('runtime' in result)
    assert.ok('version' in result)
  })

  it('checkEnvironment 第二次调用使用缓存', async () => {
    const service = new PaperWebSearchService()

    const first = await service.checkEnvironment()
    const second = await service.checkEnvironment()

    assert.equal(first, second)
  })

  it('clearEnvironmentCache 后重新检测', async () => {
    const service = new PaperWebSearchService()

    const first = await service.checkEnvironment()
    service.clearEnvironmentCache()
    const second = await service.checkEnvironment()

    assert.notEqual(first, second)
  })
})
