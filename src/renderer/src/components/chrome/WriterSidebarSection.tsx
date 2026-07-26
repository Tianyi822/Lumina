import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import { useNotification } from '@renderer/composables/useNotification'
import WriterOutlinePanel from '@renderer/components/writer/outline/WriterOutlinePanel'
import {
  getWriterDocumentVirtualizationConfig,
  getWriterSidebarDocumentRenderPlan,
  useWriterLibraryStore
} from '@renderer/stores/writer'
import type { WriterCollection } from '@renderer/stores/writer'
import styles from './WriterSidebarSection.module.css'

function formatUpdatedAt(updatedAt: string): string {
  const date = new Date(updatedAt)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date)
}

interface WriterDocumentListProps {
  documents: ReturnType<typeof useWriterLibraryStore.getState>['documents']
  nested?: boolean
  renderDocument: (
    document: ReturnType<typeof useWriterLibraryStore.getState>['documents'][number]
  ) => ReactNode
}

/** 每个文档集合独立滚动和测量，静态导航不参与虚拟列表坐标计算。 */
function WriterDocumentList({
  documents,
  nested = false,
  renderDocument
}: WriterDocumentListProps) {
  const documentListRef = useRef<HTMLDivElement>(null)
  const virtualization = getWriterDocumentVirtualizationConfig(documents.length)
  const virtualizer = useVirtualizer({
    count: virtualization.enabled ? documents.length : 0,
    getScrollElement: () => documentListRef.current,
    estimateSize: () => 64,
    overscan: 8
  })

  return (
    <div
      ref={documentListRef}
      className={[styles.documentList, nested && styles.folderDocumentList]
        .filter(Boolean)
        .join(' ')}
    >
      {virtualization.enabled ? (
        <div className={styles.virtualList} style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualItem) => (
            <div
              key={virtualItem.key}
              className={styles.virtualRow}
              data-index={virtualItem.index}
              ref={virtualization.measureRows ? virtualizer.measureElement : undefined}
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              {renderDocument(documents[virtualItem.index])}
            </div>
          ))}
        </div>
      ) : (
        documents.map(renderDocument)
      )}
    </div>
  )
}

