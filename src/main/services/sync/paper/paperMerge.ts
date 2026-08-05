/**
 * paper 元数据合并（纯函数）。
 *
 * meta：整文档 LWW——updatedAt 新者整体赢，相等取 remote（确定性）。
 * annotations：按批注 id 并集，同 id 取 updatedAt 更新（LWW）。
 * 已知取舍：离线并发删除同一条批注可能被并集复活（同 knowledge，不造批注级 tombstone）。
 */
import type { PaperAnnotation, PaperAnnotationStore, PaperDocument } from '@shared/types/paper'

export interface MergeResult<T> {
  merged: T
  changed: boolean
}

/** 合并论文 meta：整文档 LWW（updatedAt 新者赢，相等取 remote） */
export function mergePaperMeta(input: {
  local: PaperDocument | null
  remote: PaperDocument
}): MergeResult<PaperDocument> {
  const { local, remote } = input
  if (!local) return { merged: remote, changed: true }
  if (remote.updatedAt >= local.updatedAt) return { merged: remote, changed: true }
  return { merged: local, changed: false }
}

/** 合并论文批注：按 id 并集，同 id 取 updatedAt 更新 */
export function mergePaperAnnotations(input: {
  local: PaperAnnotationStore | null
  remote: PaperAnnotationStore
}): MergeResult<PaperAnnotationStore> {
  const { local, remote } = input
  if (!local) return { merged: remote, changed: true }

  const map = new Map<string, PaperAnnotation>()
  for (const ann of [...local.annotations, ...remote.annotations]) {
    const existing = map.get(ann.id)
    if (!existing || ann.updatedAt > existing.updatedAt) {
      map.set(ann.id, ann)
    }
  }

  const merged: PaperAnnotationStore = {
    ...remote,
    annotations: [...map.values()],
    updatedAt: remote.updatedAt > local.updatedAt ? remote.updatedAt : local.updatedAt
  }
  const changed = JSON.stringify(merged.annotations) !== JSON.stringify(local.annotations)
  return { merged, changed }
}
