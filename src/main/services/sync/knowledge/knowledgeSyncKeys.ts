/**
 * knowledge 同步的 session-files key 生成/解析/校验（纯函数）。
 *
 * key 命名约定：
 * - bases:         'knowledge-bases'
 * - metadata:      'knowledge-metadata'
 * - file:          'knowledge-file-{fileId}'（旧格式，迁移期检测删除）
 * - file-manifest: 'knowledge-file-manifest-{fileId}'（新格式，文件块清单）
 *
 * 注意：file-manifest 前缀是 file 前缀的延伸（knowledge-file-manifest- 也以
 * knowledge-file- 开头），解析/判断时必须先匹配 file-manifest，否则会被误判为 file。
 */

const BASES_KEY = 'knowledge-bases'
const METADATA_KEY = 'knowledge-metadata'
const FILE_KEY_PREFIX = 'knowledge-file-'
const FILE_MANIFEST_KEY_PREFIX = 'knowledge-file-manifest-'
const FILE_ID_PATTERN = '[a-zA-Z0-9-]+'

/** 生成 KB 列表 key */
export function makeBasesKey(): string {
  return BASES_KEY
}

/** 生成文件元数据 key */
export function makeMetadataKey(): string {
  return METADATA_KEY
}

/** 生成文件内容 key（旧格式，仅迁移期检测删除用） */
export function makeFileKey(fileId: string): string {
  return `${FILE_KEY_PREFIX}${fileId}`
}

/** 生成文件块清单 key（新格式，存 blockId 列表） */
export function makeFileManifestKey(fileId: string): string {
  return `${FILE_MANIFEST_KEY_PREFIX}${fileId}`
}

/** 判断 key 是否属于 knowledge 同步 */
export function isKnowledgeKey(key: string): boolean {
  return (
    key === BASES_KEY ||
    key === METADATA_KEY ||
    key.startsWith(FILE_MANIFEST_KEY_PREFIX) ||
    key.startsWith(FILE_KEY_PREFIX)
  )
}

export type ParsedKnowledgeKey =
  | { kind: 'bases' }
  | { kind: 'metadata' }
  | { kind: 'file'; fileId: string }
  | { kind: 'file-manifest'; fileId: string }

/** 解析 key；非 knowledge key 或格式非法返回 null */
export function parseKnowledgeKey(key: string): ParsedKnowledgeKey | null {
  if (key === BASES_KEY) return { kind: 'bases' }
  if (key === METADATA_KEY) return { kind: 'metadata' }

  // file-manifest 必须先于 file 匹配（前缀包含关系）
  if (key.startsWith(FILE_MANIFEST_KEY_PREFIX)) {
    const fileId = key.slice(FILE_MANIFEST_KEY_PREFIX.length)
    if (fileId.length > 0 && new RegExp(`^${FILE_ID_PATTERN}$`).test(fileId)) {
      return { kind: 'file-manifest', fileId }
    }
    return null
  }

  if (key.startsWith(FILE_KEY_PREFIX)) {
    const fileId = key.slice(FILE_KEY_PREFIX.length)
    if (fileId.length > 0 && new RegExp(`^${FILE_ID_PATTERN}$`).test(fileId)) {
      return { kind: 'file', fileId }
    }
    return null
  }

  return null
}
