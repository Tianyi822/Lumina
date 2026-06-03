import { useUIStateStore, type LabDetailTab } from '@renderer/stores/uiStateStore'
import styles from './TabNavigation.module.css'

interface TabNavigationProps {
  visible: boolean
  showLogs?: boolean
  labId?: string | null
}

export default function TabNavigation({ visible, showLogs = true, labId }: TabNavigationProps) {
  const labDetailTab = useUIStateStore((s) =>
    labId ? (s.labDetailTabsByLabId[labId] ?? 'stats') : 'stats'
  )
  const setLabDetailTab = useUIStateStore((s) => s.setLabDetailTab)

  if (!visible || !labId) return null

  const selectTab = (tab: LabDetailTab): void => {
    setLabDetailTab(tab, labId)
  }

  return (
    <div className={styles['detail-tabs']} role="tablist" aria-label="实验室详情视图">
      <button
        className={`${styles['tab-btn']} ${labDetailTab === 'stats' ? styles['is-active'] : ''}`}
        onClick={() => selectTab('stats')}
      >
        监控
      </button>
      <button
        className={`${styles['tab-btn']} ${labDetailTab === 'terminal' ? styles['is-active'] : ''}`}
        onClick={() => selectTab('terminal')}
      >
        终端
      </button>
      {showLogs && (
        <button
          className={`${styles['tab-btn']} ${labDetailTab === 'logs' ? styles['is-active'] : ''}`}
          onClick={() => selectTab('logs')}
        >
          日志
        </button>
      )}
    </div>
  )
}
