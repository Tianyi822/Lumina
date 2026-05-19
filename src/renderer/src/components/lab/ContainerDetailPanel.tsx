import type { ContainerDetails, ContainerStats } from '@renderer/types/lab'
import styles from './ContainerDetailPanel.module.css'

interface ContainerDetailPanelProps {
  container: ContainerDetails
  stats?: ContainerStats | null
  loading?: boolean
  refreshingStats?: boolean
  creationType?: string
  startingContainer?: boolean
  stoppingContainer?: boolean
  restartingContainer?: boolean
  onStart: () => void
  onStop: () => void
  onRestart: () => void
  onRemove: () => void
  onOpenTerminal: () => void
  onViewLogs: () => void
  onRefreshStats: () => void
}

export default function ContainerDetailPanel({
  container,
  loading,
  refreshingStats,
  startingContainer,
  stoppingContainer,
  restartingContainer,
  onStart,
  onStop,
  onRestart,
  onRemove,
  onOpenTerminal,
  onViewLogs,
  onRefreshStats
}: ContainerDetailPanelProps) {
  const displayName = container.names?.[0] || container.id.substring(0, 12)

  return (
    <div className={styles['container-detail']}>
      <div className={styles['detail-header']}>
        <h3>{displayName}</h3>
        <span className="sm-badge">{container.status}</span>
      </div>

      {loading && (
        <div className={styles['loading-state']}>
          <span className="sm-spinner sm-spinner--large"></span>
          <p>加载容器详情...</p>
        </div>
      )}

      <div className={styles['detail-body']}>
        <div className={styles['detail-section']}>
          <h4>基本信息</h4>
          <dl>
            <dt>容器 ID</dt>
            <dd>
              <code>{container.id}</code>
            </dd>
            <dt>镜像</dt>
            <dd>{container.image || '-'}</dd>
            <dt>状态</dt>
            <dd>{container.status}</dd>
          </dl>
        </div>

        {container.ports && container.ports.length > 0 && (
          <div className={styles['detail-section']}>
            <h4>端口映射</h4>
            <dl>
              {container.ports.map((port, i) => (
                <div key={i}>
                  <dt>{port.containerPort}</dt>
                  <dd>
                    {port.hostPort || '-'} ({port.protocol})
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      <div className={styles['detail-actions']}>
        <button
          className="sm-button sm-button--primary sm-button--small"
          disabled={startingContainer}
          onClick={onStart}
        >
          {startingContainer ? '启动中...' : '启动'}
        </button>
        <button
          className="sm-button sm-button--secondary sm-button--small"
          disabled={stoppingContainer}
          onClick={onStop}
        >
          {stoppingContainer ? '停止中...' : '停止'}
        </button>
        <button
          className="sm-button sm-button--secondary sm-button--small"
          disabled={restartingContainer}
          onClick={onRestart}
        >
          {restartingContainer ? '重启中...' : '重启'}
        </button>
        <button
          className="sm-button sm-button--secondary sm-button--small"
          onClick={onOpenTerminal}
        >
          终端
        </button>
        <button className="sm-button sm-button--secondary sm-button--small" onClick={onViewLogs}>
          日志
        </button>
        <button
          className="sm-button sm-button--secondary sm-button--small"
          onClick={onRefreshStats}
        >
          {refreshingStats ? '刷新中...' : '刷新'}
        </button>
        <button className="sm-button sm-button--danger sm-button--small" onClick={onRemove}>
          删除
        </button>
      </div>
    </div>
  )
}
