import { useState, useCallback } from 'react'
import { useFileStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import type { FileItem } from '@renderer/types'

export function useFileDelete() {
  const fileStore = useFileStore()
  const notify = useNotification()

  const [deletingFileId, setDeletingFileId] = useState<string | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [fileToDelete, setFileToDelete] = useState<FileItem | null>(null)

  const performDelete = useCallback(
    async (forceDelete: boolean = false): Promise<boolean> => {
      const currentFile = fileToDelete
      if (!currentFile) return false

      setDeletingFileId(currentFile.id)
      const result = await fileStore.deleteFile(currentFile.id, forceDelete)
      setDeletingFileId(null)

      if (result.success) {
        setShowConfirmDialog(false)
        setFileToDelete(null)
        return true
      } else {
        notify.error('文件删除', result.error || '删除失败', { source: 'file' })
        return false
      }
    },
    [fileToDelete, fileStore, notify]
  )

  const handleDeleteClick = useCallback(
    async (file: FileItem): Promise<void> => {
      setFileToDelete(file)
      if (file.usedByKBIds.length > 0) {
        setShowConfirmDialog(true)
      } else {
        await performDelete()
      }
    },
    [performDelete]
  )

  const cancelDelete = useCallback(() => {
    setShowConfirmDialog(false)
    setFileToDelete(null)
  }, [])

  return {
    deletingFileId,
    showConfirmDialog,
    fileToDelete,
    handleDeleteClick,
    performDelete,
    cancelDelete
  }
}
