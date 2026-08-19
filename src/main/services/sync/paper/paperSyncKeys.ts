/**
 * paper 同步的 session-files key 生成/解析/校验（纯函数）。
 *
 * key 命名约定：
 * - meta:        'paper-meta-{paperId}'
 * - annotations: 'paper-annotations-{paperId}'
 * - pack:        'paper-pack-{paperId}'
 */

const META_KEY_PREFIX = 'paper-meta-'
const ANNOTATIONS_KEY_PREFIX = 'paper-annotations-'
const PACK_KEY_PREFIX = 'paper-pack-'
const PAPER_ID_PATTERN = '[a-zA-Z0-9-]+'

/** 生成论文元信息 key */
export function makePaperMetaKey(paperId: string): string {
  return `${META_KEY_PREFIX}${paperId}`
}

/** 生成论文批注 key */
export function makePaperAnnotationsKey(paperId: string): string {
  return `${ANNOTATIONS_KEY_PREFIX}${paperId}`
}

/** 生成论文 pack manifest key */
export function makePaperPackKey(paperId: string): string {
  return `${PACK_KEY_PREFIX}${paperId}`
}

/** 判断 key 是否属于 paper 同步 */
export function isPaperKey(key: string): boolean {
  return (
    key.startsWith(META_KEY_PREFIX) ||
    key.startsWith(ANNOTATIONS_KEY_PREFIX) ||
    key.startsWith(PACK_KEY_PREFIX)
  )
}

export type ParsedPaperKey =
  | { kind: 'meta'; paperId: string }
  | { kind: 'annotations'; paperId: string }
  | { kind: 'pack'; paperId: string }

/** 解析 key；非 paper key 或格式非法返回 null */
export function parsePaperKey(key: string): ParsedPaperKey | null {
  const prefixes = [
    [META_KEY_PREFIX, 'meta'],
    [ANNOTATIONS_KEY_PREFIX, 'annotations'],
    [PACK_KEY_PREFIX, 'pack']
  ] as const
  for (const [prefix, kind] of prefixes) {
    if (!key.startsWith(prefix)) continue
    const paperId = key.slice(prefix.length)
    if (paperId.length > 0 && new RegExp(`^${PAPER_ID_PATTERN}$`).test(paperId)) {
      return { kind, paperId }
    }
    return null
  }
  return null
}
