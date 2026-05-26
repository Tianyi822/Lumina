import { useState, useMemo, useCallback, useEffect, memo } from 'react'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import LabList from '@renderer/components/lab/LabList'
import {
  useUIStateStore,
  useLabStore,
  useLabListStore,
  useLabOperationStore
} from '@renderer/stores'
import styles from './WorkspaceSidebarHost.module.css'

const LabSidebarSection = memo(function LabSidebarSection() {
  const currentLab = useLabListStore((s) => s.currentLab)
  const labList = useLabListStore((s) => s.labList)
  const deleteConfirmState = useLabOperationStore((s) => s.deleteConfirmState)

  const handleSelectLab = useLabStore((s) => s.handleSelectLab)
  const handleDeleteLab = useLabStore((s) => s.handleDeleteLab)
  const refreshLabList = useLabStore((s) => s.refreshLabList)
  const loadLab = useLabStore((s) => s.loadLab)

  const openLabCreator = useUIStateStore((s) => s.openLabCreator)
  const openConfigManager = useUIStateStore((s) => s.openConfigManager)

  const [labSearchQuery, setLabSearchQuery] = useState('')
  const [isRefreshingLabList, setIsRefreshingLabList] = useState(false)

  const filteredLabs = useMemo(() => {
    if (!labSearchQuery.trim()) return labList
    const query = labSearchQuery.toLowerCase()
    return labList.filter((lab) => lab.name.toLowerCase().includes(query))
  }, [labSearchQuery, labList])

  const deletingLabId = deleteConfirmState.isDeleting ? deleteConfirmState.labId : null

  const handleRefreshLabList = useCallback(async (): Promise<void> => {
    if (isRefreshingLabList) return

    setIsRefreshingLabList(true)
    try {
      await refreshLabList()
      if (currentLab?.labId) {
        await loadLab(currentLab.labId, true)
      }
    } finally {
      setIsRefreshingLabList(false)
    }
  }, [currentLab?.labId, isRefreshingLabList, refreshLabList, loadLab])

  useEffect(() => {
    const unsubscribe = window.api.ssh?.onConnectionStatus(() => {
      void refreshLabList()
    })
    return () => {
      unsubscribe?.()
    }
  }, [refreshLabList])

  return (
    <>
      <div
        className={['sm-sidebar-shell__search', styles['sm-workspace-sidebar-host__search']]
          .filter(Boolean)
          .join(' ')}
      >
        <div className={styles['sm-workspace-sidebar-host__search--lab']}>
          <input
            type="text"
            className="sm-input"
            placeholder="搜索实验室"
            value={labSearchQuery}
            onChange={(e) => setLabSearchQuery(e.target.value)}
          />
          <button
            className={['sm-icon-button', styles['sm-workspace-sidebar-host__refresh-button']].join(
              ' '
            )}
            title="刷新列表"
            disabled={isRefreshingLabList}
            onClick={() => {
              void handleRefreshLabList()
            }}
          >
            <SvgIcon name="refresh" size={14} spin={isRefreshingLabList} />
          </button>
        </div>
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
        <LabList
          labs={filteredLabs}
          activeLabId={currentLab?.labId}
          deletingLabId={deletingLabId}
          onSelect={handleSelectLab}
          onDelete={handleDeleteLab}
        />
      </div>

      <div className={styles['sm-workspace-sidebar-host__section-actions']}>
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
      </div>
    </>
  )
})

export default LabSidebarSection
