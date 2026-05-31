import { useState, useMemo, memo } from 'react'
import { useContainerStore, useLabCreatorStore } from '@renderer/stores'
import type { ContainerInfo } from '@shared/types/lab/container'
import styles from './ContainerSelector.module.css'

function ContainerSelector() {
  // ─── 容器 store selectors ───
  const containers = useContainerStore((s) => s.containers)
  const isLoading = useContainerStore((s) => s.isLoading)
  const loadContainers = useContainerStore((s) => s.loadContainers)
  const getStateClass = useContainerStore((s) => s.getStateClass)
  const getStateLabel = useContainerStore((s) => s.getStateLabel)
  const formatCreated = useContainerStore((s) => s.formatCreated)

  // ─── 创建器 store selectors ───
  const containerFilter = useLabCreatorStore((s) => s.containerFilter)
  const containerSearchQuery = useLabCreatorStore((s) => s.containerSearchQuery)
  const selectedContainerId = useLabCreatorStore((s) => s.selectedContainerId)
  const setContainerFilter = useLabCreatorStore((s) => s.setContainerFilter)
  const setContainerSearchQuery = useLabCreatorStore((s) => s.setContainerSearchQuery)
  const selectContainer = useLabCreatorStore((s) => s.selectContainer)

  // ─── 本地状态 ───
  const [expandedContainerId, setExpandedContainerId] = useState<string | null>(null)

  // ─── 过滤逻辑（useMemo 重新实现，不用 store getter） ───
  const filteredContainers = useMemo(() => {
    let result = containers

    if (containerFilter === 'running') {
      result = result.filter((c) => c.state === 'running')
    } else if (containerFilter === 'stopped') {
      result = result.filter((c) => c.state === 'exited' || c.state === 'dead')
    }

    if (containerSearchQuery.trim()) {
      const query = containerSearchQuery.toLowerCase()
      result = result.filter(
        (c) =>
          c.names.some((n) => n.toLowerCase().includes(query)) ||
          c.image.toLowerCase().includes(query)
      )
    }

    return result
  }, [containers, containerFilter, containerSearchQuery])

  // ─── 计数（基于全量容器） ───
  const runningCount = useMemo(
    () => containers.filter((c) => c.state === 'running').length,
    [containers]
  )

  const stoppedCount = useMemo(
    () => containers.filter((c) => c.state === 'exited' || c.state === 'dead').length,
    [containers]
  )

  // ─── 事件处理 ───
  function handleClickContainer(containerId: string): void {
    selectContainer(containerId)
  }

  function handleViewDetails(container: ContainerInfo, event: React.MouseEvent): void {
    event.stopPropagation()
    setExpandedContainerId((prev) => (prev === container.id ? null : container.id))
  }

  return (
    <div className={styles['container-selector-section']}>
      <div className={styles['browser-header']}>
        <div className={styles['search-section']}>
          <input
            value={containerSearchQuery}
            type="text"
            className={styles['search-input']}
            placeholder="搜索容器..."
            onChange={(e) => setContainerSearchQuery(e.target.value)}
          />
          <button
            className={styles['refresh-btn']}
            disabled={isLoading}
            onClick={() => loadContainers()}
          >
            刷新
          </button>
        </div>

        <div className={styles['filter-section']}>
          <button
            className={`${styles['filter-btn']} ${containerFilter === 'all' ? styles.active : ''}`}
            onClick={() => setContainerFilter('all')}
          >
            全部 ({containers.length})
          </button>
          <button
            className={`${styles['filter-btn']} ${containerFilter === 'running' ? styles.active : ''}`}
            onClick={() => setContainerFilter('running')}
          >
            运行中 ({runningCount})
          </button>
          <button
            className={`${styles['filter-btn']} ${containerFilter === 'stopped' ? styles.active : ''}`}
            onClick={() => setContainerFilter('stopped')}
          >
            已停止 ({stoppedCount})
          </button>
        </div>
      </div>

      <div className={styles['container-list']}>
        {isLoading ? (
          <div className={styles['loading-state']}>
            <div className={styles['loading-spinner']}></div>
            <p>加载容器中...</p>
          </div>
        ) : filteredContainers.length === 0 ? (
          <div className={styles['empty-state']}>
            <p className={styles['empty-title']}>暂无容器</p>
            <p className={styles['empty-desc']}>Docker 中没有发现容器，请使用其他方式创建实验室</p>
          </div>
        ) : (
          filteredContainers.map((container) => (
            <div
              key={container.id}
              className={[
                styles['container-card'],
                container.id === selectedContainerId ? styles.active : '',
                container.state === 'running' ? styles.running : ''
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => handleClickContainer(container.id)}
            >
              <div className={styles['container-header']}>
                <div className={styles['container-title']}>
                  <span
                    className={`${styles['state-indicator']} ${styles[getStateClass(container.state)]}`}
                  ></span>
                  <span className={styles['container-name']}>
                    {container.names[0]?.replace(/^\//, '') || '未命名'}
                  </span>
                </div>
                <div className={styles['container-actions']}>
                  <button
                    className={[
                      styles['btn-detail'],
                      container.id === expandedContainerId ? styles.active : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    title="查看详情"
                    onClick={(e) => handleViewDetails(container, e)}
                  >
                    {container.id === expandedContainerId ? '收起' : '详情'}
                  </button>
                  <span
                    className={`${styles['container-state']} ${styles[getStateClass(container.state)]}`}
                  >
                    {getStateLabel(container.state)}
                  </span>
                </div>
              </div>

              <div className={styles['container-info']}>
                <div className={styles['info-row']}>
                  <span className={styles['info-label']}>镜像</span>
                  <span className={styles['info-value']} title={container.image}>
                    {container.image}
                  </span>
                </div>
                <div className={styles['info-row']}>
                  <span className={styles['info-label']}>创建时间</span>
                  <span className={styles['info-value']}>{formatCreated(container.created)}</span>
                </div>
              </div>

              {/* 展开的详情面板 */}
              {container.id === expandedContainerId && (
                <div className={styles['container-details']}>
                  <div className={styles['detail-row']}>
                    <span className={styles['detail-label']}>容器 ID</span>
                    <span className={styles['detail-value']}>{container.shortId}</span>
                  </div>
                  <div className={styles['detail-row']}>
                    <span className={styles['detail-label']}>完整 ID</span>
                    <span className={styles['detail-value']}>{container.id}</span>
                  </div>
                  {container.ports && container.ports.length > 0 && (
                    <div className={styles['detail-row']}>
                      <span className={styles['detail-label']}>端口映射</span>
                      <div className={styles['ports-list']}>
                        {container.ports.map((port, idx) => (
                          <span key={idx} className={styles['port-item']}>
                            {port.hostPort} {'->'} {port.containerPort}/{port.protocol}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {container.labels && Object.keys(container.labels).length > 0 && (
                    <div className={styles['detail-row']}>
                      <span className={styles['detail-label']}>标签</span>
                      <div className={styles['labels-list']}>
                        {Object.entries(container.labels).map(([key, value]) => (
                          <span key={key} className={styles['label-item']}>
                            {key}: {value}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default memo(ContainerSelector)
