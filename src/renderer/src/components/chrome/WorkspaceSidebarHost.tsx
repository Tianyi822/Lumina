import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import type { CSSProperties } from 'react'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import LabList from '@renderer/components/lab/LabList'
import WorkspaceSidebarChrome from '@renderer/components/chrome/WorkspaceSidebarChrome'
import PaperSidebar from '@renderer/components/paper/PaperSidebar'
import { CssSwitchTransition, CssTransitionGroup } from '@renderer/components/motion/CssTransition'
import { getSidebarListItemMotionStyle } from '@renderer/utils/sidebarListMotion'
import { summarizeTranslationAnnotations } from '@shared/utils/paperTranslationAnnotations'
import { extractTranslatedDocumentTitle } from '@shared/utils/paperTranslation'
import {
  useKnowledgeStore,
  useUIStateStore,
  useLabStore,
  useLabListStore,
  useLabOperationStore
} from '@renderer/stores'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import { useNotification } from '@renderer/composables/useNotification'
import type { OcrProgressInfo, PaperDocument } from '@shared/types/paper'
import type { RenderingProgress } from '@renderer/stores/paperReaderStore'
import styles from './WorkspaceSidebarHost.module.css'

const PAPER_SIDEBAR_MIN_WIDTH = 260
const PAPER_SIDEBAR_MAX_WIDTH = 480

