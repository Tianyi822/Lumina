import { useMemo } from 'react'
import { useFileStore } from '@renderer/stores'
import { filterFilesByQuery } from '@renderer/utils/filterFilesByQuery'

/** 订阅文件列表与搜索词，派生过滤后的文件列表（避免 selector 中调用 filteredFiles 导致无限重渲染） */
export function useFilteredFiles() {
  const files = useFileStore((s) => s.files)
  const searchQuery = useFileStore((s) => s.searchQuery)
  return useMemo(() => filterFilesByQuery(files, searchQuery), [files, searchQuery])
}
