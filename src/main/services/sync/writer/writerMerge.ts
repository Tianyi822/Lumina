/**
 * writing index.json 合并（纯函数）。
 *
 * 规则：
 * 1. schemaVersion 取较大值
 * 2. folders 按 id 并集，同 id 取 updatedAt 更新（LWW）
 * 3. documents summary 用 local（落盘的 document.json 会触发 summary 重建）
 * 4. recentDocumentIds 本机优先
 */
import type { WriterIndex } from '@shared/types/writer'

export interface WriterIndexMergeInput {
  local: WriterIndex
  remote: WriterIndex
}

export interface WriterIndexMergeResult {
  merged: WriterIndex
  changed: boolean
}

/** 合并 writing index */
export function mergeWriterIndex(input: WriterIndexMergeInput): WriterIndexMergeResult {
  const { local, remote } = input

  // folders 并集，同 id 取 updatedAt 更新
  const folderMap = new Map<string, WriterIndex['folders'][number]>()
  for (const folder of [...local.folders, ...remote.folders]) {
    const existing = folderMap.get(folder.id)
    if (!existing || folder.updatedAt > existing.updatedAt) {
      folderMap.set(folder.id, folder)
    }
  }
  const mergedFolders = [...folderMap.values()].sort((a, b) => a.sortOrder - b.sortOrder)

  const merged: WriterIndex = {
    schemaVersion: Math.max(local.schemaVersion, remote.schemaVersion),
    folders: mergedFolders,
    documents: local.documents, // 用 local，落盘的 document.json 触发重建
    recentDocumentIds: local.recentDocumentIds // 本机优先
  }

  // changed：merged 是否与 local 不同（决定是否需落盘）
  const changed = JSON.stringify(merged) !== JSON.stringify(local)

  return { merged, changed }
}
