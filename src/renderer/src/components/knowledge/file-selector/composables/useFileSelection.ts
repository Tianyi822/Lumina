/**
 * 文件选择 composable
 * 处理文件选择和关联逻辑
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { useFileStore } from '@renderer/stores'
import type { FileItem } from '@renderer/types'

/**
 * useFileSelection composable
 * @param files 文件列表引用
 * @param kbId 知识库 ID
 */
export function useFileSelection(
  files: Ref<FileItem[]>,
  kbId: string
): {
  selectedFileIds: Ref<Set<string>>
  linkingFileIds: Ref<Set<string>>
  hasSelectedFiles: ComputedRef<boolean>
  selectedCount: ComputedRef<number>
  toggleSelection: (fileId: string) => void
  selectAll: (availableFiles: FileItem[]) => void
  deselectAll: () => void
  linkSelectedFiles: () => Promise<FileItem[]>
  isSelected: (fileId: string) => boolean
  isLinking: (fileId: string) => boolean
} {
  const fileStore = useFileStore()

  /** 选中的文件 ID 集合 */
  const selectedFileIds = ref<Set<string>>(new Set())

  /** 正在关联的文件 ID 集合 */
  const linkingFileIds = ref<Set<string>>(new Set())

  /** 是否有选中的文件 */
  const hasSelectedFiles = computed(() => selectedFileIds.value.size > 0)

  /** 选中的文件数量 */
  const selectedCount = computed(() => selectedFileIds.value.size)

  /**
   * 切换文件选择状态
   * @param fileId 文件 ID
   */
  function toggleSelection(fileId: string): void {
    if (selectedFileIds.value.has(fileId)) {
      selectedFileIds.value.delete(fileId)
    } else {
      selectedFileIds.value.add(fileId)
    }
  }

  /**
   * 全选
   * @param availableFiles 可选的文件列表
   */
  function selectAll(availableFiles: FileItem[]): void {
    availableFiles.forEach((f) => selectedFileIds.value.add(f.id))
  }

  /**
   * 取消全选
   */
  function deselectAll(): void {
    selectedFileIds.value.clear()
  }

  /**
   * 关联选中的文件到知识库
   * @returns 成功关联的文件列表
   */
  async function linkSelectedFiles(): Promise<FileItem[]> {
    const fileIds = Array.from(selectedFileIds.value)
    const linkedFiles: FileItem[] = []

    for (const fileId of fileIds) {
      linkingFileIds.value.add(fileId)
      const result = await fileStore.linkFileToKB(fileId, kbId)
      linkingFileIds.value.delete(fileId)

      if (result.success) {
        const file = files.value.find((f) => f.id === fileId)
        if (file) linkedFiles.push(file)
      }
    }

    selectedFileIds.value.clear()
    return linkedFiles
  }

  /**
   * 检查文件是否被选中
   * @param fileId 文件 ID
   */
  function isSelected(fileId: string): boolean {
    return selectedFileIds.value.has(fileId)
  }

  /**
   * 检查文件是否正在关联
   * @param fileId 文件 ID
   */
  function isLinking(fileId: string): boolean {
    return linkingFileIds.value.has(fileId)
  }

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
