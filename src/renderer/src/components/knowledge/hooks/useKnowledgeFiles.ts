import { useState, useCallback, useRef } from 'react'
import { useFileStore, useKnowledgeIndexStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import { isSupportedDocumentExtension } from '@shared/constants/document'
import type { FileItem } from '@renderer/types'

/** 知识库文件的完整生命周期管理：加载、拖拽上传、挂载、取消关联和索引触发 */
export function useKnowledgeFiles(
  kbId: string | undefined,
  onAddFiles: (kbId: string) => void,
  onFileUnlinked: (kbId: string, fileId: string) => void,
  onStatsNeedUpdate: () => Promise<void>
) {
  const fileStore = useFileStore()
  const indexStore = useKnowledgeIndexStore()
  const notify = useNotification()

  const [linkedFiles, setLinkedFiles] = useState<FileItem[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [unlinkingFileId, setUnlinkingFileId] = useState<string | null>(null)

  const [isDragging, setIsDragging] = useState(false)
  const dragCounterRef = useRef(0)

  const loadLinkedFiles = useCallback(async () => {
    if (!kbId) return
    setLoadingFiles(true)
    try {
      const files = await fileStore.getFilesByKBId(kbId)
      setLinkedFiles(files)
    } finally {
      setLoadingFiles(false)
    }
  }, [kbId, fileStore])

  const indexSingleFile = useCallback(
    async (file: FileItem): Promise<void> => {
      if (!kbId) return

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
    },
    [kbId, indexStore, onStatsNeedUpdate]
  )

  const handleFilesLinked = useCallback(
    async (files: FileItem[]): Promise<void> => {
      if (!kbId) return

      const filesToIndex: FileItem[] = []

      setLinkedFiles((prev) => {
        const next = [...prev]
        for (const file of files) {
          if (!next.find((f) => f.id === file.id)) {
            next.push(file)
            filesToIndex.push(file)
          }
        }
        return next
      })

      await onStatsNeedUpdate()

      for (const file of filesToIndex) {
        await indexSingleFile(file)
      }
    },
    [kbId, onStatsNeedUpdate, indexSingleFile]
  )

  const handleUnlinkFile = useCallback(
    async (fileId: string, onReindex: () => Promise<void>): Promise<void> => {
      if (!kbId) return

      const confirmed = await notify.confirm('移除后索引将与文档不匹配，需要手动重新索引。', {
        title: '移除知识库文档',
        source: 'knowledge',
        danger: true
      })

      if (!confirmed) return

      setUnlinkingFileId(fileId)
      const result = await fileStore.unlinkFileFromKB(fileId, kbId)
      setUnlinkingFileId(null)

      if (result.success) {
        setLinkedFiles((prev) => prev.filter((f) => f.id !== fileId))
        await window.api.knowledge.removeFileIndex(kbId, fileId)
        await onStatsNeedUpdate()
        onFileUnlinked(kbId, fileId)

        const remainingFiles = linkedFiles.filter((f) => f.id !== fileId)
        if (remainingFiles.length > 0) {
          const shouldReindex = await notify.confirm(
            '文档删除后，索引与原文可能不匹配。是否立即重新索引？',
            {
              title: '重新索引知识库',
              source: 'knowledge'
            }
          )

          if (shouldReindex) {
            await onReindex()
          }
        }
      } else {
        notify.error('取消关联失败', result.error || '未知错误', { source: 'knowledge' })
      }
    },
    [kbId, linkedFiles, fileStore, notify, onStatsNeedUpdate, onFileUnlinked]
  )

  const handleAddFiles = useCallback(() => {
    if (!kbId) return
    onAddFiles(kbId)
  }, [kbId, onAddFiles])

  const handleDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    dragCounterRef.current++
    if (dragCounterRef.current === 1) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
  }, [])

  const handleDrop = useCallback(
    async (event: React.DragEvent): Promise<void> => {
      event.preventDefault()
      dragCounterRef.current = 0
      setIsDragging(false)

      if (!kbId) {
        notify.warning('请先选择知识库', undefined, { source: 'knowledge' })
        return
      }

      const files = event.dataTransfer?.files
      if (!files || files.length === 0) return

      await uploadAndLinkFiles(Array.from(files))
    },
    [kbId, notify]
  )

  const uploadAndLinkFiles = useCallback(
    async (files: File[]): Promise<void> => {
      if (!kbId) return

      const uploadedFiles: FileItem[] = []
      const errors: string[] = []

      for (const file of files) {
        try {
          const ext = '.' + file.name.split('.').pop()?.toLowerCase()
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
          await fileStore.linkFileToKB(file.id, kbId)
        }

        await handleFilesLinked(uploadedFiles)
      }

      if (errors.length > 0) {
        notify.warning(
          '文件上传完成',
          `成功 ${uploadedFiles.length} 个，失败 ${errors.length} 个\n${errors.join('\n')}`,
          { source: 'knowledge' }
        )
      } else if (uploadedFiles.length > 0) {
        notify.success('文件已添加', `成功上传并索引 ${uploadedFiles.length} 个文件`, {
          source: 'knowledge'
        })
      }
    },
    [kbId, fileStore, handleFilesLinked, notify]
  )

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
