import { ref } from 'vue'
import type { ComputedRef } from 'vue'
import { getFileExtension, isSupportedDocumentExtension } from '@shared/constants/document'
import { useFileStore, useKnowledgeIndexStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
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
  const notify = useNotification()

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

    const confirmed = await notify.confirm('移除后索引将与文档不匹配，需要手动重新索引。', {
      title: '移除知识库文档',
      source: 'knowledge',
      danger: true
    })

    if (!confirmed) {
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
        const shouldReindex = await notify.confirm(
          '文档删除后，索引与原文可能不匹配。是否立即重新索引？',
          {
            title: '重新索引知识库',
            source: 'knowledge'
          }
        )

        if (shouldReindex) {
          await handleReindex()
        }
      }
    } else {
      notify.error('取消关联失败', result.error || '未知错误', { source: 'knowledge' })
    }
  }

  function handleAddFiles(): void {
    if (!currentKB.value) return
    emit('add-files', currentKB.value.id)
  }

  async function indexSingleFile(file: FileItem): Promise<void> {
    if (!currentKB.value) return

    const kbId = currentKB.value.id
    indexStore.setFileIndexing(kbId, file.id, file.name)
    indexStore.markIndexCallStarted(kbId, file.id)
    indexStore.startRefresh()

    try {
      window.api.logger.info('[KnowledgeMain] 开始索引文件', { fileName: file.name })
      const result = await window.api.knowledge.indexFile(kbId, file.id)

      if (!result.success) {
        window.api.logger.error('[KnowledgeMain] 索引文件失败', {
          fileName: file.name,
          error: result.error || '索引失败'
        })
        indexStore.setFileFailed(kbId, file.id, result.error || '索引失败')
      } else {
        window.api.logger.info('[KnowledgeMain] 文件索引成功', { fileName: file.name })
        await onStatsNeedUpdate()
      }
    } finally {
      indexStore.markIndexCallFinished(kbId, file.id)
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
      notify.warning('请先选择知识库', undefined, { source: 'knowledge' })
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
        const ext = getFileExtension(file.name)
        if (!isSupportedDocumentExtension(ext)) {
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
      notify.warning(
        '文件上传完成',
        `成功 ${uploadedFiles.length} 个，失败 ${errors.length} 个\n${errors.join('\n')}`,
        {
          source: 'knowledge'
        }
      )
    } else if (uploadedFiles.length > 0) {
      notify.success('文件已添加', `成功上传并索引 ${uploadedFiles.length} 个文件`, {
        source: 'knowledge'
      })
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
