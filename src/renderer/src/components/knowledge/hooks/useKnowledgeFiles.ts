import { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useFileStore } from '@renderer/stores/fileStore'
import { useKnowledgeIndexStore } from '@renderer/stores/knowledgeIndexStore'
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
  const { t } = useTranslation()
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
            error: result.error || t('notifications.knowledge.indexFailed')
          })
          indexStore.setFileFailed(
            kbId,
            file.id,
            result.error || t('notifications.knowledge.indexFailed')
          )
        } else {
          window.api.logger.info('[KnowledgeMain] 文件索引成功', { fileName: file.name })
          await onStatsNeedUpdate()
        }
      } finally {
        indexStore.markIndexCallFinished(kbId, file.id)
      }
    },
    [kbId, indexStore, onStatsNeedUpdate, t]
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
    async (fileId: string): Promise<void> => {
      if (!kbId) return

      const confirmed = await notify.confirm(t('notifications.knowledge.unlinkConfirmBody'), {
        title: t('notifications.knowledge.unlinkConfirmTitle'),
        source: 'knowledge',
        danger: true
      })

      if (!confirmed) return

      setUnlinkingFileId(fileId)
      const result = await fileStore.unlinkFileFromKB(fileId, kbId)
      setUnlinkingFileId(null)

      if (result.success) {
        setLinkedFiles((prev) => prev.filter((f) => f.id !== fileId))
        await onStatsNeedUpdate()
        onFileUnlinked(kbId, fileId)
      } else {
        notify.error(
          t('notifications.knowledge.unlinkFailedTitle'),
          result.error || t('common.unknownError'),
          { source: 'knowledge' }
        )
      }
    },
    [kbId, fileStore, notify, onStatsNeedUpdate, onFileUnlinked, t]
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
        notify.warning(t('notifications.knowledge.selectKbFirst'), undefined, {
          source: 'knowledge'
        })
        return
      }

      const files = event.dataTransfer?.files
      if (!files || files.length === 0) return

      await uploadAndLinkFiles(Array.from(files))
    },
    [kbId, notify, t]
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
            errors.push(t('notifications.knowledge.fileTypeUnsupported', { name: file.name }))
            continue
          }

          const result = await fileStore.uploadFile(file)
          if (result.success && result.file) {
            uploadedFiles.push(result.file)
          } else {
            errors.push(
              `${file.name}: ${result.error || t('notifications.knowledge.uploadFailed')}`
            )
          }
        } catch (error) {
          errors.push(
            `${file.name}: ${error instanceof Error ? error.message : t('notifications.knowledge.uploadFailed')}`
          )
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
          t('notifications.knowledge.uploadCompleteTitle'),
          `${t('notifications.knowledge.uploadCompleteBody', { uploaded: uploadedFiles.length, failed: errors.length })}\n${errors.join('\n')}`,
          { source: 'knowledge' }
        )
      } else if (uploadedFiles.length > 0) {
        notify.success(
          t('notifications.knowledge.uploadSuccessTitle'),
          t('notifications.knowledge.uploadSuccess', { count: uploadedFiles.length }),
          { source: 'knowledge' }
        )
      }
    },
    [kbId, fileStore, handleFilesLinked, notify, t]
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