/** 写作侧边栏，提供文档库筛选、文件夹与当前文档大纲入口。 */
const WriterSidebarSection = memo(function WriterSidebarSection() {
  const documents = useWriterLibraryStore((state) => state.documents)
  const folders = useWriterLibraryStore((state) => state.folders)
  const currentDocumentId = useWriterLibraryStore((state) => state.currentDocumentId)
  const searchQuery = useWriterLibraryStore((state) => state.searchQuery)
  const sidebarMode = useWriterLibraryStore((state) => state.sidebarMode)
  const activeCollection = useWriterLibraryStore((state) => state.activeCollection)
  const isLoading = useWriterLibraryStore((state) => state.isLoading)
  const error = useWriterLibraryStore((state) => state.error)
  const load = useWriterLibraryStore((state) => state.load)
  const createAndOpen = useWriterLibraryStore((state) => state.createAndOpen)
  const deletePermanently = useWriterLibraryStore((state) => state.deletePermanently)
  const deleteFolder = useWriterLibraryStore((state) => state.deleteFolder)
  const setSearchQuery = useWriterLibraryStore((state) => state.setSearchQuery)
  const setSidebarMode = useWriterLibraryStore((state) => state.setSidebarMode)
  const setActiveCollection = useWriterLibraryStore((state) => state.setActiveCollection)
  const setCurrentDocumentId = useWriterLibraryStore((state) => state.setCurrentDocumentId)
  const toggleFavorite = useWriterLibraryStore((state) => state.toggleFavorite)
  const visibleDocuments = useWriterLibraryStore((state) => state.visibleDocuments)
  const notify = useNotification()
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    void load()
  }, [load])

  const filteredDocuments = useMemo(
    () => visibleDocuments(),
    [activeCollection, documents, searchQuery, visibleDocuments]
  )
  const documentRenderPlan = useMemo(
    () =>
      getWriterSidebarDocumentRenderPlan({
        documents: filteredDocuments,
        folders,
        collection: activeCollection,
        expandedFolderIds
      }),
    [activeCollection, expandedFolderIds, filteredDocuments, folders]
  )

  const selectCollection = useCallback(
    (collection: WriterCollection): void => {
      if (collection !== 'all') setExpandedFolderIds(new Set())
      setActiveCollection(collection)
    },
    [setActiveCollection]
  )

  const toggleFolder = useCallback(
    (folderId: string): void => {
      setActiveCollection('all')
      setExpandedFolderIds((current) => {
        const next = new Set(current)
        if (next.has(folderId)) next.delete(folderId)
        else next.add(folderId)
        return next
      })
    },
    [setActiveCollection]
  )

  const handleDeleteDocument = useCallback(
    async (documentId: string): Promise<void> => {
      const confirmed = await notify.confirm('此操作不可撤销。', {
        title: '永久删除文档',
        danger: true
      })
      if (confirmed) await deletePermanently(documentId)
    },
    [deletePermanently, notify]
  )

  const handleDeleteFolder = useCallback(
    async (folderId: string): Promise<void> => {
      const confirmed = await notify.confirm('删除文件夹后，文档将移回全部文档。', {
        title: '删除文件夹',
        danger: true
      })
      if (confirmed) await deleteFolder(folderId)
    },
    [deleteFolder, notify]
  )

  const renderDocument = useCallback(
    (document: (typeof filteredDocuments)[number]) => (
      <div
        key={document.id}
        className={[styles.document, document.id === currentDocumentId && styles.documentActive]
          .filter(Boolean)
          .join(' ')}
      >
        <button
          type="button"
          className={styles.documentSelect}
          aria-current={document.id === currentDocumentId ? 'page' : undefined}
          onClick={() => setCurrentDocumentId(document.id)}
        >
          <span className={styles.documentTitle}>{document.title}</span>
          <span className={styles.documentMeta}>{formatUpdatedAt(document.updatedAt)}</span>
        </button>
        <button
          type="button"
          className={styles.documentAction}
          aria-label={document.favorite ? '取消收藏' : '收藏文档'}
          aria-pressed={document.favorite}
          onClick={() => void toggleFavorite(document.id)}
        >
          {document.favorite ? '★' : '☆'}
        </button>
        <button
          type="button"
          className={styles.documentAction}
          aria-label="永久删除文档"
          onClick={() => void handleDeleteDocument(document.id)}
        >
          <SvgIcon name="trash" size={14} />
        </button>
      </div>
    ),
    [currentDocumentId, handleDeleteDocument, setCurrentDocumentId, toggleFavorite]
  )

  const collectionItems: Array<{ id: WriterCollection; label: string }> = [
    { id: 'favorites', label: '收藏' },
    { id: 'recent', label: '最近' },
    { id: 'all', label: '全部' }
  ]
  const handleSegmentKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    if (event.key === 'ArrowLeft' || event.key === 'Home') setSidebarMode('documents')
    else setSidebarMode('outline')
  }

  return (
    <div className={styles.section}>
      <div className={styles.segmented} role="tablist" aria-label="写作侧边栏内容">
        <button
          type="button"
          role="tab"
          aria-selected={sidebarMode === 'documents'}
          tabIndex={sidebarMode === 'documents' ? 0 : -1}
          className={[styles.segment, sidebarMode === 'documents' && styles.segmentActive]
            .filter(Boolean)
            .join(' ')}
          onClick={() => setSidebarMode('documents')}
          onKeyDown={handleSegmentKeyDown}
        >
          文档
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sidebarMode === 'outline'}
          tabIndex={sidebarMode === 'outline' ? 0 : -1}
          className={[styles.segment, sidebarMode === 'outline' && styles.segmentActive]
            .filter(Boolean)
            .join(' ')}
          onClick={() => setSidebarMode('outline')}
          onKeyDown={handleSegmentKeyDown}
        >
          大纲
        </button>
      </div>

      {sidebarMode === 'outline' ? (
        <div className={styles.library} role="tabpanel">
          <WriterOutlinePanel />
        </div>
      ) : (
        <div className={styles.library} role="tabpanel">
          <div className={styles.searchGroup}>
            <div className={styles.search}>
              <SvgIcon name="search" size={14} />
              <input
                type="search"
                className={styles.searchInput}
                placeholder="搜索文档"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}

          <div className={styles.list}>
            <div className={styles.collections} aria-label="文档集合">
              {collectionItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={[
                    styles.collection,
                    activeCollection === item.id && styles.collectionActive
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={activeCollection === item.id}
                  onClick={() => selectCollection(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {folders.length > 0 && (
              <div className={styles.folders}>
                <span className={styles.groupLabel}>文件夹</span>
                {folders.map((folder) => {
                  const isExpanded = expandedFolderIds.has(folder.id)
                  const folderBucket = documentRenderPlan.find((bucket) => bucket.id === folder.id)
                  return (
                    <div key={folder.id} className={styles.folder}>
                      <div className={styles.folderHeader}>
                        <button
                          type="button"
                          className={styles.folderSelect}
                          aria-expanded={isExpanded}
                          onClick={() => toggleFolder(folder.id)}
                        >
                          <span aria-hidden="true">{isExpanded ? '⌄' : '›'}</span>
                          {folder.name}
                        </button>
                        <button
                          type="button"
                          className={styles.folderDelete}
                          aria-label={`删除文件夹 ${folder.name}`}
                          onClick={() => void handleDeleteFolder(folder.id)}
                        >
                          <SvgIcon name="trash" size={14} />
                        </button>
                      </div>
                      {isExpanded && (
                        <div className={styles.folderDocuments}>
                          {folderBucket && folderBucket.documents.length > 0 ? (
                            <WriterDocumentList
                              documents={folderBucket.documents}
                              nested
                              renderDocument={renderDocument}
                            />
                          ) : (
                            <span className={styles.folderEmpty}>文件夹内暂无文档</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {isLoading ? <div className={styles.empty}>正在加载文档…</div> : null}
            {!isLoading && filteredDocuments.length === 0 ? (
              <div className={styles.empty}>
                <span>{searchQuery ? '未找到匹配的文档' : '暂无文档'}</span>
                {!searchQuery && (
                  <button
                    type="button"
                    className="sm-button sm-button--secondary"
                    onClick={() => void createAndOpen()}
                  >
                    新建第一个文档
                  </button>
                )}
              </div>
            ) : null}

            <WriterDocumentList
              documents={
                documentRenderPlan.find((bucket) => bucket.placement !== 'folder')?.documents ?? []
              }
              renderDocument={renderDocument}
            />
          </div>
        </div>
      )}
    </div>
  )
})

export default WriterSidebarSection
