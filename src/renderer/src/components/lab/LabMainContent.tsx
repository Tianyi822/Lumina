import { useState, useEffect, useMemo } from 'react'
import { useContainerStore, useLabStore } from '@renderer/stores'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { useNotification } from '@renderer/composables/useNotification'
import { labApi } from '@renderer/services/labApi'
import OrphanLabAlert from './OrphanLabAlert'
import SshReconnectPrompt from './SshReconnectPrompt'
import TabNavigation from './lab-detail/TabNavigation'
import LabStatsTab from './LabStatsTab'
import LabTerminalTab from './LabTerminalTab'
import LabLogsTab from './LabLogsTab'
import type { LabData, DockerStatus } from '@renderer/types/lab'
import styles from './LabMainContent.module.css'

const DOCKER_WEBSITE = 'https://www.docker.com/products/docker-desktop/'

interface LabMainContentProps {
  currentLab: LabData | null
  dockerStatus?: DockerStatus | null
  recheckingDocker?: boolean
  onRecheckDocker: () => void
}

export default function LabMainContent({
  currentLab,
  dockerStatus,
  recheckingDocker,
  onRecheckDocker
}: LabMainContentProps) {
  const containerStore = useContainerStore()
  const labStore = useLabStore()
  const notify = useNotification()

  const selectedContainer = useContainerStore((s) => s.selectedContainer) || null
  const containerStats = useContainerStore((s) => s.containerStats) || null
  const storeLoading = useContainerStore((s) => s.isLoading) || false
  const labDetailTab = useUIStateStore((s) => s.labDetailTab)
  const setLabDetailTab = useUIStateStore((s) => s.setLabDetailTab)

  const isOrphan = currentLab?.isOrphan || false
  const isLabFrontend = !!currentLab?.frontend
  const isSshLab = currentLab?.backendType === 'ssh'
  const isDockerLab = !!currentLab && !isSshLab
  const isDockerReady = dockerStatus?.available ?? false
  const isSshConnected = currentLab?.status === 'running'

  const showFrontendRecoveryBanner = isLabFrontend && currentLab?.status === 'error' && !isOrphan

  const frontendRecoveryMessage = useMemo(() => {
    const frontend = currentLab?.frontend
    if (!frontend) return ''
    return (
      frontend.bootstrapError || '前端服务尚未恢复，请重试初始化；如果运行容器已损坏，可直接重建。'
    )
  }, [currentLab?.frontend])

  const [isStartingContainer, setIsStartingContainer] = useState(false)
  const [isStoppingContainer, setIsStoppingContainer] = useState(false)
  const [isRestartingContainer, setIsRestartingContainer] = useState(false)
  const [isRetryingFrontend, setIsRetryingFrontend] = useState(false)
  const [isRebuildingFrontend, setIsRebuildingFrontend] = useState(false)
  const [isConnectingSsh, setIsConnectingSsh] = useState(false)
  const [sshReconnectPassword, setSshReconnectPassword] = useState('')

  useEffect(() => {
    setSshReconnectPassword('')
  }, [currentLab?.labId])

  useEffect(() => {
    if (isSshLab && labDetailTab === 'logs') {
      setLabDetailTab('stats')
    }
  }, [isSshLab, labDetailTab, setLabDetailTab])

  // SSH connection listener
  useEffect(() => {
    const removeListener = window.api.ssh?.onConnectionStatus((event) => {
      if (event.labId === currentLab?.labId) {
        labStore.loadLab(event.labId, true, { silent: true })
      }
    })
    return () => {
      removeListener?.()
    }
  }, [currentLab?.labId, labStore])

  async function handleContainerStart(): Promise<void> {
    if (!isDockerReady) return
    setIsStartingContainer(true)
    try {
      if (selectedContainer?.id) await containerStore.startContainer(selectedContainer.id)
    } finally {
      setIsStartingContainer(false)
    }
  }

  async function handleContainerStop(): Promise<void> {
    if (!isDockerReady) return
    setIsStoppingContainer(true)
    try {
      if (selectedContainer?.id) await containerStore.stopContainer(selectedContainer.id)
    } finally {
      setIsStoppingContainer(false)
    }
  }

  async function handleContainerRestart(): Promise<void> {
    if (!isDockerReady) return
    setIsRestartingContainer(true)
    try {
      if (selectedContainer?.id) await containerStore.restartContainer(selectedContainer.id)
    } finally {
      setIsRestartingContainer(false)
    }
  }

  async function handleRetryFrontend(): Promise<void> {
    if (!currentLab?.labId || isRetryingFrontend) return
    setIsRetryingFrontend(true)
    try {
      await labStore.retryFrontendInitialization(currentLab.labId)
    } finally {
      setIsRetryingFrontend(false)
    }
  }

  async function handleRebuildFrontend(): Promise<void> {
    if (!currentLab?.labId || isRebuildingFrontend) return
    setIsRebuildingFrontend(true)
    try {
      await labStore.rebuildFrontendRuntime(currentLab.labId)
    } finally {
      setIsRebuildingFrontend(false)
    }
  }

  async function handleSshConnect(): Promise<void> {
    const labId = currentLab?.labId
    const ssh = currentLab?.ssh
    if (!labId || !ssh) return

    if (ssh.authType === 'password' && !sshReconnectPassword.trim()) {
      notify.warning('请输入 SSH 密码', '密码认证的连接需要重新输入密码后再连接', { source: 'lab' })
      return
    }

    setIsConnectingSsh(true)
    try {
      const connected = await labStore.connectSsh(labId, {
        host: ssh.host,
        port: ssh.port,
        username: ssh.username,
        authType: ssh.authType,
        password: ssh.authType === 'password' ? sshReconnectPassword : undefined,
        keyName: ssh.keyName
      })
      if (connected) {
        setSshReconnectPassword('')
        await labStore.loadLab(labId, true)
      }
    } finally {
      setIsConnectingSsh(false)
    }
  }

  async function handleCleanupOrphan(labId: string): Promise<void> {
    await labStore.handleDeleteLab(labId)
  }

  async function handleOpenDockerWebsite(): Promise<void> {
    const result = await labApi.openExternal(DOCKER_WEBSITE)
    if (!result.success)
      notify.warning('打开 Docker 官网失败', result.error || '未知错误', { source: 'lab' })
  }

  function handleDeleteLab(): void {
    if (currentLab) labStore.handleDeleteLab(currentLab.labId)
  }

  function formatDateTime(value?: string): string {
    if (!value) {
      return '-'
    }

    return new Date(value).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  async function handleRefreshStats(): Promise<void> {
    if (selectedContainer?.id) {
      await containerStore.loadContainerStats(selectedContainer.id)
    }
  }

  const hasLab = !!currentLab
  const labCreationTypeLabel = useMemo(() => {
    const labelMap: Record<string, string> = {
      existing: '已有容器',
      compose: 'Docker Compose',
      dockerfile: 'Dockerfile',
      ssh: 'SSH 远程服务器'
    }
    return currentLab ? labelMap[currentLab.creationType] || '' : ''
  }, [currentLab])

  return (
    <main className={styles['lab-main-content']}>
      {!hasLab ? (
        <div className={styles['lab-empty-state']}>
          <div className={`sm-empty ${styles['lab-empty-card']}`}>
            <h2>选择一个实验室开始</h2>
            <p>从左侧接管现有环境，或创建一个实验室以进入容器监控、终端和日志工作流。</p>
            {!isDockerReady && (
              <p className={styles['lab-empty-card__ssh-hint']}>
                本地 Docker 未就绪？您仍然可以<strong>创建 SSH 远程服务器</strong>
                类型的实验室来连接远程主机。
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
          <header className={styles['workspace-header']}>
            <div className={styles['workspace-header__copy']}>
              <div className={styles['workspace-header__headline']}>
                <div className={styles['workspace-header__titles']}>
                  <h1>{currentLab.name}</h1>
                  <div className={styles['workspace-header__badges']}>
                    <span className="sm-badge">{labCreationTypeLabel}</span>
                    {!isSshLab && (
                      <span className="sm-badge">
                        {currentLab.containerIds?.length || 0} 个容器
                      </span>
                    )}
                    {isSshLab && currentLab.ssh?.authType && (
                      <span className="sm-badge">
                        {currentLab.ssh.authType === 'password' ? '密码认证' : '密钥认证'}
                      </span>
                    )}
                    <span className={`sm-badge ${styles[`status-${currentLab.status}`]}`}>
                      {isSshLab
                        ? {
                            creating: '连接中',
                            running: '已连接',
                            stopped: '未连接',
                            error: '连接失败'
                          }[currentLab.status]
                        : {
                            creating: '创建中',
                            running: '运行中',
                            stopped: '已停止',
                            error: '异常'
                          }[currentLab.status]}
                    </span>
                  </div>
                </div>
              </div>
              <div className={styles['workspace-header__submeta']}>
                <span>
                  实验室 ID <code>{currentLab.labId}</code>
                </span>
                <span>最近更新 {formatDateTime(currentLab.updatedAt)}</span>
              </div>
            </div>
            <div className={styles['workspace-header__actions']}>
              {isSshLab && currentLab && !isSshConnected && (
                <SshReconnectPrompt
                  password={sshReconnectPassword}
                  lab={currentLab}
                  connecting={isConnectingSsh}
                  onUpdatePassword={setSshReconnectPassword}
                  onConnect={handleSshConnect}
                />
              )}
              {isDockerLab && !isDockerReady && (
                <button
                  className={styles['docker-recheck-btn']}
                  disabled={recheckingDocker}
                  onClick={onRecheckDocker}
                >
                  {recheckingDocker ? '检测中...' : '重新检测 Docker'}
                </button>
              )}
              <TabNavigation visible={hasLab} showLogs={!isSshLab} />
            </div>
          </header>

          <div className={styles['content-body']}>
            {isDockerLab && !isDockerReady && (
              <div className={styles['docker-unready-banner']}>
                <span className={styles['docker-unready-banner__icon']}>&#9888;</span>
                <div className={styles['docker-unready-banner__text']}>
                  <strong>本地 Docker 未就绪</strong>
                  <p>
                    {dockerStatus?.installed === false ? (
                      <span>
                        Docker 未安装。请先
                        <a
                          className={styles['docker-unready-banner__link']}
                          onClick={handleOpenDockerWebsite}
                        >
                          安装 Docker
                        </a>
                        ，然后点击上方"重新检测 Docker"按钮。
                      </span>
                    ) : (
                      '容器操作、终端和日志功能暂不可用。请启动 Docker 服务后点击上方"重新检测 Docker"按钮。'
                    )}
                  </p>
                </div>
              </div>
            )}

            <OrphanLabAlert
              visible={isOrphan}
              lab={currentLab}
              isReloading={isRebuildingFrontend}
              canRecover={isLabFrontend}
              recoverLabel={isLabFrontend ? '重建运行容器' : '重新关联容器'}
              onRecover={handleRebuildFrontend}
              onCleanup={handleCleanupOrphan}
            />

            {showFrontendRecoveryBanner && (
              <div className={styles['frontend-recovery-banner']}>
                <div className={styles['frontend-recovery-copy']}>
                  <span className={styles['frontend-recovery-copy__eyebrow']}>恢复提示</span>
                  <h3>前端服务未就绪</h3>
                  <p>{frontendRecoveryMessage}</p>
                </div>
                <div className={styles['frontend-recovery-actions']}>
                  <button
                    className="sm-button sm-button--secondary"
                    disabled={isRetryingFrontend || isRebuildingFrontend}
                    onClick={handleRetryFrontend}
                  >
                    {isRetryingFrontend ? '重试中...' : '重试初始化'}
                  </button>
                  <button
                    className="sm-button sm-button--primary"
                    disabled={isRetryingFrontend || isRebuildingFrontend}
                    onClick={handleRebuildFrontend}
                  >
                    {isRebuildingFrontend ? '重建中...' : '重建运行容器'}
                  </button>
                </div>
              </div>
            )}

            <div
              style={{ display: labDetailTab === 'stats' ? 'block' : 'none' }}
              className={styles['tab-content']}
            >
              <LabStatsTab
                isSshLab={isSshLab}
                isDockerReady={isDockerReady}
                isStatsTabActive={labDetailTab === 'stats'}
                currentLab={currentLab}
                selectedContainer={selectedContainer}
                containerStats={containerStats}
                storeLoading={storeLoading}
                isManualRefreshingStats={false}
                startingContainer={isStartingContainer}
                stoppingContainer={isStoppingContainer}
                restartingContainer={isRestartingContainer}
                creationType={currentLab.creationType}
                labName={currentLab.name}
                onStart={handleContainerStart}
                onStop={handleContainerStop}
                onRestart={handleContainerRestart}
                onRemove={handleDeleteLab}
                onOpenTerminal={() => setLabDetailTab('terminal')}
                onViewLogs={() => setLabDetailTab('logs')}
                onRefreshStats={() => {
                  void handleRefreshStats()
                }}
              />
            </div>

            <div
              style={{ display: labDetailTab === 'terminal' ? 'block' : 'none' }}
              className={styles['tab-content']}
            >
              <LabTerminalTab
                isSshLab={isSshLab}
                isDockerReady={isDockerReady}
                currentLab={currentLab}
                selectedContainer={selectedContainer}
                isSshConnected={isSshConnected}
                labDetailTab={labDetailTab as string}
              />
            </div>

            {!isSshLab && (
              <div
                style={{ display: labDetailTab === 'logs' ? 'block' : 'none' }}
                className={styles['tab-content']}
              >
                <LabLogsTab
                  isDockerReady={isDockerReady}
                  selectedContainerId={selectedContainer?.id}
                />
              </div>
            )}
          </div>
        </>
      )}
    </main>
  )
}
