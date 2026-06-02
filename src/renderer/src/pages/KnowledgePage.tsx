import { useState, useCallback, useEffect, useRef } from 'react'
import { useKnowledgeStore } from '@renderer/stores/knowledgeStore'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { useNotification } from '@renderer/composables/useNotification'
import KnowledgeMain from '@renderer/components/KnowledgeMain'
import KnowledgeForm from '@renderer/components/knowledge/KnowledgeForm'
import FileManagerModal from '@renderer/components/knowledge/FileManagerModal'
import FileSelectorModal from '@renderer/components/knowledge/FileSelectorModal'
import type { FileItem } from '@renderer/types'
import styles from './KnowledgePage.module.css'

export default function KnowledgePage() {
  const knowledgeBases = useKnowledgeStore((s) => s.knowledgeBases)
  const activeKbId = useKnowledgeStore((s) => s.activeKbId) ?? undefined
  const showForm = useKnowledgeStore((s) => s.showForm)
  const loadKnowledgeBases = useKnowledgeStore((s) => s.loadKnowledgeBases)
  const handleFormSubmit = useKnowledgeStore((s) => s.handleFormSubmit)
  const closeForm = useKnowledgeStore((s) => s.closeForm)

  const showKnowledgeFileManager = useUIStateStore((s) => s.showKnowledgeFileManager)
  const closeKnowledgeFileManager = useUIStateStore((s) => s.closeKnowledgeFileManager)

  const notify = useNotification()

  const [showFileSelector, setShowFileSelector] = useState(false)
  const [currentKBIdForSelector, setCurrentKBIdForSelector] = useState('')
  const filesLinkedHandlerRef = useRef<((files: FileItem[]) => Promise<void>) | null>(null)

  useEffect(() => {
    loadKnowledgeBases()
  }, [loadKnowledgeBases])

  const activeKnowledgeBase = knowledgeBases.find((kb) => kb.id === activeKbId)

  const handleKnowledgeSubmit = useCallback(
    async (data: {
      name: string
      description: string
      embeddingConfig: {
        baseUrl: string
        apiKey?: string
        displayName?: string
        model: string
        dimensions: number
      }
      embeddingDimension: number
      chunkSize: number
      chunkOverlap: number
    }) => {
      const success = await handleFormSubmit(data)
      if (!success) {
        notify.error('创建知识库失败', useKnowledgeStore.getState().error || '未知错误', {
          source: 'knowledge'
        })
      }
    },
    [handleFormSubmit, notify]
  )

  const handleAddFiles = useCallback((kbId: string) => {
    setCurrentKBIdForSelector(kbId)
    setShowFileSelector(true)
  }, [])

  const handleFileSelectorClose = useCallback(() => {
    setShowFileSelector(false)
    setCurrentKBIdForSelector('')
  }, [])

  const handleFilesLinked = useCallback(
    (files: FileItem[]) => {
      const kb = knowledgeBases.find((k) => k.id === currentKBIdForSelector)
      if (kb) {
        const newFileIds = files.map((f) => f.id)
        kb.linkedFileIds = [...(kb.linkedFileIds || []), ...newFileIds]
        kb.documentCount = kb.linkedFileIds.length
      }
      filesLinkedHandlerRef.current?.(files)
    },
    [knowledgeBases, currentKBIdForSelector]
  )

  const handleFileUnlinked = useCallback(
    (kbId: string, fileId: string) => {
      const kb = knowledgeBases.find((k) => k.id === kbId)
      if (kb && kb.linkedFileIds) {
        kb.linkedFileIds = kb.linkedFileIds.filter((id) => id !== fileId)
        kb.documentCount = kb.linkedFileIds.length
      }
    },
    [knowledgeBases]
  )

  const handleDescriptionUpdated = useCallback(
    (kbId: string, description: string) => {
      const kb = knowledgeBases.find((k) => k.id === kbId)
      if (kb) {
        kb.description = description
      }
    },
    [knowledgeBases]
  )

  const linkedFileIdsForSelector =
    knowledgeBases.find((kb) => kb.id === currentKBIdForSelector)?.linkedFileIds || []

  return (
    <div className={`${styles.page} sm-workspace-view`}>
      <KnowledgeMain
        knowledgeBase={activeKnowledgeBase}
        onAddFiles={handleAddFiles}
        onFileUnlinked={handleFileUnlinked}
        onDescriptionUpdated={handleDescriptionUpdated}
        onFilesLinkedRef={filesLinkedHandlerRef}
      />

      {showForm && <KnowledgeForm onSubmit={handleKnowledgeSubmit} onCancel={closeForm} />}

      {showKnowledgeFileManager && <FileManagerModal onClose={closeKnowledgeFileManager} />}

      {showFileSelector && (
        <FileSelectorModal
          kbId={currentKBIdForSelector}
          linkedFileIds={linkedFileIdsForSelector}
          onClose={handleFileSelectorClose}
          onFilesLinked={handleFilesLinked}
        />
      )}
    </div>
  )
}
