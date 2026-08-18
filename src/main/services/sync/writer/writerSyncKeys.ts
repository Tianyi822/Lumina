/**
 * writing 同步的 session-files key 生成/解析/校验（纯函数）。
 *
 * key 命名约定：
 * - index:    'writer-index'
 * - document: 'writer-doc-{documentId}'
 * - asset:    'writer-asset-{documentId}-{hash}-{ext}'
 *
 * asset 的 fileName（如 abc123.png）嵌入 key 时点号替换为连字符（abc123-png），
 * 解析时还原；key 须符合服务端 sessionId 正则（中段不允许点号）。
 */

const INDEX_KEY = 'writer-index'
const DOC_KEY_PREFIX = 'writer-doc-'
const ASSET_KEY_PREFIX = 'writer-asset-'
const ASSET_EXT_PATTERN = '(?:png|jpg|webp|gif)'
const ASSET_FILE_PATTERN = `[a-z0-9]+-${ASSET_EXT_PATTERN}`
const DOC_ID_PATTERN = 'writer-[a-z0-9-]+'

/** 生成 index key */
export function makeIndexKey(): string {
  return INDEX_KEY
}

/** 生成文档 key */
export function makeDocKey(documentId: string): string {
  return `${DOC_KEY_PREFIX}${documentId}`
}

/** 生成 asset key（fileName 的扩展名点号替换为连字符） */
export function makeAssetKey(documentId: string, fileName: string): string {
  return `${ASSET_KEY_PREFIX}${documentId}-${fileName.replace('.', '-')}`
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
      // key 内 hash-ext 还原为 hash.ext（磁盘文件名）
      return { kind: 'asset', documentId: match[1], fileName: match[2].replace('-', '.') }
    }
    return null
  }

  return null
}
