import { useState, useCallback, useMemo } from 'react'
import { useFileStore } from '@renderer/stores'
import type { FileItem } from '@renderer/types'

/** 文件多选 + 批量挂载到知识库的状态管理 */
export function useFileSelection(files: FileItem[], kbId: string) {
  const fileStore = useFileStore()

  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set())
  const [linkingFileIds, setLinkingFileIds] = useState<Set<string>>(new Set())

  const hasSelectedFiles = useMemo(() => selectedFileIds.size > 0, [selectedFileIds])
  const selectedCount = useMemo(() => selectedFileIds.size, [selectedFileIds])

  const toggleSelection = useCallback((fileId: string) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev)
      if (next.has(fileId)) next.delete(fileId)
      else next.add(fileId)
      return next
    })
  }, [])

  const selectAll = useCallback((availableFiles: FileItem[]) => {
    setSelectedFileIds(new Set(availableFiles.map((f) => f.id)))
  }, [])

  const deselectAll = useCallback(() => {
    setSelectedFileIds(new Set())
  }, [])

  const linkSelectedFiles = useCallback(async (): Promise<FileItem[]> => {
    const fileIds = Array.from(selectedFileIds)
    const linkedFiles: FileItem[] = []

    for (const fileId of fileIds) {
      setLinkingFileIds((prev) => new Set(prev).add(fileId))
      const result = await fileStore.linkFileToKB(fileId, kbId)
      setLinkingFileIds((prev) => {
        const next = new Set(prev)
        next.delete(fileId)
        return next
      })

      if (result.success) {
        const file = files.find((f) => f.id === fileId)
        if (file) linkedFiles.push(file)
      }
    }

    setSelectedFileIds(new Set())
    return linkedFiles
  }, [selectedFileIds, fileStore, kbId, files])

  const isSelected = useCallback((fileId: string) => selectedFileIds.has(fileId), [selectedFileIds])

  const isLinking = useCallback((fileId: string) => linkingFileIds.has(fileId), [linkingFileIds])

  return {
    selectedFileIds,
    linkingFileIds,
    hasSelectedFiles,
    selectedCount,
    toggleSelection,
    selectAll,
    deselectAll,
    linkSelectedFiles,
    isSelected,
    isLinking
  }
}
