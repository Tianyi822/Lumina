import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTarArchive,
  createTarArchiveStream,
  getTarArchiveSize,
  type TarEntry
} from './tarBuilder'

async function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []

  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks)
}

test('createTarArchiveStream 输出与 buildTarArchive 字节一致', async () => {
  const now = 1710000000
  const longPrefix = `src/${'nested/'.repeat(12)}components`
  const entries: TarEntry[] = [
    {
      path: 'src/',
      type: 'directory',
      mode: 0o755,
      mtime: now
    },
    {
      path: 'src/App.vue',
      type: 'file',
      mode: 0o644,
      mtime: now,
      content: '<template>hello</template>'
    },
    {
      path: 'src/empty.txt',
      type: 'file',
      mode: 0o644,
      mtime: now,
      content: ''
    },
    {
      path: 'src/binary.bin',
      type: 'file',
      mode: 0o644,
      mtime: now,
      content: Buffer.from([0, 1, 2, 3, 4, 5, 6])
    },
    {
      path: `${longPrefix}/component-with-a-somewhat-long-name.vue`,
      type: 'file',
      mode: 0o644,
      mtime: now,
      content: '路径超过 100 字节时应使用 tar prefix 字段',
      size: Buffer.byteLength('路径超过 100 字节时应使用 tar prefix 字段', 'utf-8')
    }
  ]

  const archive = buildTarArchive(entries)
  const streamedArchive = await readStream(createTarArchiveStream(entries))

  assert.deepEqual(streamedArchive, archive)
  assert.equal(getTarArchiveSize(entries), archive.length)
})
