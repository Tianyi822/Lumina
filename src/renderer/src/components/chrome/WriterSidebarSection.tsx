import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ParseKeys } from 'i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import { getDateLocale } from '@renderer/i18n'
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
  return new Intl.DateTimeFormat(getDateLocale(), {
    month: 'numeric',
    day: 'numeric'
  }).format(date)
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
  const { t } = useTranslation()
  const documents = useWriterLibraryStore((state) => state.documents)
  const folders = useWriterLibraryStore((state) => state.folders)
  const currentDocumentId = useWriterLibraryStore((state) => state.currentDocumentId)
  const searchQuery = useWriterLibraryStore((state) => state.searchQuery)
  const sidebarMode = useWriterLibraryStore((state) => state.sidebarMode)
  const activeCollection = useWriterLibraryStore((state) => state.activeCollection)
  const isLoading = useWriterLibraryStore((state) => state.isLoading)
  const error = useWriterLibraryStore((state) => state.error)
  const load = useWriterLibraryStore((state) => state.load)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visibleDocuments 为 store 恒定引用，需靠 activeCollection/documents/searchQuery 触发重算
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
      const confirmed = await notify.confirm(t('notifications.writer.confirmIrreversible'), {
        title: t('notifications.writer.deleteDocumentTitle'),
        danger: true
      })
      if (confirmed) await deletePermanently(documentId)
    },
    [deletePermanently, notify, t]
  )

  const handleDeleteFolder = useCallback(
    async (folderId: string): Promise<void> => {
      const confirmed = await notify.confirm(t('notifications.writer.deleteFolderMessage'), {
        title: t('notifications.writer.deleteFolderTitle'),
        danger: true
      })
      if (confirmed) await deleteFolder(folderId)
    },
    [deleteFolder, notify, t]
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
          aria-label={
            document.favorite ? t('chrome.sidebar.favoriteRemove') : t('chrome.sidebar.favoriteAdd')
          }
          aria-pressed={document.favorite}
          onClick={() => void toggleFavorite(document.id)}
        >
          {document.favorite ? '★' : '☆'}
        </button>
        <button
          type="button"
          className={styles.documentAction}
          aria-label={t('chrome.sidebar.deleteDocumentPermanent')}
          onClick={() => void handleDeleteDocument(document.id)}
        >
          <SvgIcon name="trash" size={14} />
        </button>
      </div>
    ),
    [currentDocumentId, handleDeleteDocument, setCurrentDocumentId, t, toggleFavorite]
  )

  const collectionItems: Array<{ id: WriterCollection; labelKey: ParseKeys }> = [
    { id: 'favorites', labelKey: 'chrome.sidebar.favorite' },
    { id: 'recent', labelKey: 'chrome.sidebar.recent' },
    { id: 'all', labelKey: 'chrome.sidebar.all' }
  ]
  const handleSegmentKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    if (event.key === 'ArrowLeft' || event.key === 'Home') setSidebarMode('documents')
    else setSidebarMode('outline')
  }

  return (
    <div className={styles.section}>
      <div
        className={styles.segmented}
        role="tablist"
        aria-label={t('chrome.sidebar.writerSidebarAria')}
      >
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
          {t('chrome.sidebar.tabDocuments')}
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
          {t('chrome.sidebar.tabOutline')}
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
                placeholder={t('chrome.sidebar.searchDocument')}
                aria-label={t('chrome.sidebar.searchDocument')}
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
            <div className={styles.collections} aria-label={t('chrome.sidebar.collectionsAria')}>
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
                  {t(item.labelKey)}
                </button>
              ))}
            </div>

            {folders.length > 0 && (
              <div className={styles.folders}>
                <span className={styles.groupLabel}>{t('chrome.sidebar.folders')}</span>
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
                          aria-label={t('chrome.sidebar.deleteFolderNamed', { name: folder.name })}
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
                            <span className={styles.folderEmpty}>
                              {t('chrome.sidebar.folderEmpty')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {isLoading ? (
              <div className={styles.empty}>{t('chrome.sidebar.loadingDocuments')}</div>
            ) : null}
            {!isLoading && filteredDocuments.length === 0 ? (
              <div className={styles.empty}>
                <span>
                  {searchQuery
                    ? t('chrome.sidebar.noMatchDocument')
                    : t('chrome.sidebar.emptyDocument')}
                </span>
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
