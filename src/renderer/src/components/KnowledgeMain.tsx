import { useState, useEffect, useCallback, useRef } from 'react'
import { useKnowledgeIndexStore } from '@renderer/stores'
import type { KnowledgeBase } from '@renderer/types'
import { useKnowledgeFiles } from './knowledge/hooks/useKnowledgeFiles'
import { useReindex } from './knowledge/hooks/useReindex'
import StatsPanel from './knowledge/StatsPanel'
import SearchPanel from './knowledge/SearchPanel'
import FileListPanel from './knowledge/FileListPanel'
import styles from './KnowledgeMain.module.css'

interface KnowledgeMainProps {
  knowledgeBase?: KnowledgeBase
  onAddFiles: (kbId: string) => void
  onFileUnlinked: (kbId: string, fileId: string) => void
  onDescriptionUpdated: (kbId: string, description: string) => void
}

export default function KnowledgeMain({
  knowledgeBase,
  onAddFiles,
  onFileUnlinked,
  onDescriptionUpdated
}: KnowledgeMainProps) {
  const indexStore = useKnowledgeIndexStore()

  const [stats, setStats] = useState({ fileCount: 0, chunkCount: 0, dbSize: 0 })
  const [loadingStats, setLoadingStats] = useState(false)

  const kbId = knowledgeBase?.id

  const loadStats = useCallback(async () => {
    if (!kbId) return
    setLoadingStats(true)
    try {
      const res = await window.api.knowledge.getStats(kbId)
      if (res.success && res.data) setStats(res.data)
    } catch (e) {
      window.api.logger.error('[KnowledgeMain] 加载统计失败', {
        error: e instanceof Error ? e.message : String(e),
        kbId
      })
    } finally {
      setLoadingStats(false)
    }
  }, [kbId])

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
    handleDrop
  } = useKnowledgeFiles(kbId, onAddFiles, onFileUnlinked, loadStats)

  const { reindexing, handleReindex } = useReindex(
    kbId,
    linkedFiles,
    loadStats,
    refreshCurrentKnowledgeBase
  )

  const indexingStatus = kbId ? indexStore.isKBIndexing(kbId) : false
  const kbIndexingFiles = kbId ? indexStore.getKBIndexingFilesMap(kbId) : {}

  const needsReindex = knowledgeBase?.indexInvalidation?.needsReindex === true
  const invalidatedFiles = knowledgeBase?.indexInvalidation?.files || []
  const invalidatedFileIds = invalidatedFiles.map((file) => file.fileId)

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
  const prevKbIdRef = useRef(kbId)

  useEffect(() => {
    if (kbId && kbId !== prevKbIdRef.current) {
      prevKbIdRef.current = kbId
      loadLinkedFiles()
      loadStats()
      indexStore.restoreStatus(kbId)
    } else if (!kbId) {
      prevKbIdRef.current = undefined
      setStats({ fileCount: 0, chunkCount: 0, dbSize: 0 })
    }
  }, [kbId, loadLinkedFiles, loadStats, indexStore])

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
                    placeholder="补充知识库用途、范围和检索约束..."
                    onChange={(e) => setEditingDescription(e.target.value)}
                    onBlur={saveDescription}
                    onKeyDown={handleDescriptionKeydown}
                  ></textarea>
                ) : (
                  <p
                    className={`${styles.kbDescription} ${!knowledgeBase.description ? 'kb-description-empty' : ''}`}
                    onDoubleClick={startEditDescription}
                  >
                    {knowledgeBase.description || '双击编辑，补充知识库用途、覆盖范围和检索约束。'}
                  </p>
                )}

                <StatsPanel stats={stats} loadingStats={loadingStats} currentKB={knowledgeBase} />
              </div>
            </div>

            {needsReindex && (
              <div className="kb-reindex-notice">
                <div className="kb-reindex-notice__copy">
                  <strong>需要重新索引</strong>
                  <span>论文笔记已更新，重新索引后检索结果会使用最新笔记内容。</span>
                  {invalidatedFiles.length > 0 && (
                    <ul>
                      {invalidatedFiles.map((file) => (
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
            invalidatedFileIds={invalidatedFileIds}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onAddFiles={handleAddFiles}
            onReindex={handleReindex}
            onUnlinkFile={(id) => handleUnlinkFile(id, handleReindex)}
          />
        </div>
      ) : (
        <div className={['sm-empty', styles.emptyKb].join(' ')}>
          <h2>选择或创建知识库</h2>
          <p>从左侧选择一个知识库，开始管理文档、索引和检索实验。</p>
        </div>
      )}
    </main>
  )
}
