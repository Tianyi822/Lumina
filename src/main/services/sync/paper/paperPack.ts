/**
 * paper pack manifest 构建/解析/校验（纯函数 + fs 工具）。
 *
 * manifest 描述一篇论文的大二进制文件集（source.pdf/pages/assets/ocr-normalized/
 * translation/merged.md），每文件切为 ≤ CHUNK_BYTES 的明文块，块加密后经
 * relay blocks 通道传输（blockId = sha256(密文)）。切块逻辑由 shared/chunkFile 提供，
 * paper pack 与 knowledge file 复用。
 */
import { resolve, sep } from 'node:path'
// 重新导出共享切块工具供 paper 内部与测试引用（paper pack / knowledge file 复用）
export { chunkFile } from '../shared/chunkFile'

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
  return path
    .split('/')
    .every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
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
      // isRecord 把 entry 收窄为 Record<string, unknown>，需用局部变量收窄 size 后再做比较
      const size: unknown = entry.size
      if (
        !Number.isSafeInteger(size) ||
        (size as number) < 0 ||
        (size as number) > MAX_PACK_FILE_BYTES
      ) {
        return null
      }
      if (typeof entry.sha256 !== 'string' || !HEX_64.test(entry.sha256)) return null
      if (!Array.isArray(entry.blockIds)) return null
      if ((size as number) > 0 && entry.blockIds.length === 0) return null
      for (const id of entry.blockIds) {
        if (typeof id !== 'string' || !HEX_64.test(id)) return null
      }
    }
    return value as unknown as PaperPackManifest
  } catch {
    return null
  }
}

/** 过滤远端 manifest 中已停止同步的文件（页图自 2026-08 起不再上传/下载） */
export function filterPaperPackManifest(manifest: PaperPackManifest): PaperPackManifest {
  return { ...manifest, files: manifest.files.filter((file) => !file.path.startsWith('pages/')) }
}
