/**
 * writing 同步的 session-files key 生成/解析/校验（纯函数）。
 *
 * key 命名约定：
 * - index:          'writer-index'
 * - assets-manifest: 'writer-assets-{documentId}'（新格式，文档资产块清单）
 * - document:       'writer-doc-{documentId}'
 * - asset:          'writer-asset-{documentId}-{hash}-{ext}'（旧格式，仅 tracker 清理迁移用）
 *
 * 注意：'writer-assets-' 第 13 字符是 's' 而非连字符，与旧 'writer-asset-' 前缀
 * 无嵌套包含；解析顺序仍固定 index → assets-manifest → doc → asset（manifest 先于
 * 更长匹配尝试，参照 knowledge file-manifest 的前缀嵌套教训）。asset 的 fileName
 * （如 abc123.png）嵌入旧 key 时点号替换为连字符，解析时还原。
 */

const INDEX_KEY = 'writer-index'
const ASSETS_MANIFEST_KEY_PREFIX = 'writer-assets-'
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

/** 生成文档资产块清单 key（新格式，存该文档所有资产的 blockId 列表） */
export function makeAssetsManifestKey(documentId: string): string {
  return `${ASSETS_MANIFEST_KEY_PREFIX}${documentId}`
}

/** 生成 asset key（旧格式，fileName 的扩展名点号替换为连字符；仅迁移期清理用） */
export function makeAssetKey(documentId: string, fileName: string): string {
  return `${ASSET_KEY_PREFIX}${documentId}-${fileName.replace('.', '-')}`
}

/** 判断 key 是否属于 writing 同步 */
export function isWriterKey(key: string): boolean {
  return (
    key === INDEX_KEY ||
    key.startsWith(ASSETS_MANIFEST_KEY_PREFIX) ||
    key.startsWith(DOC_KEY_PREFIX) ||
    key.startsWith(ASSET_KEY_PREFIX)
  )
}

export type ParsedWriterKey =
  | { kind: 'index' }
  | { kind: 'assets-manifest'; documentId: string }
  | { kind: 'document'; documentId: string }
  | { kind: 'asset'; documentId: string; fileName: string }

/** 解析 key；非 writing key 或格式非法返回 null */
export function parseWriterKey(key: string): ParsedWriterKey | null {
  if (key === INDEX_KEY) return { kind: 'index' }

  // assets-manifest 先于 doc/asset 匹配（固定顺序，防前缀误判）
  if (key.startsWith(ASSETS_MANIFEST_KEY_PREFIX)) {
    const documentId = key.slice(ASSETS_MANIFEST_KEY_PREFIX.length)
    if (documentId.length > 0 && new RegExp(`^${DOC_ID_PATTERN}$`).test(documentId)) {
      return { kind: 'assets-manifest', documentId }
    }
    return null
  }

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
