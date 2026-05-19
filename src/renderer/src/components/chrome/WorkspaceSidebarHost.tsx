import { useState, useMemo, useCallback, useEffect } from 'react'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import LabList from '@renderer/components/lab/LabList'
import WorkspaceSidebarChrome from '@renderer/components/chrome/WorkspaceSidebarChrome'
import PaperSidebar from '@renderer/components/paper/PaperSidebar'
import { getSidebarListItemMotionStyle } from '@renderer/utils/sidebarListMotion'
import { summarizeTranslationAnnotations } from '@shared/utils/paperTranslationAnnotations'
import { useKnowledgeStore, useUIStateStore } from '@renderer/stores'
import { usePiniaStore } from '@renderer/composables/usePiniaStore'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import { useLabStoreReact } from '@renderer/stores/lab/reactAdapters'
import { useNotification } from '@renderer/composables/useNotification'
import type { OcrProgressInfo, PaperDocument } from '@shared/types/paper'
import type { RenderingProgress } from '@renderer/stores/paperReaderStore'
import styles from './WorkspaceSidebarHost.module.css'

export default function WorkspaceSidebarHost() {
  const currentView = useUIStateStore((s) => s.currentView)
  const isCurrentSidebarCollapsed = useUIStateStore((s) => s.isCurrentSidebarCollapsed())
  const openKnowledgeFileManager = useUIStateStore((s) => s.openKnowledgeFileManager)
  const openLabCreator = useUIStateStore((s) => s.openLabCreator)
  const openConfigManager = useUIStateStore((s) => s.openConfigManager)

  const paperReaderStore = usePiniaStore(usePaperReaderStore)
  const labStore = useLabStoreReact()
  const notify = useNotification()

  const knowledgeBases = useKnowledgeStore((s) => s.knowledgeBases)
  const activeKbId = useKnowledgeStore((s) => s.activeKbId)
  const setActiveKb = useKnowledgeStore((s) => s.setActiveKb)
  const openCreateForm = useKnowledgeStore((s) => s.openCreateForm)
  const deleteKnowledgeBase = useKnowledgeStore((s) => s.deleteKnowledgeBase)
  const knowledgeError = useKnowledgeStore((s) => s.error)

  const papers = useMemo<PaperDocument[]>(
    () => (paperReaderStore.papers ?? []) as PaperDocument[],
    [paperReaderStore.papers]
  )
  const currentPaperId = (paperReaderStore.currentPaperId ?? null) as string | null
  const renderProgressByPaperId = useMemo<Record<string, RenderingProgress>>(
    () => (paperReaderStore.renderProgressByPaperId ?? {}) as Record<string, RenderingProgress>,
    [paperReaderStore.renderProgressByPaperId]
  )
  const ocrProgressByPaperId = useMemo<Record<string, OcrProgressInfo>>(
    () => (paperReaderStore.ocrProgressByPaperId ?? {}) as Record<string, OcrProgressInfo>,
    [paperReaderStore.ocrProgressByPaperId]
  )
  const hasTranslationByPaperId = useMemo<Record<string, boolean>>(
    () => (paperReaderStore.hasTranslationByPaperId ?? {}) as Record<string, boolean>,
    [paperReaderStore.hasTranslationByPaperId]
  )

  const [knowledgeSearchQuery, setKnowledgeSearchQuery] = useState('')
  const [labSearchQuery, setLabSearchQuery] = useState('')
  const [paperSearchQuery, setPaperSearchQuery] = useState('')
  const [isRefreshingLabList, setIsRefreshingLabList] = useState(false)

  const filteredKnowledgeBases = useMemo(() => {
    if (!knowledgeSearchQuery.trim()) return knowledgeBases
    const query = knowledgeSearchQuery.toLowerCase()
    return knowledgeBases.filter(
      (kb) =>
        kb.name.toLowerCase().includes(query) ||
        (kb.description && kb.description.toLowerCase().includes(query))
    )
  }, [knowledgeBases, knowledgeSearchQuery])

  const filteredLabs = useMemo(() => {
    const labList = labStore.labList ?? []
    if (!labSearchQuery.trim()) return labList
    const query = labSearchQuery.toLowerCase()
    return labList.filter((lab) => lab.name.toLowerCase().includes(query))
  }, [labSearchQuery, labStore.labList])

  const filteredPapers = useMemo(() => {
    if (!paperSearchQuery.trim()) return papers
    const query = paperSearchQuery.toLowerCase()
    return papers.filter((paper) => paper.fileName.toLowerCase().includes(query))
  }, [papers, paperSearchQuery])

  const sidebarCount = useMemo(() => {
    if (currentView === 'paper') return papers.length
    if (currentView === 'knowledge') return knowledgeBases.length
    return (labStore.labList ?? []).length
  }, [currentView, knowledgeBases.length, labStore.labList, papers.length])

  const deletingLabId = labStore.deleteConfirmState?.isDeleting
    ? labStore.deleteConfirmState.labId
    : null

  const handleSelectKnowledgeBase = useCallback(
    (kbId: string): void => {
      setActiveKb(kbId)
    },
    [setActiveKb]
  )

  const handleCreateKnowledgeBase = useCallback((): void => {
    openCreateForm()
  }, [openCreateForm])

  const handleManageKnowledgeFiles = useCallback((): void => {
    openKnowledgeFileManager()
  }, [openKnowledgeFileManager])

  const handleDeleteKnowledgeBase = useCallback(
    async (kbId: string): Promise<void> => {
      const confirmed = await notify.confirm('此操作不可撤销。', {
        title: '删除知识库',
        source: 'knowledge',
        danger: true
      })
      if (!confirmed) return

      const success = await deleteKnowledgeBase(kbId)
      if (!success) {
        notify.error('删除知识库失败', knowledgeError || '未知错误', { source: 'knowledge' })
      }
    },
    [deleteKnowledgeBase, knowledgeError, notify]
  )

  function formatDocumentCount(linkedFileIds?: string[]): string {
    const count = linkedFileIds?.length || 0
    if (count === 0) return '0 个文档'
    if (count === 1) return '1 个文档'
    return `${count} 个文档`
  }

  function needsReindex(kb: { indexInvalidation?: { needsReindex?: boolean } }): boolean {
    return kb.indexInvalidation?.needsReindex === true
  }

  const handleSelectLab = useCallback(
    (labId: string): void => {
      void labStore.handleSelectLab(labId)
    },
    [labStore]
  )

  const handleDeleteLab = useCallback(
    (labId: string): void => {
      void labStore.handleDeleteLab(labId)
    },
    [labStore]
  )

  const handleRefreshLabList = useCallback(async (): Promise<void> => {
    if (isRefreshingLabList) {
      return
    }

    setIsRefreshingLabList(true)
    try {
      await labStore.refreshLabList()
      if (labStore.currentLab?.labId) {
        await labStore.loadLab(labStore.currentLab.labId, true)
      }
    } finally {
      setIsRefreshingLabList(false)
    }
  }, [isRefreshingLabList, labStore])

  const handleUploadPdf = useCallback(async (): Promise<void> => {
    await paperReaderStore.uploadAndRenderPdf()
  }, [paperReaderStore])

  const handleSelectPaper = useCallback(
    async (paperId: string): Promise<void> => {
      const openedPaper = await paperReaderStore.openPaper(paperId)
      if (!openedPaper) {
        window.api.logger.warn('[WorkspaceSidebarHost] 打开论文失败', { paperId })
      }
    },
    [paperReaderStore]
  )

  const handleDeletePaper = useCallback(
    async (paperId: string): Promise<void> => {
      const confirmed = await notify.confirm('此操作不可撤销。', {
        title: '删除论文',
        source: 'paper',
        danger: true
      })
      if (!confirmed) return

      const success = await paperReaderStore.deletePaper(paperId)
      if (!success) {
        notify.error('删除论文失败', '请稍后重试或查看日志获取更多信息。', { source: 'paper' })
      }
    },
    [notify, paperReaderStore]
  )

  const handleRetryPaper = useCallback(
    async (paperId: string): Promise<void> => {
      const result = await paperReaderStore.retryPaper(paperId)
      if (!result.success) {
        notify.error('重试失败', result.error || '未知错误', { source: 'paper' })
      }
    },
    [notify, paperReaderStore]
  )

  const handleDeleteTranslation = useCallback(
    async (paperId: string): Promise<void> => {
      const cachedAnnotations = paperReaderStore.annotationsByPaperId[paperId]
      const annotations = cachedAnnotations ?? (await paperReaderStore.loadAnnotations(paperId))
      const translationSummary = summarizeTranslationAnnotations(annotations)

      if (translationSummary.totalCount > 0) {
        const confirmLines = [
          '当前译文里已经有标注内容。',
          `其中包含 ${translationSummary.totalCount} 条译文标注。`
        ]

        if (translationSummary.noteCount > 0) {
          confirmLines.push(`笔记 ${translationSummary.noteCount} 条`)
        }

        if (translationSummary.highlightCount > 0) {
          confirmLines.push(`标记 ${translationSummary.highlightCount} 条`)
        }

        confirmLines.push('删除译文后，这些译文标注也会一起删除。')
        confirmLines.push('确定继续删除译文吗？')

        const confirmed = await notify.confirm(confirmLines.join('\n'), {
          title: '删除译文',
          source: 'paper',
          danger: true
        })

        if (!confirmed) {
          return
        }
      }

      const result = await paperReaderStore.deleteTranslation(paperId)
      if (!result.success) {
        notify.error('删除译文失败', result.error || '未知错误', { source: 'paper' })
      }
    },
    [notify, paperReaderStore]
  )

  useEffect(() => {
    const unsubscribe = window.api.ssh?.onConnectionStatus(() => {
      void labStore.refreshLabList()
    })
    return () => {
      unsubscribe?.()
    }
  }, [labStore])

  const actions = useMemo(() => {
    if (currentView === 'paper') {
      return (
        <button
          className={[
            'sm-button',
            'sm-button--primary',
            styles['sm-workspace-sidebar-host__action']
          ].join(' ')}
          onClick={() => {
            void handleUploadPdf()
          }}
        >
          上传 PDF
        </button>
      )
    }

    if (currentView === 'knowledge') {
      return (
        <>
          <button
            className={[
              'sm-button',
              'sm-button--primary',
              styles['sm-workspace-sidebar-host__action']
            ].join(' ')}
            onClick={handleCreateKnowledgeBase}
          >
            新建知识库
          </button>
          <button
            className={[
              'sm-button',
              'sm-button--secondary',
              styles['sm-workspace-sidebar-host__action']
            ].join(' ')}
            onClick={handleManageKnowledgeFiles}
          >
            管理文件
          </button>
        </>
      )
    }

    return (
      <>
        <button
          className={[
            'sm-button',
            'sm-button--primary',
            styles['sm-workspace-sidebar-host__action']
          ].join(' ')}
          onClick={openLabCreator}
        >
          创建实验室
        </button>
        <button
          className={[
            'sm-button',
            'sm-button--secondary',
            styles['sm-workspace-sidebar-host__action']
          ].join(' ')}
          onClick={openConfigManager}
        >
          管理配置
        </button>
      </>
    )
  }, [
    currentView,
    handleCreateKnowledgeBase,
    handleManageKnowledgeFiles,
    handleUploadPdf,
    openConfigManager,
    openLabCreator
  ])

  return (
    <div
      className={[
        'sm-sidebar-frame',
        styles['sm-sidebar-frame'],
        isCurrentSidebarCollapsed && 'is-collapsed'
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <aside className={['sm-sidebar-shell', styles['sm-workspace-sidebar-host']].join(' ')}>
        <WorkspaceSidebarChrome count={sidebarCount} actionsKey={currentView}>
          {actions}
        </WorkspaceSidebarChrome>

        <div className={styles['sm-workspace-sidebar-host__viewport']}>
          <div className={styles['sm-workspace-sidebar-host__panel']}>
            <div
              className={[
                'sm-sidebar-shell__search',
                styles['sm-workspace-sidebar-host__search']
              ].join(' ')}
              key={`search-${currentView}`}
            >
              {currentView === 'paper' && (
                <input
                  type="text"
                  className="sm-input"
                  placeholder="搜索论文"
                  value={paperSearchQuery}
                  onChange={(e) => setPaperSearchQuery(e.target.value)}
                />
              )}

              {currentView === 'knowledge' && (
                <input
                  type="text"
                  className="sm-input"
                  placeholder="搜索知识库"
                  value={knowledgeSearchQuery}
                  onChange={(e) => setKnowledgeSearchQuery(e.target.value)}
                />
              )}

              {currentView === 'lab' && (
                <div className={styles['sm-workspace-sidebar-host__search--lab']}>
                  <input
                    type="text"
                    className="sm-input"
                    placeholder="搜索实验室"
                    value={labSearchQuery}
                    onChange={(e) => setLabSearchQuery(e.target.value)}
                  />
                  <button
                    className={[
                      'sm-icon-button',
                      styles['sm-workspace-sidebar-host__refresh-button']
                    ].join(' ')}
                    title="刷新列表"
                    disabled={isRefreshingLabList}
                    onClick={() => {
                      void handleRefreshLabList()
                    }}
                  >
                    <SvgIcon name="refresh" size={14} spin={isRefreshingLabList} />
                  </button>
                </div>
              )}
            </div>

            <div
              className={[
                'sm-sidebar-shell__body',
                'sm-sidebar-shell__body--flush',
                styles['sm-workspace-sidebar-host__body']
              ].join(' ')}
              key={`body-${currentView}`}
            >
              {currentView === 'paper' && (
                <PaperSidebar
                  papers={filteredPapers}
                  currentPaperId={currentPaperId}
                  renderProgressByPaperId={renderProgressByPaperId}
                  ocrProgressByPaperId={ocrProgressByPaperId}
                  hasTranslationByPaperId={hasTranslationByPaperId}
                  onSelectPaper={(paperId) => {
                    void handleSelectPaper(paperId)
                  }}
                  onDeletePaper={(paperId) => {
                    void handleDeletePaper(paperId)
                  }}
                  onDeleteTranslation={(paperId) => {
                    void handleDeleteTranslation(paperId)
                  }}
                  onRetryPaper={(paperId) => {
                    void handleRetryPaper(paperId)
                  }}
                />
              )}

              {currentView === 'knowledge' && (
                <div className={styles['sm-workspace-sidebar-host__kb-list']}>
                  {filteredKnowledgeBases.length > 0 ? (
                    filteredKnowledgeBases.map((kb, index) => (
                      <div
                        key={kb.id}
                        className={[
                          styles['sm-workspace-sidebar-host__kb-item'],
                          kb.id === activeKbId && styles['is-active']
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        style={getSidebarListItemMotionStyle(index)}
                        onClick={() => handleSelectKnowledgeBase(kb.id)}
                      >
                        <div className={styles['sm-workspace-sidebar-host__kb-icon']}>
                          {kb.name.charAt(0).toUpperCase()}
                        </div>
                        <div className={styles['sm-workspace-sidebar-host__kb-info']}>
                          <div className={styles['sm-workspace-sidebar-host__kb-name-row']}>
                            <div className={styles['sm-workspace-sidebar-host__kb-name']}>
                              {kb.name}
                            </div>
                            {needsReindex(kb) && (
                              <span className={styles['sm-workspace-sidebar-host__kb-stale']}>
                                需重索引
                              </span>
                            )}
                          </div>
                          <div className={styles['sm-workspace-sidebar-host__kb-meta']}>
                            {formatDocumentCount(kb.linkedFileIds)}
                          </div>
                        </div>
                        <button
                          className={styles['sm-workspace-sidebar-host__kb-delete']}
                          title="删除知识库"
                          onClick={(e) => {
                            e.stopPropagation()
                            void handleDeleteKnowledgeBase(kb.id)
                          }}
                        >
                          <SvgIcon name="trash" size={14} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className={styles['sm-workspace-sidebar-host__empty']}>
                      <div className={styles['sm-workspace-sidebar-host__empty-text']}>
                        {knowledgeSearchQuery ? '未找到匹配的知识库' : '暂无知识库'}
                      </div>
                      {!knowledgeSearchQuery && (
                        <button
                          className="sm-button sm-button--secondary sm-button--small"
                          onClick={handleCreateKnowledgeBase}
                        >
                          创建第一个知识库
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {currentView === 'lab' && (
                <LabList
                  labs={filteredLabs}
                  activeLabId={labStore.currentLab?.labId}
                  deletingLabId={deletingLabId}
                  onSelect={handleSelectLab}
                  onDelete={handleDeleteLab}
                />
              )}
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
