import { useState, useMemo, useCallback, useEffect } from 'react'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import WorkspaceSidebarChrome from '@renderer/components/chrome/WorkspaceSidebarChrome'
import { useKnowledgeStore, useUIStateStore } from '@renderer/stores'
import { useNotificationCenterStore } from '@renderer/stores/notificationCenterStore'
import { usePiniaStore } from '@renderer/composables/usePiniaStore'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import PaperSidebarContainer from '@renderer/components/paper/PaperSidebarContainer'
import styles from './WorkspaceSidebarHost.module.css'

export default function WorkspaceSidebarHost() {
  const currentView = useUIStateStore((s) => s.currentView)
  const isCurrentSidebarCollapsed = useUIStateStore((s) => s.isCurrentSidebarCollapsed())
  const paperStore = usePiniaStore(usePaperReaderStore)

  // Knowledge store (Zustand — available in React)
  const knowledgeBases = useKnowledgeStore((s) => s.knowledgeBases)
  const activeKbId = useKnowledgeStore((s) => s.activeKbId)
  const setActiveKb = useKnowledgeStore((s) => s.setActiveKb)
  const openCreateForm = useKnowledgeStore((s) => s.openCreateForm)
  const deleteKnowledgeBase = useKnowledgeStore((s) => s.deleteKnowledgeBase)
  const knowledgeError = useKnowledgeStore((s) => s.error)

  const [knowledgeSearchQuery, setKnowledgeSearchQuery] = useState('')
  const [labSearchQuery, setLabSearchQuery] = useState('')
  const [paperSearchQuery, setPaperSearchQuery] = useState('')

  // Filtered lists
  const filteredKnowledgeBases = useMemo(() => {
    if (!knowledgeSearchQuery.trim()) return knowledgeBases
    const query = knowledgeSearchQuery.toLowerCase()
    return knowledgeBases.filter(
      (kb) =>
        kb.name.toLowerCase().includes(query) ||
        (kb.description && kb.description.toLowerCase().includes(query))
    )
  }, [knowledgeBases, knowledgeSearchQuery])

  const sidebarCount = useMemo(() => {
    if (currentView === 'paper')
      return (paperStore.papers ?? []).length
    if (currentView === 'knowledge') return knowledgeBases.length
    return 0
  }, [currentView, knowledgeBases, paperStore.papers])

  // Handlers
  const handleSelectKnowledgeBase = useCallback(
    (kbId: string) => {
      setActiveKb(kbId)
    },
    [setActiveKb]
  )

  const handleCreateKnowledgeBase = useCallback(() => {
    openCreateForm()
  }, [openCreateForm])

  const handleManageKnowledgeFiles = useCallback(() => {
    useUIStateStore.getState().openKnowledgeFileManager()
  }, [])

  const handleDeleteKnowledgeBase = useCallback(
    async (kbId: string) => {
      const confirmed = await useNotificationCenterStore
        .getState()
        .requestConfirm('此操作不可撤销。', '删除知识库', true)
      if (!confirmed) return

      const success = await deleteKnowledgeBase(kbId)
      if (!success) {
        window.api.logger.warn('[WorkspaceSidebarHost] 删除知识库失败', {
          kbId,
          error: knowledgeError
        })
      }
    },
    [deleteKnowledgeBase, knowledgeError]
  )

  const handleOpenLabCreator = useCallback(() => {
    useUIStateStore.getState().openLabCreator()
  }, [])

  const handleOpenConfigManager = useCallback(() => {
    useUIStateStore.getState().openConfigManager()
  }, [])

  const handleUploadPdf = useCallback(() => {
    paperStore.uploadAndRenderPdf()
  }, [paperStore])

  // SSH status listener
  useEffect(() => {
    const unsubscribe = window.api.ssh?.onConnectionStatus(() => {
      // Lab list refresh — Phase 7
    })
    return () => {
      unsubscribe?.()
    }
  }, [])

  const actions = useMemo(() => {
    if (currentView === 'paper') {
      return (
        <button
          className={[
            'sm-button',
            'sm-button--primary',
            styles['sm-workspace-sidebar-host__action']
          ].join(' ')}
          onClick={handleUploadPdf}
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
          onClick={handleOpenLabCreator}
        >
          创建实验室
        </button>
        <button
          className={[
            'sm-button',
            'sm-button--secondary',
            styles['sm-workspace-sidebar-host__action']
          ].join(' ')}
          onClick={handleOpenConfigManager}
        >
          管理配置
        </button>
      </>
    )
  }, [
    currentView,
    handleUploadPdf,
    handleCreateKnowledgeBase,
    handleManageKnowledgeFiles,
    handleOpenLabCreator,
    handleOpenConfigManager
  ])

  return (
    <div
      className={[styles['sm-sidebar-frame'], isCurrentSidebarCollapsed && 'is-collapsed']
        .filter(Boolean)
        .join(' ')}
    >
      <aside className={['sm-sidebar-shell', styles['sm-workspace-sidebar-host']].join(' ')}>
        <WorkspaceSidebarChrome count={sidebarCount} actionsKey={currentView}>
          {actions}
        </WorkspaceSidebarChrome>

        <div className={styles['sm-workspace-sidebar-host__viewport']}>
          <div className={styles['sm-workspace-sidebar-host__panel']}>
            {/* Search bar per view */}
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
                  >
                    <SvgIcon name="refresh" size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* Body per view */}
            <div
              className={[
                'sm-sidebar-shell__body',
                'sm-sidebar-shell__body--flush',
                styles['sm-workspace-sidebar-host__body']
              ].join(' ')}
              key={`body-${currentView}`}
            >
              {currentView === 'paper' && <PaperSidebarContainer searchQuery={paperSearchQuery} />}

              {currentView === 'knowledge' && (
                <div className={styles['sm-workspace-sidebar-host__kb-list']}>
                  {filteredKnowledgeBases.length > 0 ? (
                    filteredKnowledgeBases.map((kb) => (
                      <div
                        key={kb.id}
                        className={[
                          styles['sm-workspace-sidebar-host__kb-item'],
                          kb.id === activeKbId && styles['is-active']
                        ]
                          .filter(Boolean)
                          .join(' ')}
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
                          </div>
                          <div className={styles['sm-workspace-sidebar-host__kb-meta']}>
                            {kb.linkedFileIds?.length || 0} 个文档
                          </div>
                        </div>
                        <button
                          className={styles['sm-workspace-sidebar-host__kb-delete']}
                          title="删除知识库"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteKnowledgeBase(kb.id)
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
                <div className={styles['sm-workspace-sidebar-host__empty']}>
                  <div className={styles['sm-workspace-sidebar-host__empty-text']}>
                    实验室列表 — Phase 7 迁移
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
