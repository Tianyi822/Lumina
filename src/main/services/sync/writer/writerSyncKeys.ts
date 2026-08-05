/**
 * writing 同步的 session-files key 生成/解析/校验（纯函数）。
 *
 * key 命名约定：
 * - index:    'writer-index'
 * - document: 'writer-doc-{documentId}'
 * - asset:    'writer-asset-{documentId}-{fileName}'
 */

const INDEX_KEY = 'writer-index'
const DOC_KEY_PREFIX = 'writer-doc-'
const ASSET_KEY_PREFIX = 'writer-asset-'
const WRITER_KEY_PREFIX = 'writer-'
const ASSET_EXT_PATTERN = '(?:png|jpg|webp|gif)'
const ASSET_FILE_PATTERN = `[a-z0-9]+\\.${ASSET_EXT_PATTERN}`
const DOC_ID_PATTERN = 'writer-[a-z0-9-]+'

/** 生成 index key */
export function makeIndexKey(): string {
  return INDEX_KEY
}

/** 生成文档 key */
export function makeDocKey(documentId: string): string {
  return `${DOC_KEY_PREFIX}${documentId}`
}

/** 生成 asset key */
export function makeAssetKey(documentId: string, fileName: string): string {
  return `${ASSET_KEY_PREFIX}${documentId}-${fileName}`
}

/** 判断 key 是否属于 writing 同步 */
export function isWriterKey(key: string): boolean {
  return key === INDEX_KEY || key.startsWith(DOC_KEY_PREFIX) || key.startsWith(ASSET_KEY_PREFIX)
}

export type ParsedWriterKey =
  | { kind: 'index' }
  | { kind: 'document'; documentId: string }
  | { kind: 'asset'; documentId: string; fileName: string }

/** 解析 key；非 writing key 或格式非法返回 null */
export function parseWriterKey(key: string): ParsedWriterKey | null {
  if (key === INDEX_KEY) return { kind: 'index' }

  if (key.startsWith(DOC_KEY_PREFIX)) {
    const documentId = key.slice(DOC_KEY_PREFIX.length)
    if (new RegExp(`^${DOC_ID_PATTERN}$`).test(documentId)) {
      return { kind: 'document', documentId }
    }
    return null
  }

  if (key.startsWith(ASSET_KEY_PREFIX)) {
    const rest = key.slice(ASSET_KEY_PREFIX.length)
    const match = rest.match(new RegExp(`^(${DOC_ID_PATTERN})-(${ASSET_FILE_PATTERN})$`))
    if (match) {
      return { kind: 'asset', documentId: match[1], fileName: match[2] }
    }
    return null
  }

  return null
}

/** 测试用：防止未预期导出（knip） */
export const _WRITER_KEY_PREFIX = WRITER_KEY_PREFIX
