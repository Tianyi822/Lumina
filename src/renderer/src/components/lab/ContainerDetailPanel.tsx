import { useMemo } from 'react'
import type {
  ContainerDetails,
  ContainerStats,
  ContainerState,
  LabCreationType
} from '@renderer/types/lab'
import { computeLabPermissions } from '@renderer/composables/labPermissionsCore'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import styles from './ContainerDetailPanel.module.css'

interface ContainerDetailPanelProps {
  container: ContainerDetails
  stats?: ContainerStats | null
  loading?: boolean
  refreshingStats?: boolean
  creationType?: LabCreationType | null
  labName?: string
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

function getStateClass(state: ContainerState): string {
  return `state-${state}`
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatCreated(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString('zh-CN')
}

function formatEnv(env: string[]): string[] {
  if (!env || env.length === 0) return []
  return env
    .filter((e) => !e.includes('PASSWORD') && !e.includes('SECRET') && !e.includes('TOKEN'))
    .slice(0, 20)
}

export default function ContainerDetailPanel({
  container,
  stats,
  // loading intentionally unused — 预留给加载态 UI
  refreshingStats,
  creationType,
  labName,
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
  const permissions = useMemo(() => computeLabPermissions(creationType), [creationType])

  const isRunning = container.state === 'running'
  const isOperating = !!startingContainer || !!stoppingContainer || !!restartingContainer

  const headerTitle = useMemo(() => {
    if (creationType === 'compose' && labName) {
      const sanitizedName = labName.replace(/[<>"'&]/g, '')
      return `lab-docker-compose-${sanitizedName}`
    }
    return container.names?.[0]?.replace(/^\//, '') || '未命名'
  }, [creationType, labName, container.names])

  const creationTypeLabel = useMemo(() => {
    const labelMap: Record<LabCreationType, string> = {
      existing: '已有容器',
      compose: 'Docker Compose',
      dockerfile: 'Dockerfile',
      ssh: 'SSH 远程服务器'
    }
    return creationType ? labelMap[creationType] || '未指定' : '未指定'
  }, [creationType])

  const mappedPorts = useMemo(
    () => container.ports?.filter((p) => p.hostPort) || [],
    [container.ports]
  )
  const exposedPorts = useMemo(
    () => container.ports?.filter((p) => !p.hostPort) || [],
    [container.ports]
  )

  const formattedCpu = stats ? `${stats.cpu.toFixed(2)}%` : '-'
  const formattedMemory = stats
    ? `${formatBytes(stats.memory.usage)} / ${formatBytes(stats.memory.limit)} (${stats.memory.percent.toFixed(1)}%)`
    : '-'
  const formattedNetwork = stats
    ? { rx: formatBytes(stats.network.rxBytes), tx: formatBytes(stats.network.txBytes) }
    : { rx: '-', tx: '-' }
  const formattedBlockIO = stats
    ? {
        read: formatBytes(stats.blockIO.readBytes),
        write: formatBytes(stats.blockIO.writeBytes)
      }
    : { read: '-', write: '-' }

  return (
    <div className={styles['container-detail-panel']}>
      <div className={stats ? styles['container-detail-panel__summary'] : undefined}>
        {/* 概览面板 */}
        <section className={styles['overview-panel']}>
          <div className={styles['overview-panel__copy']}>
            <div className={styles['overview-panel__headline']}>
              <div className={styles['header-title']}>
                <span
                  className={`${styles['state-indicator']} ${styles[getStateClass(container.state)]}`}
                ></span>
                <h2>{headerTitle}</h2>
                <span
                  className={`${styles['state-badge']} ${styles[getStateClass(container.state)]}`}
                >
                  {getStateLabel(container.state)}
                </span>
              </div>
              <div className={styles['header-actions']}>
                <button className={styles['btn']} disabled={!isRunning} onClick={onOpenTerminal}>
                  终端
                </button>
                <button className={styles['btn']} onClick={onViewLogs}>
                  日志
                </button>

                {permissions.showLifecycleButtons ? (
                  <>
                    {!isRunning ? (
                      <button
                        className={`${styles['btn']} ${styles['success']}`}
                        disabled={isOperating}
                        onClick={onStart}
                      >
                        {startingContainer && <SvgIcon name="loading" size={14} spin />}
                        <span>{startingContainer ? '启动中...' : '启动'}</span>
                      </button>
                    ) : (
                      <button
                        className={`${styles['btn']} ${styles['warning']}`}
                        disabled={isOperating}
                        onClick={onStop}
                      >
                        {stoppingContainer && <SvgIcon name="loading" size={14} spin />}
                        <span>{stoppingContainer ? '停止中...' : '停止'}</span>
                      </button>
                    )}
                    <button className={styles['btn']} disabled={isOperating} onClick={onRestart}>
                      {restartingContainer && <SvgIcon name="loading" size={14} spin />}
                      <span>{restartingContainer ? '重启中...' : '重启'}</span>
                    </button>
                  </>
                ) : permissions.isReadOnly ? (
                  <span
                    className={styles['read-only-hint']}
                    title={permissions.typeMeta?.description}
                  >
                    <SvgIcon name="info" size={14} />
                    只读模式
                  </span>
                ) : null}

                <button className={`${styles['btn']} ${styles['danger']}`} onClick={onRemove}>
                  删除
                </button>
              </div>
            </div>

            <div className={styles['overview-meta']}>
              <span className="badge">{creationTypeLabel}</span>
              <span className={`badge ${styles['overview-meta__code']}`}>
                ID {container.shortId}
              </span>
              <span className="badge">创建于 {formatCreated(container.created)}</span>
            </div>
          </div>
        </section>

        {/* 资源监控 */}
        {stats && (
          <section className={`${styles['detail-section']} ${styles['resource-monitor-section']}`}>
            <div className={styles['section-title-row']}>
              <h3 className={styles['section-title']}>资源监控</h3>
              <button
                className={styles['btn-refresh']}
                type="button"
                title="刷新资源监控"
                aria-label="刷新资源监控"
                disabled={refreshingStats}
                onClick={onRefreshStats}
              >
                <SvgIcon name="refresh" size={14} spin={!!refreshingStats} />
              </button>
            </div>
            <div className={styles['stats-grid']}>
              <div className={styles['stat-card']}>
                <div className={styles['stat-label']}>CPU 使用率</div>
                <div className={styles['stat-value']}>{formattedCpu}</div>
                <div className={styles['stat-bar']}>
                  <div
                    className={`${styles['stat-bar-fill']} ${styles['cpu']}`}
                    style={{ width: Math.min(stats.cpu, 100) + '%' }}
                  ></div>
                </div>
              </div>
              <div className={styles['stat-card']}>
                <div className={styles['stat-label']}>内存使用</div>
                <div className={styles['stat-value']}>{formattedMemory}</div>
                <div className={styles['stat-bar']}>
                  <div
                    className={`${styles['stat-bar-fill']} ${styles['memory']}`}
                    style={{ width: Math.min(stats.memory.percent, 100) + '%' }}
                  ></div>
                </div>
              </div>
              <div className={styles['stat-card']}>
                <div className={styles['stat-label']}>网络接收</div>
                <div className={styles['stat-value']}>{formattedNetwork.rx}</div>
              </div>
              <div className={styles['stat-card']}>
                <div className={styles['stat-label']}>网络发送</div>
                <div className={styles['stat-value']}>{formattedNetwork.tx}</div>
              </div>
              <div className={styles['stat-card']}>
                <div className={styles['stat-label']}>块设备读取</div>
                <div className={styles['stat-value']}>{formattedBlockIO.read}</div>
              </div>
              <div className={styles['stat-card']}>
                <div className={styles['stat-label']}>块设备写入</div>
                <div className={styles['stat-value']}>{formattedBlockIO.write}</div>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* 基本信息 */}
      <section className={styles['detail-section']}>
        <h3 className={styles['section-title']}>基本信息</h3>
        <div className={styles['info-grid']}>
          <div className={styles['info-item']}>
            <span className={styles['info-label']}>容器 ID</span>
            <span className={`${styles['info-value']} ${styles['info-value--code']}`}>
              {container.id}
            </span>
          </div>
          <div className={styles['info-item']}>
            <span className={styles['info-label']}>短 ID</span>
            <span className={`${styles['info-value']} ${styles['info-value--code']}`}>
              {container.shortId}
            </span>
          </div>
          <div className={styles['info-item']}>
            <span className={styles['info-label']}>镜像</span>
            <span className={`${styles['info-value']} ${styles['info-value--code']}`}>
              {container.image}
            </span>
          </div>
          <div className={styles['info-item']}>
            <span className={styles['info-label']}>创建时间</span>
            <span className={styles['info-value']}>{formatCreated(container.created)}</span>
          </div>
          <div className={styles['info-item']}>
            <span className={styles['info-label']}>状态</span>
            <span className={styles['info-value']}>{container.status}</span>
          </div>
          <div className={styles['info-item']}>
            <span className={styles['info-label']}>工作目录</span>
            <span className={`${styles['info-value']} ${styles['info-value--code']}`}>
              {container.workingDir || '-'}
            </span>
          </div>
          <div className={styles['info-item']}>
            <span className={styles['info-label']}>命令</span>
            <span className={`${styles['info-value']} ${styles['info-value--code']}`}>
              {container.cmd?.join(' ') || '-'}
            </span>
          </div>
          <div className={styles['info-item']}>
            <span className={styles['info-label']}>入口点</span>
            <span className={`${styles['info-value']} ${styles['info-value--code']}`}>
              {container.entrypoint?.join(' ') || '-'}
            </span>
          </div>
        </div>
      </section>

      {/* 端口映射 */}
      <section className={styles['detail-section']}>
        <h3 className={styles['section-title']}>端口映射</h3>
        {mappedPorts.length > 0 ? (
          <div className={styles['ports-list']}>
            {mappedPorts.map((port, index) => (
              <div key={index} className={styles['port-item']}>
                <span className={styles['port-host']}>{port.hostPort}</span>
                <span className={styles['port-arrow']}>-&gt;</span>
                <span className={styles['port-container']}>
                  {port.containerPort}/{port.protocol}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles['empty-text']}>无端口映射（容器未暴露到主机）</p>
        )}
      </section>

      {/* 容器暴露端口 */}
      {exposedPorts.length > 0 && (
        <section className={styles['detail-section']}>
          <h3 className={styles['section-title']}>容器暴露端口</h3>
          <div className={`${styles['ports-list']} ${styles['exposed']}`}>
            {exposedPorts.map((port, index) => (
              <div key={index} className={styles['port-item']}>
                <span className={styles['port-container']}>
                  {port.containerPort}/{port.protocol}
                </span>
                <span className={styles['port-hint']}>(未映射)</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 挂载点 */}
      <section className={styles['detail-section']}>
        <h3 className={styles['section-title']}>挂载点</h3>
        {container.mounts && container.mounts.length > 0 ? (
          <div className={styles['mounts-list']}>
            {container.mounts.map((mount, index) => (
              <div key={index} className={styles['mount-item']}>
                <span className={styles['mount-type']}>[{mount.type}]</span>
                <span className={styles['mount-source']}>{mount.source}</span>
                <span className={styles['mount-arrow']}>-&gt;</span>
                <span className={styles['mount-destination']}>{mount.destination}</span>
                <span className={styles['mount-mode']}>({mount.mode})</span>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles['empty-text']}>无挂载点</p>
        )}
      </section>

      {/* 环境变量 */}
      <section className={styles['detail-section']}>
        <h3 className={styles['section-title']}>环境变量（前20个，已过滤敏感信息）</h3>
        {container.env && container.env.length > 0 ? (
          <div className={styles['env-list']}>
            {formatEnv(container.env).map((env, index) => (
              <code key={index} className={styles['env-item']}>
                {env}
              </code>
            ))}
          </div>
        ) : (
          <p className={styles['empty-text']}>无环境变量</p>
        )}
      </section>

      {/* 网络配置 */}
      <section className={styles['detail-section']}>
        <h3 className={styles['section-title']}>网络配置</h3>
        {container.networkSettings?.networks ? (
          <div className={styles['networks-list']}>
            {Object.entries(container.networkSettings.networks).map(([name, network]) => (
              <div key={name} className={styles['network-item']}>
                <div className={styles['network-name']}>{name}</div>
                <div className={styles['network-details']}>
                  <span>IP: {network.ipAddress || '-'}</span>
                  <span>网关: {network.gateway || '-'}</span>
                  <span>MAC: {network.macAddress || '-'}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles['empty-text']}>无网络配置</p>
        )}
      </section>
    </div>
  )
}
