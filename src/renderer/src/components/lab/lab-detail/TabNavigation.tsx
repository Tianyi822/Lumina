import { useUIStateStore } from '@renderer/stores'
import styles from './TabNavigation.module.css'

type TabType = 'stats' | 'terminal' | 'logs'

interface TabNavigationProps {
  visible: boolean
  showLogs?: boolean
}

export default function TabNavigation({ visible, showLogs = true }: TabNavigationProps) {
  const labDetailTab = useUIStateStore((s) => s.labDetailTab)
  const setLabDetailTab = useUIStateStore((s) => s.setLabDetailTab)

  if (!visible) return null

  return (
    <div className={styles['detail-tabs']} role="tablist" aria-label="实验室详情视图">
      <button
        className={`${styles['tab-btn']} ${labDetailTab === 'stats' ? styles['is-active'] : ''}`}
        onClick={() => setLabDetailTab('stats' as TabType)}
      >
        监控
      </button>
      <button
        className={`${styles['tab-btn']} ${labDetailTab === 'terminal' ? styles['is-active'] : ''}`}
        onClick={() => setLabDetailTab('terminal' as TabType)}
      >
        终端
      </button>
      {showLogs && (
        <button
          className={`${styles['tab-btn']} ${labDetailTab === 'logs' ? styles['is-active'] : ''}`}
          onClick={() => setLabDetailTab('logs' as TabType)}
        >
          日志
        </button>
      )}
    </div>
  )
}
