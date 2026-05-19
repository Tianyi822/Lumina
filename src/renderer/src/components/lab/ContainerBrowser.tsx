import { useState, useMemo } from 'react'
import type { ContainerInfo, ContainerState } from '@renderer/types/lab'
import styles from './ContainerBrowser.module.css'

interface ContainerBrowserProps {
  containers: ContainerInfo[]
  selectedContainerId?: string
  loading?: boolean
  onSelect: (containerId: string) => void
  onRefresh: () => void
  onStart: (containerId: string) => void
  onStop: (containerId: string) => void
  onRestart: (containerId: string) => void
  onRemove: (containerId: string) => void
  onSelectAsLab: (containerId: string) => void
  onOpenTerminal: (containerId: string) => void
  onViewLogs: (containerId: string) => void
  onFilterChange: (filter: 'all' | 'running' | 'stopped') => void
  onSearch: (query: string) => void
}

function getStateLabel(state: ContainerState): string {
  const labels: Record<ContainerState, string> = {
    created: '已创建',
    running: '运行中',
    paused: '已暂停',
    restarting: '重启中',
    removing: '删除中',
    exited: '已停止',
    dead: '已终止'
  }
  return labels[state] || state
}

function formatPorts(ports: ContainerInfo['ports']): string {
  if (!ports || ports.length === 0) return '-'
  return ports
    .filter((p) => p.hostPort)
    .map((p) => `${p.hostPort}:${p.containerPort}`)
    .join(', ')
}

function formatCreated(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 30) return `${days}天前`
  return date.toLocaleDateString('zh-CN')
}

export default function ContainerBrowser({
  containers,
  selectedContainerId,
  loading,
  onSelect,
  onRefresh,
  onStart,
  onStop,
  onRestart,
  onRemove,
  onSelectAsLab,
  onOpenTerminal,
  onViewLogs,
  onFilterChange,
  onSearch
}: ContainerBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'running' | 'stopped'>('all')

  const runningCount = useMemo(
    () => containers.filter((c) => c.state === 'running').length,
    [containers]
  )
  const stoppedCount = useMemo(
    () => containers.filter((c) => c.state === 'exited' || c.state === 'dead').length,
    [containers]
  )

  return (
    <div className={styles['container-browser']}>
      <div className={styles['browser-header']}>
        <div className={styles['search-section']}>
          <input
            value={searchQuery}
            type="text"
            className={`${styles.input} ${styles['search-input']}`}
            placeholder="搜索容器..."
            onChange={(e) => {
              setSearchQuery(e.target.value)
              onSearch(e.target.value)
            }}
          />
          <button
            className={`${styles.btn} ${styles['refresh-btn']}`}
            title="刷新"
            onClick={onRefresh}
          >
            刷新
          </button>
        </div>
        <div className={styles['filter-section']}>
          <button
            className={`${styles['filter-btn']} ${activeFilter === 'all' ? styles.active : ''}`}
            onClick={() => {
              setActiveFilter('all')
              onFilterChange('all')
            }}
          >
            全部 ({containers.length})
          </button>
          <button
            className={`${styles['filter-btn']} ${activeFilter === 'running' ? styles.active : ''}`}
            onClick={() => {
              setActiveFilter('running')
              onFilterChange('running')
            }}
          >
            运行中 ({runningCount})
          </button>
          <button
            className={`${styles['filter-btn']} ${activeFilter === 'stopped' ? styles.active : ''}`}
            onClick={() => {
              setActiveFilter('stopped')
              onFilterChange('stopped')
            }}
          >
            已停止 ({stoppedCount})
          </button>
        </div>
      </div>

      <div className={styles['container-list']}>
        {loading ? (
          <div className={styles['loading-state']}>
            <div className={styles['loading-spinner']}></div>
            <p>加载容器中...</p>
          </div>
        ) : containers.length === 0 ? (
          <div className={styles['empty-state']}>
            <p className={styles['empty-title']}>暂无容器</p>
            <p className={styles['empty-desc']}>Docker 中没有发现容器，请创建一个新容器</p>
          </div>
        ) : (
          containers.map((container) => (
            <div
              key={container.id}
              className={`${styles['container-card']} ${container.id === selectedContainerId ? styles.active : ''} ${container.state === 'running' ? styles.running : ''}`}
              onClick={() => onSelect(container.id)}
            >
              <div className={styles['container-header']}>
                <div className={styles['container-title']}>
                  <span
                    className={`${styles['state-indicator']} ${styles[`state-${container.state}`]}`}
                  ></span>
                  <span className={styles['container-name']}>
                    {container.names[0]?.replace(/^\//, '') || '未命名'}
                  </span>
                </div>
                <span
                  className={`${styles['container-state']} ${styles[`state-${container.state}`]}`}
                >
                  {getStateLabel(container.state)}
                </span>
              </div>
              <div className={styles['container-info']}>
                <div className={styles['info-row']}>
                  <span className={styles['info-label']}>镜像</span>
                  <span className={styles['info-value']} title={container.image}>
                    {container.image}
                  </span>
                </div>
                <div className={styles['info-row']}>
                  <span className={styles['info-label']}>端口</span>
                  <span className={styles['info-value']}>{formatPorts(container.ports)}</span>
                </div>
                <div className={styles['info-row']}>
                  <span className={styles['info-label']}>创建时间</span>
                  <span className={styles['info-value']}>{formatCreated(container.created)}</span>
                </div>
              </div>
              <div className={styles['container-actions']}>
                <button
                  className={`${styles['action-btn']} ${styles.primary}`}
                  disabled={container.state !== 'running'}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectAsLab(container.id)
                  }}
                >
                  选择作为实验室
                </button>
                <button
                  className={styles['action-btn']}
                  disabled={container.state !== 'running'}
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenTerminal(container.id)
                  }}
                >
                  终端
                </button>
                <button
                  className={styles['action-btn']}
                  onClick={(e) => {
                    e.stopPropagation()
                    onViewLogs(container.id)
                  }}
                >
                  日志
                </button>
                {container.state !== 'running' ? (
                  <button
                    className={`${styles['action-btn']} ${styles.success}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onStart(container.id)
                    }}
                  >
                    启动
                  </button>
                ) : (
                  <button
                    className={`${styles['action-btn']} ${styles.warning}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onStop(container.id)
                    }}
                  >
                    停止
                  </button>
                )}
                <button
                  className={styles['action-btn']}
                  onClick={(e) => {
                    e.stopPropagation()
                    onRestart(container.id)
                  }}
                >
                  重启
                </button>
                <button
                  className={`${styles['action-btn']} ${styles.danger}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove(container.id)
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
