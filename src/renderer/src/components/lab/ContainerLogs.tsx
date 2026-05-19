import { useState } from 'react'
import styles from './ContainerLogs.module.css'

interface ContainerLogsProps {
  logs: string[]
  loading?: boolean
  containerName?: string
  onRefresh: () => void
  onClear: () => void
}

export default function ContainerLogs({
  logs,
  loading,
  containerName,
  onRefresh,
  onClear
}: ContainerLogsProps) {
  const [autoScroll, setAutoScroll] = useState(true)

  return (
    <div className={styles['container-logs']}>
      <div className={styles['logs-header']}>
        <h3>{containerName || '容器日志'}</h3>
        <div className={styles['logs-actions']}>
          <label className={styles['auto-scroll-toggle']}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            <span>自动滚动</span>
          </label>
          <button className="sm-button sm-button--secondary sm-button--small" onClick={onRefresh}>
            刷新
          </button>
          <button className="sm-button sm-button--secondary sm-button--small" onClick={onClear}>
            清空
          </button>
        </div>
      </div>

      <div className={styles['logs-output']}>
        {loading ? (
          <div className={styles['loading-state']}>
            <span className="sm-spinner sm-spinner--large"></span>
            <p>加载日志...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className={`sm-empty ${styles['empty-logs']}`}>
            <p>暂无日志</p>
          </div>
        ) : (
          <div className={styles['log-list']}>
            {logs.map((log, index) => (
              <pre key={index} className={styles['log-line']}>
                {log}
              </pre>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
