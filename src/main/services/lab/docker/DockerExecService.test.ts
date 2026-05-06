import test from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'stream'
import { DockerExecService } from './DockerExecService'

function createMultiplexFrame(streamType: 1 | 2, payload: string): Buffer {
  const content = Buffer.from(payload)
  const header = Buffer.alloc(8)
  header[0] = streamType
  header.writeUInt32BE(content.length, 4)
  return Buffer.concat([header, content])
}

test('DockerExecService demux 后 stdout/stderr 不包含 Docker stream 控制字节', async () => {
  const stream = new PassThrough()
  const exec = {
    start: async () => stream,
    inspect: async () => ({ ExitCode: 2 })
  }
  const container = {
    exec: async () => exec
  }
  const docker = {
    getContainer: () => container,
    modem: {
      demuxStream: (source: PassThrough, stdout: PassThrough, stderr: PassThrough) => {
        source.on('data', (chunk: Buffer) => {
          let offset = 0
          while (offset + 8 <= chunk.length) {
            const streamType = chunk[offset]
            const size = chunk.readUInt32BE(offset + 4)
            const payload = chunk.subarray(offset + 8, offset + 8 + size)
            if (streamType === 1) {
              stdout.write(payload)
            } else if (streamType === 2) {
              stderr.write(payload)
            }
            offset += 8 + size
          }
        })
        source.on('end', () => {
          stdout.end()
          stderr.end()
        })
      }
    }
  }

  const service = new DockerExecService({
    getDocker: () => docker
  } as never)

  const resultPromise = service.execCommand('container-1', {
    command: 'printf ok && printf fail >&2',
    timeout: 1
  })

  stream.write(createMultiplexFrame(1, 'ok\n'))
  stream.write(createMultiplexFrame(2, 'fail\n'))
  stream.end()

  const result = await resultPromise

  assert.equal(result?.exitCode, 2)
  assert.equal(result?.stdout, 'ok\n')
  assert.equal(result?.stderr, 'fail\n')
  assert.equal(result?.stdout.includes('\u0001'), false)
  assert.equal(result?.stderr.includes('\u0002'), false)
})
