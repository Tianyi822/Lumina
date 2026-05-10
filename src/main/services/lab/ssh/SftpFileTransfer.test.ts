import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { SftpFileTransfer } from './SftpFileTransfer'
import { sshConnectionManager } from './SshConnectionManager'
import { Client } from 'ssh2'
import type { FileWriteRequest } from '@shared/types/lab'

interface MockSftpStream extends EventEmitter {
  end(content: string): void
}

interface MockSftpClient {
  createWriteStream(filePath: string): MockSftpStream
  mkdir(
    dirPath: string,
    optionsOrCb: unknown,
    maybeCb?: (err?: { code: number } | null) => void
  ): void
  end(): void
}

interface MockClientProps {
  _mockSftpError?: string
  _mockMkdirError?: number
}

function mockClientProps(client: Client): MockClientProps {
  return client as unknown as MockClientProps
}

function setSftp(
  client: Client,
  fn: (callback: (err: Error | null, sftp?: MockSftpClient) => void) => void
): void {
  ;(client as unknown as { sftp: typeof fn }).sftp = fn
}

function createMockSftp(overrides?: {
  writeError?: string
  mkdirError?: number
  capturePath?: { current: string }
  createdDirs?: string[]
  failOnFile?: number
}): MockSftpClient {
  const self = overrides
  let writeCount = 0
  return {
    createWriteStream: (filePath: string): MockSftpStream => {
      if (self?.capturePath) self.capturePath.current = filePath
      writeCount++
      const shouldError =
        self?.writeError != null ||
        (self?.failOnFile !== undefined && writeCount === self.failOnFile)
      const errMsg = self?.writeError || 'disk full'
      const stream = new EventEmitter() as MockSftpStream
      stream.end = () => {
        if (shouldError) {
          setImmediate(() => stream.emit('error', new Error(errMsg)))
        } else {
          setImmediate(() => stream.emit('close'))
        }
      }
      return stream
    },
    mkdir: (
      dirPath: string,
      optionsOrCb: unknown,
      maybeCb?: (err?: { code: number } | null) => void
    ) => {
      const cb = typeof optionsOrCb === 'function' ? optionsOrCb : maybeCb
      if (self?.createdDirs) self.createdDirs.push(dirPath)
      if (self?.mkdirError) {
        setImmediate(() => cb?.({ code: self.mkdirError }))
      } else {
        setImmediate(() => cb?.(null))
      }
    },
    end: () => {}
  }
}

