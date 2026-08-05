/**
 * knowledge 同步的 session-files key 生成/解析/校验（纯函数）。
 *
 * key 命名约定：
 * - bases:    'knowledge-bases'
 * - metadata: 'knowledge-metadata'
 * - file:     'knowledge-file-{fileId}'
 */

const BASES_KEY = 'knowledge-bases'
const METADATA_KEY = 'knowledge-metadata'
const FILE_KEY_PREFIX = 'knowledge-file-'
const FILE_ID_PATTERN = '[a-zA-Z0-9-]+'

/** 生成 KB 列表 key */
export function makeBasesKey(): string {
  return BASES_KEY
}

/** 生成文件元数据 key */
export function makeMetadataKey(): string {
  return METADATA_KEY
}

/** 生成文件内容 key */
export function makeFileKey(fileId: string): string {
  return `${FILE_KEY_PREFIX}${fileId}`
}

/** 判断 key 是否属于 knowledge 同步 */
export function isKnowledgeKey(key: string): boolean {
  return key === BASES_KEY || key === METADATA_KEY || key.startsWith(FILE_KEY_PREFIX)
}

export type ParsedKnowledgeKey =
  | { kind: 'bases' }
  | { kind: 'metadata' }
  | { kind: 'file'; fileId: string }

/** 解析 key；非 knowledge key 或格式非法返回 null */
export function parseKnowledgeKey(key: string): ParsedKnowledgeKey | null {
  if (key === BASES_KEY) return { kind: 'bases' }
  if (key === METADATA_KEY) return { kind: 'metadata' }

  if (key.startsWith(FILE_KEY_PREFIX)) {
    const fileId = key.slice(FILE_KEY_PREFIX.length)
    if (fileId.length > 0 && new RegExp(`^${FILE_ID_PATTERN}$`).test(fileId)) {
      return { kind: 'file', fileId }
    }
    return null
  }

  return null
}
