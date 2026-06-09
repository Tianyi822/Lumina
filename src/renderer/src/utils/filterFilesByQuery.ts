import type { FileItem } from '@renderer/types'

/** 根据搜索关键词过滤文件列表（匹配文件名、来源、论文名等） */
export function filterFilesByQuery(files: FileItem[], query: string): FileItem[] {
  if (!query.trim()) {
    return files
  }
  const normalized = query.toLowerCase()
  return files.filter((file) => {
    const searchableText = [
      file.name,
      file.sourceKind,
      file.origin?.paperName,
      file.origin?.displayName,
      file.origin?.summary
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return searchableText.includes(normalized)
  })
}
