/**
 * config 同步 manifest 明文结构 + 序列化（纯函数）。
 *
 * 本设备的 manifest 只描述 config 一个文件（files 恒为 1 项），
 * 为未来 papers/knowledge 预留 files 数组扩展位。
 */
const CONFIG_PATH = 'config.json'

export interface ConfigManifestEntry {
  /** 固定为 'config.json'；为后续数据类型预留扩展位 */
  path: typeof CONFIG_PATH
  /** 该 config 快照生成时的本地 mtime（ISO 8601） */
  mtime: string
  /** 明文字节数 */
  size: number
  /** sha256(明文) hex，内容寻址（明文 hash 保证相同内容复用同一块） */
  blockId: string
}

export interface ConfigManifest {
  schemaVersion: 1
  /** 本设备 manifest 链版本（单调递增，用于 CAS） */
  version: number
  /** 本迭代恒为 1 项 */
  files: ConfigManifestEntry[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

function isConfigManifestEntry(value: unknown): value is ConfigManifestEntry {
  if (!isRecord(value)) return false
  if (value.path !== CONFIG_PATH) return false
  if (typeof value.mtime !== 'string') return false
  if (!isSafeInteger(value.size)) return false
  if (typeof value.blockId !== 'string') return false
  return true
}

/** 创建 config manifest 条目 */
export function createConfigManifestEntry(
  mtime: string,
  size: number,
  blockId: string
): ConfigManifestEntry {
  return { path: CONFIG_PATH, mtime, size, blockId }
}

/** 序列化 manifest 为 UTF-8 字节（2 空格缩进，与 config.json 一致） */
export function serializeManifest(manifest: ConfigManifest): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(manifest, null, 2))
}

/** 反序列化 manifest；校验 schemaVersion、files 非空、entry.path 固定 */
export function parseManifest(bytes: Uint8Array): ConfigManifest {
  const text = new TextDecoder().decode(bytes)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('manifest JSON 解析失败')
  }
  if (!isRecord(parsed)) throw new Error('manifest 结构非法：非对象')
  if (parsed.schemaVersion !== 1) {
    throw new Error(`manifest schemaVersion 非法：${String(parsed.schemaVersion)}`)
  }
  if (!isSafeInteger(parsed.version)) {
    throw new Error('manifest version 非整数')
  }
  if (!Array.isArray(parsed.files) || parsed.files.length === 0) {
    throw new Error('manifest files 为空或非数组')
  }
  // 本迭代约束：files 恒为 1 项
  if (parsed.files.length !== 1) {
    throw new Error(`manifest files 超过 1 项：${parsed.files.length}`)
  }
  const entry = parsed.files[0]
  if (!isConfigManifestEntry(entry)) {
    throw new Error('manifest entry 结构非法')
  }
  return { schemaVersion: 1, version: parsed.version, files: [entry] }
}