test('SftpFileTransfer', async (t) => {
  const transfer = new SftpFileTransfer()
  const originalGetClient = sshConnectionManager.getClient.bind(sshConnectionManager)

  await t.test('文件列表为空时返回错误', async () => {
    const mockClient = new Client()
    sshConnectionManager.getClient = () => mockClient
    try {
      const result = await transfer.writeFiles('lab-1', [], '/app')
      assert.equal(result.success, false)
      assert.ok(result.error!.includes('文件列表为空'))
      assert.equal(result.writtenCount, 0)
    } finally {
      sshConnectionManager.getClient = originalGetClient
    }
  })

  await t.test('files 为 undefined 时返回错误', async () => {
    const mockClient = new Client()
    sshConnectionManager.getClient = () => mockClient
    try {
      const result = await transfer.writeFiles(
        'lab-1',
        undefined as unknown as FileWriteRequest[],
        '/app'
      )
      assert.equal(result.success, false)
      assert.ok(result.error!.includes('文件列表为空'))
    } finally {
      sshConnectionManager.getClient = originalGetClient
    }
  })

  await t.test('SSH 未连接时返回错误', async () => {
    sshConnectionManager.getClient = () => null
    try {
      const result = await transfer.writeFiles('lab-1', [{ path: 'a.txt', content: 'hello' }])
      assert.equal(result.success, false)
      assert.ok(result.error!.includes('SSH 客户端未连接'))
      assert.equal(result.writtenCount, 0)
    } finally {
      sshConnectionManager.getClient = originalGetClient
    }
  })

  await t.test('sftp 建立失败时返回错误', async () => {
    const mockClient = new Client()
    mockClientProps(mockClient)._mockSftpError = 'sftp subsystem not available'

    sshConnectionManager.getClient = () => mockClient
    try {
      const result = await transfer.writeFiles('lab-1', [{ path: 'test.txt', content: 'data' }])
      assert.equal(result.success, false)
      assert.ok(result.error!.includes('sftp subsystem not available'))
    } finally {
      sshConnectionManager.getClient = originalGetClient
    }
  })

  await t.test('正常写入单个文件返回成功', async () => {
    const mockClient = new Client()

    sshConnectionManager.getClient = () => mockClient
    try {
      const result = await transfer.writeFiles('lab-1', [
        { path: 'hello.txt', content: 'hello world' }
      ])
      assert.equal(result.success, true)
      assert.equal(result.writtenCount, 1)
    } finally {
      sshConnectionManager.getClient = originalGetClient
    }
  })

  await t.test('写入失败时返回错误详情', async () => {
    const mockClient = new Client()
    const mockSftp = createMockSftp({ writeError: 'permission denied' })
    setSftp(mockClient, (callback: (err: Error | null, sftp?: MockSftpClient) => void) => {
      setImmediate(() => callback(null, mockSftp))
    })

    sshConnectionManager.getClient = () => mockClient
    try {
      const result = await transfer.writeFiles('lab-1', [
        { path: 'protected.txt', content: 'secret' }
      ])
      assert.equal(result.success, false)
      assert.equal(result.writtenCount, 0)
      assert.deepEqual(result.failedFiles, ['/app/protected.txt'])
      const details = result.failedFileDetails
      assert.ok(details)
      assert.ok(details.length > 0)
      assert.ok(details[0].error!.includes('permission denied'))
    } finally {
      sshConnectionManager.getClient = originalGetClient
    }
  })

  await t.test('路径以 projectRoot 为前缀', async () => {
    const mockClient = new Client()
    const capturePath = { current: '' }
    const mockSftp = createMockSftp({ capturePath })
    setSftp(mockClient, (callback: (err: Error | null, sftp?: MockSftpClient) => void) => {
      setImmediate(() => callback(null, mockSftp))
    })

    sshConnectionManager.getClient = () => mockClient
    try {
      await transfer.writeFiles('lab-1', [{ path: 'src/main.ts', content: 'code' }], '/workspace')
      assert.equal(capturePath.current, '/workspace/src/main.ts')
    } finally {
      sshConnectionManager.getClient = originalGetClient
    }
  })

  await t.test('projectRoot 不以 / 开头时自动添加', async () => {
    const mockClient = new Client()
    const capturePath = { current: '' }
    const mockSftp = createMockSftp({ capturePath })
    setSftp(mockClient, (callback: (err: Error | null, sftp?: MockSftpClient) => void) => {
      setImmediate(() => callback(null, mockSftp))
    })

    sshConnectionManager.getClient = () => mockClient
    try {
      await transfer.writeFiles('lab-1', [{ path: 'app.js', content: 'code' }], 'home/user')
      assert.equal(capturePath.current, '/home/user/app.js')
    } finally {
      sshConnectionManager.getClient = originalGetClient
    }
  })

  await t.test('自动创建中间目录', async () => {
    const mockClient = new Client()
    const createdDirs: string[] = []
    const mockSftp = createMockSftp({ createdDirs })
    setSftp(mockClient, (callback: (err: Error | null, sftp?: MockSftpClient) => void) => {
      setImmediate(() => callback(null, mockSftp))
    })

    sshConnectionManager.getClient = () => mockClient
    try {
      await transfer.writeFiles('lab-1', [{ path: 'deep/nested/file.txt', content: 'data' }])
      assert.ok(createdDirs.includes('/app'))
      assert.ok(createdDirs.includes('/app/deep'))
      assert.ok(createdDirs.includes('/app/deep/nested'))
    } finally {
      sshConnectionManager.getClient = originalGetClient
    }
  })

  await t.test('创建目录权限不足时静默忽略', async () => {
    const mockClient = new Client()
    let mkdirCalled = false
    const mockSftp = createMockSftp({ mkdirError: 3 })
    mockSftp.mkdir = (
      _dirPath: string,
      optionsOrCb: unknown,
      maybeCb?: (err?: { code: number } | null) => void
    ) => {
      mkdirCalled = true
      const cb = typeof optionsOrCb === 'function' ? optionsOrCb : maybeCb
      setImmediate(() => cb?.({ code: 3 }))
    }
    setSftp(mockClient, (callback: (err: Error | null, sftp?: MockSftpClient) => void) => {
      setImmediate(() => callback(null, mockSftp))
    })

    sshConnectionManager.getClient = () => mockClient
    try {
      const result = await transfer.writeFiles('lab-1', [
        { path: 'readonly/file.txt', content: 'data' }
      ])
      assert.ok(mkdirCalled)
      assert.equal(result.success, true)
      assert.equal(result.writtenCount, 1)
    } finally {
      sshConnectionManager.getClient = originalGetClient
    }
  })

  await t.test('批量写入多文件', async () => {
    const mockClient = new Client()

    sshConnectionManager.getClient = () => mockClient
    try {
      const result = await transfer.writeFiles('lab-1', [
        { path: 'a.txt', content: 'aaa' },
        { path: 'b.txt', content: 'bbb' },
        { path: 'c.txt', content: 'ccc' }
      ])
      assert.equal(result.success, true)
      assert.equal(result.writtenCount, 3)
    } finally {
      sshConnectionManager.getClient = originalGetClient
    }
  })

  await t.test('部分成功时返回失败详情', async () => {
    const mockClient = new Client()
    const mockSftp = createMockSftp({ failOnFile: 2 })
    setSftp(mockClient, (callback: (err: Error | null, sftp?: MockSftpClient) => void) => {
      setImmediate(() => callback(null, mockSftp))
    })

    sshConnectionManager.getClient = () => mockClient
    try {
      const result = await transfer.writeFiles('lab-1', [
        { path: 'ok.txt', content: 'ok' },
        { path: 'fail.txt', content: 'fail' },
        { path: 'also-ok.txt', content: 'also ok' }
      ])
      assert.equal(result.success, false)
      assert.equal(result.writtenCount, 2)
      assert.ok(result.failedFiles!.includes('/app/fail.txt'))
    } finally {
      sshConnectionManager.getClient = originalGetClient
    }
  })

  await t.test('onProgress 回调被调用', async () => {
    const mockClient = new Client()
    const progressMessages: string[] = []
    const onProgress = (message: string): void => progressMessages.push(message)

    sshConnectionManager.getClient = () => mockClient
    try {
      await transfer.writeFiles('lab-1', [{ path: 'log.txt', content: 'log' }], '/app', onProgress)
      assert.ok(progressMessages.some((m) => m.includes('准备写入')))
      assert.ok(progressMessages.some((m) => m.includes('写入完成')))
    } finally {
      sshConnectionManager.getClient = originalGetClient
    }
  })
})
