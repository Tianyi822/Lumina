import { ref } from 'vue'
import type { ComputedRef } from 'vue'
import { useFileStore, useKnowledgeIndexStore } from '@renderer/stores'
import type { KnowledgeBase, FileItem } from '@renderer/types'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useKnowledgeFiles(
  currentKB: ComputedRef<KnowledgeBase | undefined>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit: (event: any, ...args: any[]) => void,
  onStatsNeedUpdate: () => Promise<void>
) {
  const fileStore = useFileStore()
  const indexStore = useKnowledgeIndexStore()

  const linkedFiles = ref<FileItem[]>([])
  const loadingFiles = ref(false)
  const unlinkingFileId = ref<string | null>(null)

  const isDragging = ref(false)
  const dragCounter = ref(0)

  async function loadLinkedFiles(): Promise<void> {
    if (!currentKB.value) return

    loadingFiles.value = true
    try {
      const files = await fileStore.getFilesByKBId(currentKB.value.id)
      linkedFiles.value = files
    } finally {
      loadingFiles.value = false
    }
  }

  async function handleUnlinkFile(
    fileId: string,
    handleReindex: () => Promise<void>
  ): Promise<void> {
    if (!currentKB.value) return

    if (!confirm('确定要从知识库中移除此文档吗？移除后索引将与文档不匹配，需要手动重新索引。')) {
      return
    }

    unlinkingFileId.value = fileId
    const result = await fileStore.unlinkFileFromKB(fileId, currentKB.value.id)
    unlinkingFileId.value = null

    if (result.success) {
      linkedFiles.value = linkedFiles.value.filter((f) => f.id !== fileId)
      await window.api.knowledge.removeFileIndex(currentKB.value.id, fileId)
      await onStatsNeedUpdate()
      emit('file-unlinked', currentKB.value.id, fileId)

      if (linkedFiles.value.length > 0) {
        if (confirm('文档删除，需要重新索引，不然索引与原文不匹配。\n\n是否立即重新索引？')) {
          await handleReindex()
        }
      }
    } else {
      alert('取消关联失败: ' + (result.error || '未知错误'))
    }
  }

  function handleAddFiles(): void {
    if (!currentKB.value) return
    emit('add-files', currentKB.value.id)
  }

  async function indexSingleFile(file: FileItem): Promise<void> {
    if (!currentKB.value) return

    indexStore.setFileIndexing(currentKB.value.id, file.id, file.name)
    indexStore.startRefresh()

    window.api.logger.info('[KnowledgeMain] 开始索引文件', { fileName: file.name })
    const result = await window.api.knowledge.indexFile(
      currentKB.value.id,
      file.id,
      file.absolutePath,
      file.name
    )

    if (!result.success) {
      console.error('索引文件失败:', file.name, result.error)
      indexStore.setFileFailed(currentKB.value.id, file.id, result.error || '索引失败')
    } else {
      window.api.logger.info('[KnowledgeMain] 文件索引成功', { fileName: file.name })
      await onStatsNeedUpdate()
    }
  }

  async function handleFilesLinked(files: FileItem[]): Promise<void> {
    if (!currentKB.value) return

    const filesToIndex: FileItem[] = []

    for (const file of files) {
      if (!linkedFiles.value.find((f) => f.id === file.id)) {
        linkedFiles.value.push(file)
        filesToIndex.push(file)
      }
    }

    await onStatsNeedUpdate()

    for (const file of filesToIndex) {
      await indexSingleFile(file)
    }
  }

  function handleDragEnter(event: DragEvent): void {
    event.preventDefault()
    dragCounter.value++
    if (dragCounter.value === 1) {
      isDragging.value = true
    }
  }

  function handleDragLeave(event: DragEvent): void {
    event.preventDefault()
    dragCounter.value--
    if (dragCounter.value === 0) {
      isDragging.value = false
    }
  }

  function handleDragOver(event: DragEvent): void {
    event.preventDefault()
  }

  async function handleDrop(event: DragEvent): Promise<void> {
    event.preventDefault()
    dragCounter.value = 0
    isDragging.value = false

    if (!currentKB.value) {
      alert('请先选择知识库')
      return
    }

    const files = event.dataTransfer?.files
    if (!files || files.length === 0) return

    await uploadAndLinkFiles(Array.from(files))
  }

  async function uploadAndLinkFiles(files: File[]): Promise<void> {
    if (!currentKB.value) return

    const uploadedFiles: FileItem[] = []
    const errors: string[] = []

    for (const file of files) {
      try {
        const supportedTypes = [
          '.txt',
          '.md',
          '.pdf',
          '.doc',
          '.docx',
          '.csv',
          '.xls',
          '.xlsx',
          '.pptx'
        ]
        const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
        if (!supportedTypes.includes(ext)) {
          errors.push(`${file.name}: 不支持的文件类型`)
          continue
        }

        const result = await fileStore.uploadFile(file)
        if (result.success && result.file) {
          uploadedFiles.push(result.file)
        } else {
          errors.push(`${file.name}: ${result.error || '上传失败'}`)
        }
      } catch (error) {
        errors.push(`${file.name}: ${error instanceof Error ? error.message : '上传失败'}`)
      }
    }

    if (uploadedFiles.length > 0) {
      for (const file of uploadedFiles) {
        await fileStore.linkFileToKB(file.id, currentKB.value.id)
      }

      await handleFilesLinked(uploadedFiles)

      emit('file-unlinked', currentKB.value.id, '')
    }

    if (errors.length > 0) {
      alert(`上传完成\n成功: ${uploadedFiles.length} 个\n失败: ${errors.join('\n')}`)
    } else if (uploadedFiles.length > 0) {
      alert(`成功上传 ${uploadedFiles.length} 个文件`)
    }
  }

  return {
    linkedFiles,
    loadingFiles,
    unlinkingFileId,
    isDragging,
    loadLinkedFiles,
    handleUnlinkFile,
    handleAddFiles,
    handleFilesLinked,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop
  }
}
