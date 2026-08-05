/**
 * paper pack manifest 构建/解析/校验与流式切块（纯函数 + fs 工具）。
 *
 * manifest 描述一篇论文的大二进制文件集（source.pdf/pages/assets/ocr-normalized/
 * translation/merged.md），每文件切为 ≤ PACK_CHUNK_BYTES 的明文块，块加密后经
 * relay blocks 通道传输（blockId = sha256(密文)）。
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, sep } from 'node:path'

/** 明文块上限：1MiB - 64B（预留 AEAD nonce24+tag16 开销，保证密文 ≤ relay maxBlockBytes=1MiB） */
export const PACK_CHUNK_BYTES = 1024 * 1024 - 64

/** pack 单文件大小硬上限（对齐 createPaper 的 200MB 限制） */
const MAX_PACK_FILE_BYTES = 200 * 1024 * 1024

export interface PaperPackFileEntry {
  /** 相对论文目录的正斜杠路径 */
  path: string
  size: number
  /** 明文 sha256 */
  sha256: string
  /** 每块 blockId = sha256(密文块) */
  blockIds: string[]
}

export interface PaperPackManifest {
  schemaVersion: 1
  paperId: string
  updatedAt: string
  files: PaperPackFileEntry[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const HEX_64 = /^[a-f0-9]{64}$/

/**
 * 防路径注入（防纵深）：解析同步来源的路径，要求必须落在 baseDir 内。
 * 拒绝 `..` 逃逸与指向目录外的绝对路径；不合法返回 null。
 */
export function resolveContainedPath(baseDir: string, targetPath: string): string | null {
  const base = resolve(baseDir)
  const resolved = resolve(base, targetPath)
  if (resolved === base || !resolved.startsWith(base + sep)) return null
  return resolved
}

/** manifest 相对路径合法性：正斜杠分隔、无 `.`/`..` 段、非绝对路径、无反斜杠 */
export function isValidPackRelPath(path: string): boolean {
  if (path.length === 0 || path.includes('\\')) return false
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return false
  return path.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
}

/** 解析并校验 manifest（JSON 字符串）；任何字段非法返回 null */
export function parsePaperPackManifest(json: string): PaperPackManifest | null {
  try {
    const value: unknown = JSON.parse(json)
    if (!isRecord(value) || value.schemaVersion !== 1) return null
    if (typeof value.paperId !== 'string' || value.paperId.length === 0) return null
    if (typeof value.updatedAt !== 'string') return null
    if (!Array.isArray(value.files)) return null
    for (const entry of value.files) {
      if (!isRecord(entry)) return null
      if (typeof entry.path !== 'string' || !isValidPackRelPath(entry.path)) return null
      if (!Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > MAX_PACK_FILE_BYTES) {
        return null
      }
      if (typeof entry.sha256 !== 'string' || !HEX_64.test(entry.sha256)) return null
      if (!Array.isArray(entry.blockIds)) return null
      if (entry.size > 0 && entry.blockIds.length === 0) return null
      for (const id of entry.blockIds) {
        if (typeof id !== 'string' || !HEX_64.test(id)) return null
      }
    }
    return value as unknown as PaperPackManifest
  } catch {
    return null
  }
}

/**
 * 流式读取文件并按 PACK_CHUNK_BYTES 切块，逐块回调明文（供加密上传）。
 * 返回总块数、文件 sha256 与大小；超过 200MB 抛异常。
 */
export async function chunkFile(
  filePath: string,
  onChunk: (chunk: Uint8Array, index: number) => Promise<void>
): Promise<{ chunks: number; sha256: string; size: number }> {
  const st = await stat(filePath)
  if (st.size > MAX_PACK_FILE_BYTES) {
    throw new Error(`pack 文件超过 200MB 上限：${filePath}`)
  }
  const hash = createHash('sha256')
  let chunks = 0
  let buffer: Buffer = Buffer.alloc(0)
  for await (const data of createReadStream(filePath)) {
    buffer = Buffer.concat([buffer, data as Buffer])
    while (buffer.length >= PACK_CHUNK_BYTES) {
      const chunk = buffer.subarray(0, PACK_CHUNK_BYTES)
      buffer = buffer.subarray(PACK_CHUNK_BYTES)
      hash.update(chunk)
      await onChunk(new Uint8Array(chunk), chunks)
      chunks++
    }
  }
  if (buffer.length > 0) {
    hash.update(buffer)
    await onChunk(new Uint8Array(buffer), chunks)
    chunks++
  }
  return { chunks, sha256: hash.digest('hex'), size: st.size }
}
