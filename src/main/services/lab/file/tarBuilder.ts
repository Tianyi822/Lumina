/**
 * POSIX tar 格式构建工具
 * 纯函数，不依赖任何服务状态
 */

export interface TarEntry {
  path: string
  type: 'file' | 'directory'
  mode: number
  mtime: number
  content?: Buffer
}

/**
 * 根据条目列表构建 tar archive Buffer
 */
export function buildTarArchive(entries: TarEntry[]): Buffer {
  const chunks: Buffer[] = []

  for (const entry of entries) {
    chunks.push(createTarHeader(entry))

    if (entry.type === 'file' && entry.content) {
      chunks.push(entry.content)
      const paddingSize = (512 - (entry.content.length % 512)) % 512
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
 * 创建单个 tar 头部（512 字节）
 */
export function createTarHeader(entry: TarEntry): Buffer {
  const header = Buffer.alloc(512, 0)
  const { name, prefix } = splitTarPath(entry.path)
  const size = entry.type === 'file' ? entry.content?.length || 0 : 0

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
