/**
 * 文件删除 composable
 * 处理文件删除相关的状态和逻辑
 */

import { ref, type Ref } from 'vue'
import { useFileStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import type { FileItem } from '@renderer/types'

/**
 * useFileDelete composable
 */
export function useFileDelete(): {
  deletingFileId: Ref<string | null>
  showConfirmDialog: Ref<boolean>
  fileToDelete: Ref<FileItem | null>
  handleDeleteClick: (file: FileItem) => Promise<void>
  performDelete: (forceDelete?: boolean) => Promise<boolean>
  cancelDelete: () => void
} {
  const fileStore = useFileStore()
  const notify = useNotification()

  /** 正在删除的文件 ID */
  const deletingFileId = ref<string | null>(null)

  /** 是否显示确认对话框 */
  const showConfirmDialog = ref(false)

  /** 待删除的文件 */
  const fileToDelete = ref<FileItem | null>(null)

  /**
   * 处理删除点击
   * @param file 要删除的文件
   */
  async function handleDeleteClick(file: FileItem): Promise<void> {
    fileToDelete.value = file

    if (file.usedByKBIds.length > 0) {
      // 如果文件被使用，显示确认对话框
      showConfirmDialog.value = true
    } else {
      // 直接删除
      await performDelete()
    }
  }

  /**
   * 执行删除
   * @param forceDelete 是否强制删除（即使被知识库使用）
   */
  async function performDelete(forceDelete: boolean = false): Promise<boolean> {
    if (!fileToDelete.value) return false

    deletingFileId.value = fileToDelete.value.id
    const result = await fileStore.deleteFile(fileToDelete.value.id, forceDelete)
    deletingFileId.value = null

    if (result.success) {
      showConfirmDialog.value = false
      fileToDelete.value = null
      return true
    } else {
      notify.error('文件删除', result.error || '删除失败', { source: 'file' })
      return false
    }
  }

  /**
   * 取消删除
   */
  function cancelDelete(): void {
    showConfirmDialog.value = false
    fileToDelete.value = null
  }

  return {
    deletingFileId,
    showConfirmDialog,
    fileToDelete,
    handleDeleteClick,
    performDelete,
    cancelDelete
  }
}
