import { Readable } from 'stream'

/**
 * POSIX tar 格式构建工具
 * 纯函数，不依赖任何服务状态
 */

export interface TarEntry {
  path: string
  type: 'file' | 'directory'
  mode: number
  mtime: number
  /** 文件内容。字符串按 UTF-8 写入 tar。 */
  content?: Buffer | string
  /** 内容字节数；传字符串内容时可避免重复计算。 */
  size?: number
}

/**
 * 根据条目列表构建 tar archive Buffer
 */
export function buildTarArchive(entries: TarEntry[]): Buffer {
  const chunks: Buffer[] = []

  for (const entry of entries) {
    chunks.push(createTarHeader(entry))

    if (entry.type === 'file' && entry.content !== undefined) {
      const content = toContentBuffer(entry.content)
      chunks.push(content)
      const paddingSize = (512 - (getContentByteLength(entry) % 512)) % 512
      if (paddingSize > 0) {
        chunks.push(Buffer.alloc(paddingSize))
      }
    }
  }

  // 两个 512 字节零块标记归档结束
  chunks.push(Buffer.alloc(1024))
  return Buffer.concat(chunks)
}

/**
 * 根据条目列表构建 tar archive 流，避免提前 Buffer.concat 整个归档。
 */
export function createTarArchiveStream(entries: TarEntry[]): NodeJS.ReadableStream {
  return Readable.from(createTarArchiveChunks(entries), { objectMode: false })
}

/**
 * 计算 tar archive 总字节数，用于日志和进度展示。
 */
export function getTarArchiveSize(entries: TarEntry[]): number {
  let size = 1024

  for (const entry of entries) {
    size += 512
    if (entry.type === 'file' && entry.content !== undefined) {
      const contentSize = getContentByteLength(entry)
      size += contentSize + ((512 - (contentSize % 512)) % 512)
    }
  }

  return size
}

function* createTarArchiveChunks(entries: TarEntry[]): Generator<Buffer> {
  for (const entry of entries) {
    yield createTarHeader(entry)

    if (entry.type === 'file' && entry.content !== undefined) {
      yield toContentBuffer(entry.content)
      const paddingSize = (512 - (getContentByteLength(entry) % 512)) % 512
      if (paddingSize > 0) {
        yield Buffer.alloc(paddingSize)
      }
    }
  }

  yield Buffer.alloc(1024)
}

/**
 * 创建单个 tar 头部（512 字节）
 */
export function createTarHeader(entry: TarEntry): Buffer {
  const header = Buffer.alloc(512, 0)
  const { name, prefix } = splitTarPath(entry.path)
  const size = entry.type === 'file' ? getContentByteLength(entry) : 0

  writeTarString(header, name, 0, 100)
  writeTarOctal(header, entry.mode || (entry.type === 'directory' ? 0o755 : 0o644), 100, 8)
  writeTarOctal(header, 0, 108, 8)
  writeTarOctal(header, 0, 116, 8)
  writeTarOctal(header, size, 124, 12)
  writeTarOctal(header, entry.mtime, 136, 12)

  header.fill(0x20, 148, 156)
  header[156] = entry.type === 'directory' ? '5'.charCodeAt(0) : '0'.charCodeAt(0)

  writeTarString(header, 'ustar', 257, 6)
  writeTarString(header, '00', 263, 2)
  writeTarString(header, 'root', 265, 32)
  writeTarString(header, 'root', 297, 32)

  if (prefix) {
    writeTarString(header, prefix, 345, 155)
  }

  const checksum = header.reduce((sum, value) => sum + value, 0)
  writeTarChecksum(header, checksum)

  return header
}

function getContentByteLength(entry: TarEntry): number {
  if (entry.size !== undefined) return entry.size
  if (entry.content === undefined) return 0
  if (Buffer.isBuffer(entry.content)) return entry.content.length
  return Buffer.byteLength(entry.content, 'utf-8')
}

function toContentBuffer(content: Buffer | string): Buffer {
  return Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8')
}

/**
 * 按 tar 规范拆分路径（name + prefix 模式）
 */
export function splitTarPath(filePath: string): { name: string; prefix?: string } {
  if (Buffer.byteLength(filePath) <= 100) {
    return { name: filePath }
  }

  const isDirectory = filePath.endsWith('/')
  const trimmedPath = isDirectory ? filePath.slice(0, -1) : filePath
  const segments = trimmedPath.split('/')
  const fileName = segments.pop()

  if (!fileName) {
    throw new Error(`无法创建 tar 条目路径: ${filePath}`)
  }

  const name = isDirectory ? `${fileName}/` : fileName
  const prefix = segments.join('/')

  if (Buffer.byteLength(name) > 100 || Buffer.byteLength(prefix) > 155) {
    throw new Error(`tar 条目路径过长: ${filePath}`)
  }

  return { name, prefix }
}

/**
 * 写入 tar 字符串字段
 */
function writeTarString(buffer: Buffer, value: string, offset: number, length: number): void {
  buffer.write(value, offset, Math.min(length, Buffer.byteLength(value)), 'utf-8')
}

/**
 * 写入 tar 八进制字段（以 '\0' 结尾）
 */
function writeTarOctal(buffer: Buffer, value: number, offset: number, length: number): void {
  const octal = Math.max(0, Math.floor(value)).toString(8)
  const padded = octal.padStart(length - 1, '0')
  buffer.write(`${padded}\0`, offset, length, 'ascii')
}

/**
 * 写入 tar 校验和字段（6 位八进制 + '\0' + ' '）
 */
function writeTarChecksum(buffer: Buffer, checksum: number): void {
  const padded = checksum.toString(8).padStart(6, '0')
  buffer.write(`${padded}\0 `, 148, 8, 'ascii')
}
