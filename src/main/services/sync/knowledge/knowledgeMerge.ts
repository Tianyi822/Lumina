/**
 * knowledge 元数据合并（纯函数）。
 *
 * KB 合并：按 id 并集，同 id 取 updatedAt 更新（LWW，含 embeddingConfig 全字段）。
 * File 合并：按 id 并集，同 id 取 uploadedAt 更新（LWW）。
 */
import type { KnowledgeBase, FileItem } from '@shared/types/knowledge'

export interface KnowledgeBasesMergeInput {
  local: KnowledgeBase[]
  remote: KnowledgeBase[]
}

export interface FileItemsMergeInput {
  local: FileItem[]
  remote: FileItem[]
}

export interface MergeResult<T> {
  merged: T[]
  changed: boolean
}

/** 合并 KB 列表：按 id 并集，同 id 取 updatedAt 更新 */
export function mergeKnowledgeBases(input: KnowledgeBasesMergeInput): MergeResult<KnowledgeBase> {
  const { local, remote } = input
  const map = new Map<string, KnowledgeBase>()

  for (const kb of [...local, ...remote]) {
    const existing = map.get(kb.id)
    if (!existing || kb.updatedAt > existing.updatedAt) {
      map.set(kb.id, kb)
    }
  }

  const merged = [...map.values()]
  const changed = JSON.stringify(merged) !== JSON.stringify(local)
  return { merged, changed }
}

/** 合并 File 列表：按 id 并集，同 id 取 uploadedAt 更新 */
export function mergeFileItems(input: FileItemsMergeInput): MergeResult<FileItem> {
  const { local, remote } = input
  const map = new Map<string, FileItem>()

  for (const file of [...local, ...remote]) {
    const existing = map.get(file.id)
    if (!existing || file.uploadedAt > existing.uploadedAt) {
      map.set(file.id, file)
    }
  }

  const merged = [...map.values()]
  const changed = JSON.stringify(merged) !== JSON.stringify(local)
  return { merged, changed }
}