export default function WorkspaceSidebarHost() {
  const currentView = useUIStateStore((s) => s.currentView)
  const isCurrentSidebarCollapsed = useUIStateStore((s) => s.isCurrentSidebarCollapsed())
  const openKnowledgeFileManager = useUIStateStore((s) => s.openKnowledgeFileManager)
  const openLabCreator = useUIStateStore((s) => s.openLabCreator)
  const openConfigManager = useUIStateStore((s) => s.openConfigManager)
  const paperSidebarWidth = useUIStateStore((s) => s.paperSidebarWidth)
  const setPaperSidebarWidth = useUIStateStore((s) => s.setPaperSidebarWidth)

  const paperReaderStore = usePaperReaderStore()
  // 从子 store 获取响应式数据
  const currentLab = useLabListStore((s) => s.currentLab)
  const labList = useLabListStore((s) => s.labList)
  const deleteConfirmState = useLabOperationStore((s) => s.deleteConfirmState)
  // 从 facade 获取 actions
  const labStore = useLabStore()
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
  const translationVisible = paperReaderStore.translationVisible

  // 从翻译缓存中提取各论文的译文标题
  const translatedTitleByPaperId = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    const caches = paperReaderStore.translationByPaperId ?? {}
    for (const [paperId, cache] of Object.entries(caches)) {
      const title = extractTranslatedDocumentTitle(cache)
      if (title) map[paperId] = title
    }
    return map
  }, [paperReaderStore.translationByPaperId])

  // 按需加载未缓存的翻译数据（用于侧边栏显示译文标题）
  useEffect(() => {
    const hasMap = paperReaderStore.hasTranslationByPaperId ?? {}
    const cacheMap = paperReaderStore.translationByPaperId ?? {}
    const idsToLoad = papers
      .filter((p: PaperDocument) => hasMap[p.id] && !cacheMap[p.id])
      .map((p: PaperDocument) => p.id)

    if (idsToLoad.length === 0) return

    void (async () => {
      for (let i = 0; i < idsToLoad.length; i += 3) {
        const batch = idsToLoad.slice(i, i + 3)
        await Promise.all(batch.map((id) => paperReaderStore.loadTranslationState(id)))
      }
    })()
  }, [papers, paperReaderStore])

  const [knowledgeSearchQuery, setKnowledgeSearchQuery] = useState('')
  const [labSearchQuery, setLabSearchQuery] = useState('')
  const [paperSearchQuery, setPaperSearchQuery] = useState('')
  const [isRefreshingLabList, setIsRefreshingLabList] = useState(false)

  // 侧边栏拉伸 refs
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const sidebarFrameRef = useRef<HTMLDivElement>(null)
  const isResizingSidebarRef = useRef(false)
  const sidebarWidthRef = useRef(paperSidebarWidth)
  const pendingSidebarWidthRef = useRef<number | null>(null)
  const sidebarResizeRafRef = useRef<number | null>(null)

  // 同步 store 宽度到 ref
  useEffect(() => {
    if (!isResizingSidebarRef.current) {
      sidebarWidthRef.current = paperSidebarWidth
    }
  }, [paperSidebarWidth])

  // 论文视图使用自定义宽度，其他视图移除 CSS 变量恢复默认
  useEffect(() => {
    if (currentView === 'paper') {
      sidebarFrameRef.current?.style.setProperty('--paper-sidebar-width', `${paperSidebarWidth}px`)
    } else {
      sidebarFrameRef.current?.style.removeProperty('--paper-sidebar-width')
    }
  }, [currentView, paperSidebarWidth])

  const applySidebarWidth = useCallback((nextWidth: number) => {
    const width = Math.min(
      Math.max(Math.round(nextWidth), PAPER_SIDEBAR_MIN_WIDTH),
      PAPER_SIDEBAR_MAX_WIDTH
    )
    sidebarWidthRef.current = width
    pendingSidebarWidthRef.current = width

    if (sidebarResizeRafRef.current !== null) return

    sidebarResizeRafRef.current = requestAnimationFrame(() => {
      sidebarResizeRafRef.current = null
      const pendingWidth = pendingSidebarWidthRef.current
      pendingSidebarWidthRef.current = null
      if (pendingWidth === null) return
      sidebarFrameRef.current?.style.setProperty('--paper-sidebar-width', `${pendingWidth}px`)
    })
  }, [])

  const handleSidebarResizeMove = useCallback(
    (event: PointerEvent) => {
      if (!isResizingSidebarRef.current) return
      applySidebarWidth(event.clientX)
    },
    [applySidebarWidth]
  )

  const stopSidebarResize = useCallback(() => {
    if (!isResizingSidebarRef.current) return

    isResizingSidebarRef.current = false
    setIsResizingSidebar(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('pointermove', handleSidebarResizeMove)
    window.removeEventListener('pointerup', stopSidebarResize)

    if (sidebarResizeRafRef.current !== null) {
      cancelAnimationFrame(sidebarResizeRafRef.current)
      sidebarResizeRafRef.current = null
    }
    pendingSidebarWidthRef.current = null
    setPaperSidebarWidth(sidebarWidthRef.current)
  }, [handleSidebarResizeMove, setPaperSidebarWidth])

  const startSidebarResize = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault()
      isResizingSidebarRef.current = true
      setIsResizingSidebar(true)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      window.addEventListener('pointermove', handleSidebarResizeMove)
      window.addEventListener('pointerup', stopSidebarResize)
      handleSidebarResizeMove(event.nativeEvent)
    },
    [handleSidebarResizeMove, stopSidebarResize]
  )

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
    if (!labSearchQuery.trim()) return labList
    const query = labSearchQuery.toLowerCase()
    return labList.filter((lab) => lab.name.toLowerCase().includes(query))
  }, [labSearchQuery, labList])

  const filteredPapers = useMemo(() => {
    if (!paperSearchQuery.trim()) return papers
    const query = paperSearchQuery.toLowerCase()
    return papers.filter((paper) => paper.fileName.toLowerCase().includes(query))
  }, [papers, paperSearchQuery])

  const getKnowledgeBaseKey = useCallback((kb: { id: string }): string => kb.id, [])

  const sidebarCount = useMemo(() => {
    if (currentView === 'paper') return papers.length
    if (currentView === 'knowledge') return knowledgeBases.length
    return (labList ?? []).length
  }, [currentView, knowledgeBases.length, labList, papers.length])

  const deletingLabId = deleteConfirmState.isDeleting ? deleteConfirmState.labId : null

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
      if (currentLab?.labId) {
        await labStore.loadLab(currentLab.labId, true)
      }
    } finally {
      setIsRefreshingLabList(false)
    }
  }, [currentLab?.labId, isRefreshingLabList, labStore])

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
      ref={sidebarFrameRef}
      className={[
        'sm-sidebar-frame',
        styles['sm-sidebar-frame'],
        isCurrentSidebarCollapsed && 'is-collapsed',
        isResizingSidebar && styles['sm-sidebar-frame--resizing']
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
            <CssSwitchTransition name="sm-sidebar-search-switch" transitionKey={currentView} appear>
              {({ transitionKey, className, ref }) => (
                <div
                  ref={ref}
                  className={[
                    'sm-sidebar-shell__search',
                    styles['sm-workspace-sidebar-host__search'],
                    className
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {transitionKey === 'paper' && (
                    <input
                      type="text"
                      className="sm-input"
                      placeholder="搜索论文"
                      value={paperSearchQuery}
                      onChange={(e) => setPaperSearchQuery(e.target.value)}
                    />
                  )}

                  {transitionKey === 'knowledge' && (
                    <input
                      type="text"
                      className="sm-input"
                      placeholder="搜索知识库"
                      value={knowledgeSearchQuery}
                      onChange={(e) => setKnowledgeSearchQuery(e.target.value)}
                    />
                  )}

                  {transitionKey === 'lab' && (
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
              )}
            </CssSwitchTransition>

            <CssSwitchTransition name="sm-sidebar-body-switch" transitionKey={currentView} appear>
              {({ transitionKey, className, ref }) => (
                <div
                  ref={ref}
                  className={[
                    'sm-sidebar-shell__body',
                    'sm-sidebar-shell__body--flush',
                    styles['sm-workspace-sidebar-host__body'],
                    className
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {transitionKey === 'paper' && (
                    <PaperSidebar
                      papers={filteredPapers}
                      currentPaperId={currentPaperId}
                      renderProgressByPaperId={renderProgressByPaperId}
                      ocrProgressByPaperId={ocrProgressByPaperId}
                      hasTranslationByPaperId={hasTranslationByPaperId}
                      translatedTitleByPaperId={translatedTitleByPaperId}
                      translationVisible={translationVisible}
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

                  {transitionKey === 'knowledge' && (
                    <div className={styles['sm-workspace-sidebar-host__kb-list']}>
                      <CssTransitionGroup
                        items={filteredKnowledgeBases}
                        name="sm-sidebar-list-item"
                        getKey={getKnowledgeBaseKey}
                        appear
                      >
                        {({ item: kb, index, transitionKey: kbKey, className, ref }) => (
                          <div
                            ref={ref}
                            key={kbKey}
                            className={[
                              styles['sm-workspace-sidebar-host__kb-item'],
                              kb.id === activeKbId && styles['is-active'],
                              className
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            style={getSidebarListItemMotionStyle(index) as CSSProperties}
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
                        )}
                      </CssTransitionGroup>
                      {filteredKnowledgeBases.length === 0 && (
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

                  {transitionKey === 'lab' && (
                    <LabList
                      labs={filteredLabs}
                      activeLabId={currentLab?.labId}
                      deletingLabId={deletingLabId}
                      onSelect={handleSelectLab}
                      onDelete={handleDeleteLab}
                    />
                  )}
                </div>
              )}
            </CssSwitchTransition>
          </div>
        </div>
      </aside>
      {currentView === 'paper' && !isCurrentSidebarCollapsed && (
        <div
          className={styles.sidebarResizeHandle}
          role="separator"
          aria-orientation="vertical"
          onPointerDown={startSidebarResize}
        />
      )}
    </div>
  )
}
