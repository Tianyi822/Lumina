import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useKnowledgeIndexStore } from '@renderer/stores'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import type { FileItem, KnowledgeBase } from '@renderer/types'
import { useKnowledgeFiles } from './knowledge/hooks/useKnowledgeFiles'
import { useKnowledgeStats } from './knowledge/hooks/useKnowledgeStats'
import { useReindex } from './knowledge/hooks/useReindex'
import StatsPanel from './knowledge/StatsPanel'
import SearchPanel from './knowledge/SearchPanel'
import FileListPanel from './knowledge/FileListPanel'
import styles from './KnowledgeMain.module.css'

/** 知识库主页面：展示选中知识库的概览、搜索测试和关联文档管理 */
interface KnowledgeMainProps {
  knowledgeBase?: KnowledgeBase
  onAddFiles: (kbId: string) => void
  onFileUnlinked: (kbId: string, fileId: string) => void
  onDescriptionUpdated: (kbId: string, description: string) => void
  onFilesLinkedRef?: React.MutableRefObject<((files: FileItem[]) => Promise<void>) | null>
}

export default function KnowledgeMain({
  knowledgeBase,
  onAddFiles,
  onFileUnlinked,
  onDescriptionUpdated,
  onFilesLinkedRef
}: KnowledgeMainProps) {
  const { t } = useTranslation()
  const indexStore = useKnowledgeIndexStore()

  const kbId = knowledgeBase?.id

  const { stats, loading: loadingStats, loadStats } = useKnowledgeStats(kbId)

  const refreshCurrentKnowledgeBase = useCallback(async () => {
    if (!kbId || !knowledgeBase) return
    const result = await window.api.knowledge.getById(kbId)
    if (result.success && result.data) {
      Object.assign(knowledgeBase, result.data)
      knowledgeBase.indexInvalidation = result.data.indexInvalidation
    }
  }, [kbId, knowledgeBase])

  const {
    linkedFiles,
    loadingFiles,
    unlinkingFileId,
    isDragging,
    loadLinkedFiles,
    handleUnlinkFile,
    handleAddFiles,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFilesLinked: processLinkedFiles
  } = useKnowledgeFiles(kbId, onAddFiles, onFileUnlinked, loadStats)

  useEffect(() => {
    if (onFilesLinkedRef) {
      onFilesLinkedRef.current = processLinkedFiles
    }
  }, [processLinkedFiles, onFilesLinkedRef])

  const indexingStatus = kbId ? indexStore.isKBIndexing(kbId) : false
  const kbIndexingFiles = kbId ? indexStore.getKBIndexingFilesMap(kbId) : {}

  const invalidatedFiles = knowledgeBase?.indexInvalidation?.files || []
  const kbLinkedFileIdSet = new Set(knowledgeBase?.linkedFileIds || [])
  const linkedFileIdSet = new Set(linkedFiles.map((file) => file.id))
  const validInvalidatedFiles = invalidatedFiles.filter(
    (file) => kbLinkedFileIdSet.has(file.fileId) && linkedFileIdSet.has(file.fileId)
  )
  const validInvalidatedFileIds = validInvalidatedFiles.map((file) => file.fileId)
  const needsReindex =
    knowledgeBase?.indexInvalidation?.needsReindex === true && validInvalidatedFiles.length > 0

  const { reindexing, handleReindex } = useReindex(
    kbId,
    linkedFiles,
    validInvalidatedFileIds,
    loadStats,
    refreshCurrentKnowledgeBase
  )

  // Description editing
  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const [editingDescription, setEditingDescription] = useState('')
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null)

  const startEditDescription = useCallback(() => {
    if (!knowledgeBase) return
    setEditingDescription(knowledgeBase.description || '')
    setIsEditingDescription(true)
    setTimeout(() => descriptionTextareaRef.current?.focus(), 0)
  }, [knowledgeBase])

  const saveDescription = useCallback(async () => {
    if (!knowledgeBase) return
    const text = editingDescription.trim()
    setIsEditingDescription(false)
    if (text === (knowledgeBase.description || '')) return
    try {
      const res = await window.api.knowledge.update(knowledgeBase.id, { description: text })
      if (res.success) {
        knowledgeBase.description = text
        onDescriptionUpdated(knowledgeBase.id, text)
      }
    } catch {
      // 静默失败
    }
  }, [knowledgeBase, editingDescription, onDescriptionUpdated])

  const handleDescriptionKeydown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsEditingDescription(false)
    }
  }, [])

  // Lifecycle: watch kbId changes
  const prevKbIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (kbId && kbId !== prevKbIdRef.current) {
      prevKbIdRef.current = kbId
      loadLinkedFiles()
      indexStore.restoreStatus(kbId)
    } else if (!kbId) {
      prevKbIdRef.current = undefined
    }
  }, [kbId, loadLinkedFiles, indexStore])

  // Visibility change handler
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && kbId) {
        indexStore.restoreStatus(kbId)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [kbId, indexStore])

  // Initial restore
  useEffect(() => {
    if (kbId) {
      const timer = setTimeout(() => indexStore.restoreStatus(kbId), 100)
      return () => clearTimeout(timer)
    }
    return
  }, [kbId, indexStore])

  return (
    <main className={styles.kbMain}>
      {knowledgeBase ? (
        <div className={styles.kbWorkspace}>
          <section className={styles.kbOverview}>
            <div className={styles.kbOverviewHeader}>
              <div className={styles.kbOverviewCopy}>
                <div className={styles.kbOverviewTitleRow}>
                  <div className={styles.kbOverviewHeading}>
                    <h1 className={styles.kbTitle}>{knowledgeBase.name}</h1>
                  </div>
                </div>

                {isEditingDescription ? (
                  <textarea
                    ref={descriptionTextareaRef}
                    value={editingDescription}
                    className={`sm-textarea ${styles.kbDescription} ${styles.kbDescriptionEditing}`}
                    rows={3}
                    placeholder={t('knowledge.main.descriptionPlaceholder')}
                    onChange={(e) => setEditingDescription(e.target.value)}
                    onBlur={saveDescription}
                    onKeyDown={handleDescriptionKeydown}
                  ></textarea>
                ) : (
                  <p
                    className={`${styles.kbDescription} ${!knowledgeBase.description ? 'kb-description-empty' : ''}`}
                    onDoubleClick={startEditDescription}
                  >
                    {knowledgeBase.description || t('knowledge.main.descriptionEmptyHint')}
                  </p>
                )}

                <StatsPanel
                  stats={stats ?? { fileCount: 0, chunkCount: 0, dbSize: 0 }}
                  loadingStats={loadingStats}
                  currentKB={knowledgeBase}
                />
              </div>
            </div>

            {needsReindex && (
              <div className={styles.kbReindexNotice}>
                <span className={styles.kbReindexNoticeIcon} aria-hidden="true">
                  <SvgIcon name="warning" size={16} />
                </span>
                <div className={styles.kbReindexNoticeCopy}>
                  <strong>{t('knowledge.main.reindexNeededTitle')}</strong>
                  <span>{t('knowledge.main.reindexNeededBody')}</span>
                  {validInvalidatedFiles.length > 0 && (
                    <ul className={styles.kbReindexNoticeList}>
                      {validInvalidatedFiles.map((file) => (
                        <li key={file.fileId}>{file.fileName}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </section>

          <SearchPanel currentKB={knowledgeBase} />
          <FileListPanel
            linkedFiles={linkedFiles}
            loadingFiles={loadingFiles}
            isDragging={isDragging}
            unlinkingFileId={unlinkingFileId}
            indexingStatus={indexingStatus}
            reindexing={reindexing}
            kbIndexingFiles={kbIndexingFiles}
            invalidatedFileIds={validInvalidatedFileIds}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onAddFiles={handleAddFiles}
            onReindex={handleReindex}
            onUnlinkFile={handleUnlinkFile}
          />
        </div>
      ) : (
        <div className={['sm-empty', styles.emptyKb].join(' ')}>
          <h2>{t('knowledge.main.emptyTitle')}</h2>
          <p>{t('knowledge.main.emptyBody')}</p>
        </div>
      )}
    </main>
  )
}
