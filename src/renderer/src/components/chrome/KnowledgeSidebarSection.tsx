import { useState, useMemo, useCallback, memo } from 'react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import { CssTransitionGroup } from '@renderer/components/motion/CssTransition'
import { getSidebarListItemMotionStyle } from '@renderer/utils/sidebarListMotion'
import { useKnowledgeStore, useUIStateStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import styles from './WorkspaceSidebarHost.module.css'

function needsReindex(kb: {
  linkedFileIds?: string[]
  indexInvalidation?: { needsReindex?: boolean; files?: Array<{ fileId: string }> }
}): boolean {
  if (kb.indexInvalidation?.needsReindex !== true) return false
  const linkedFileIds = new Set(kb.linkedFileIds || [])
  return kb.indexInvalidation.files?.some((file) => linkedFileIds.has(file.fileId)) === true
}

/**
 * 知识库侧边栏内容组件
 * 提供知识库列表搜索、切换、创建、删除及文件管理入口
 */
const KnowledgeSidebarSection = memo(function KnowledgeSidebarSection() {
  const { t } = useTranslation()
  const knowledgeBases = useKnowledgeStore((s) => s.knowledgeBases)
  const activeKbId = useKnowledgeStore((s) => s.activeKbId)
  const setActiveKb = useKnowledgeStore((s) => s.setActiveKb)
  const openCreateForm = useKnowledgeStore((s) => s.openCreateForm)
  const deleteKnowledgeBase = useKnowledgeStore((s) => s.deleteKnowledgeBase)
  const knowledgeError = useKnowledgeStore((s) => s.error)
  const openKnowledgeFileManager = useUIStateStore((s) => s.openKnowledgeFileManager)

  const [knowledgeSearchQuery, setKnowledgeSearchQuery] = useState('')
  const notify = useNotification()

  const filteredKnowledgeBases = useMemo(() => {
    if (!knowledgeSearchQuery.trim()) return knowledgeBases
    const query = knowledgeSearchQuery.toLowerCase()
    return knowledgeBases.filter(
      (kb) =>
        kb.name.toLowerCase().includes(query) ||
        (kb.description && kb.description.toLowerCase().includes(query))
    )
  }, [knowledgeBases, knowledgeSearchQuery])

  const getKnowledgeBaseKey = useCallback((kb: { id: string }): string => kb.id, [])

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
      const confirmed = await notify.confirm(t('notifications.knowledge.confirmIrreversible'), {
        title: t('notifications.knowledge.deleteKbTitle'),
        source: 'knowledge',
        danger: true
      })
      if (!confirmed) return

      const success = await deleteKnowledgeBase(kbId)
      if (!success) {
        notify.error(
          t('notifications.knowledge.deleteKbFailedTitle'),
          knowledgeError || t('notifications.knowledge.unknownError'),
          { source: 'knowledge' }
        )
      }
    },
    [deleteKnowledgeBase, knowledgeError, notify, t]
  )

  return (
    <>
      <div className={styles['sm-workspace-sidebar-host__search-group']}>
        <div className={styles['sm-workspace-sidebar-host__search']}>
          <input
            type="text"
            className="sm-input"
            placeholder={t('chrome.sidebar.searchKnowledge')}
            value={knowledgeSearchQuery}
            onChange={(e) => setKnowledgeSearchQuery(e.target.value)}
          />
        </div>
        <button
          className={[
            'sm-button',
            'sm-button--secondary',
            styles['sm-workspace-sidebar-host__action']
          ].join(' ')}
          onClick={handleManageKnowledgeFiles}
        >
          {t('chrome.sidebar.manageFiles')}
        </button>
      </div>

      <div
        className={[
          'sm-sidebar-shell__body',
          'sm-sidebar-shell__body--flush',
          styles['sm-workspace-sidebar-host__body']
        ]
          .filter(Boolean)
          .join(' ')}
      >
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
                    <div className={styles['sm-workspace-sidebar-host__kb-name']}>{kb.name}</div>
                    {needsReindex(kb) && (
                      <span className={styles['sm-workspace-sidebar-host__kb-stale']}>
                        {t('chrome.sidebar.needsReindex')}
                      </span>
                    )}
                  </div>
                  <div className={styles['sm-workspace-sidebar-host__kb-meta']}>
                    {t('chrome.sidebar.documentCount', { count: kb.linkedFileIds?.length ?? 0 })}
                  </div>
                </div>
                <button
                  className={styles['sm-workspace-sidebar-host__kb-delete']}
                  title={t('chrome.sidebar.deleteKnowledgeBase')}
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
                {knowledgeSearchQuery
                  ? t('chrome.sidebar.noMatchKnowledge')
                  : t('chrome.sidebar.emptyKnowledge')}
              </div>
              {!knowledgeSearchQuery && (
                <button
                  className="sm-button sm-button--secondary sm-button--small"
                  onClick={handleCreateKnowledgeBase}
                >
                  {t('chrome.sidebar.createFirstKnowledge')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
})

export default KnowledgeSidebarSection
