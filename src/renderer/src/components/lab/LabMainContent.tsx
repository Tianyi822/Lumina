import { useState, useEffect, useMemo } from 'react'
import { useLabStore } from '@renderer/stores'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import SshReconnectPrompt from './SshReconnectPrompt'
import TabNavigation from './lab-detail/TabNavigation'
import SshServerMonitorPanel from './SshServerMonitorPanel'
import LabTerminalTab from './LabTerminalTab'
import type { LabData } from '@renderer/types/lab'
import styles from './LabMainContent.module.css'

interface LabMainContentProps {
  currentLab: LabData | null
}

export default function LabMainContent({ currentLab }: LabMainContentProps) {
  const labStore = useLabStore()

  const currentLabId = currentLab?.labId ?? null
  const labDetailTab = useUIStateStore((s) =>
    currentLabId ? (s.labDetailTabsByLabId[currentLabId] ?? 'stats') : 'stats'
  )

  const isSshConnected = currentLab?.status === 'running'
  const [isConnectingSsh, setIsConnectingSsh] = useState(false)
  const [sshReconnectPassword, setSshReconnectPassword] = useState('')

  useEffect(() => {
    setSshReconnectPassword('')
  }, [currentLab?.labId])

  // 监听 SSH 连接状态
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

  async function handleSshConnect(): Promise<void> {
    const labId = currentLab?.labId
    const ssh = currentLab?.ssh
    if (!labId || !ssh) return

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

  function formatDateTime(value?: string): string {
    if (!value) return '-'
    return new Date(value).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const hasLab = !!currentLab
  const showSshReconnectOnly = hasLab && !isSshConnected
  const isTabbedDetailVisible = hasLab && !showSshReconnectOnly
  const labCreationTypeLabel = useMemo(() => {
    if (!currentLab) return ''
    const labelMap: Record<string, string> = {
      ssh: 'SSH 远程服务器'
    }
    return labelMap[currentLab.creationType] || ''
  }, [currentLab])
  const contentBodyClassName = [
    styles['content-body'],
    isTabbedDetailVisible && styles['content-body--tabbed-detail']
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <main className={styles['lab-main-content']}>
      {!hasLab ? (
        <div className={styles['lab-empty-state']}>
          <div className={`sm-empty ${styles['lab-empty-card']}`}>
            <h2>通过 SSH 连接远程服务器</h2>
            <p>从左侧发起 SSH 连接，填写远程主机信息后进入终端和监控工作流。</p>
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
                    {currentLab.ssh?.authType && (
                      <span className="sm-badge">
                        {currentLab.ssh.authType === 'password' ? '密码认证' : '密钥认证'}
                      </span>
                    )}
                    <span className={`sm-badge ${styles[`status-${currentLab.status}`]}`}>
                      {
                        {
                          creating: '连接中',
                          running: '已连接',
                          stopped: '未连接',
                          error: '连接失败'
                        }[currentLab.status]
                      }
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
              {showSshReconnectOnly && currentLab ? (
                <SshReconnectPrompt
                  password={sshReconnectPassword}
                  lab={currentLab}
                  connecting={isConnectingSsh}
                  onUpdatePassword={setSshReconnectPassword}
                  onConnect={handleSshConnect}
                />
              ) : (
                <TabNavigation visible={hasLab} showLogs={false} labId={currentLabId} />
              )}
            </div>
          </header>

          <div className={contentBodyClassName}>
            {showSshReconnectOnly ? null : (
              <>
                <div
                  className={`${styles['tab-content']} ${labDetailTab === 'stats' ? styles['tab-content--active'] : ''}`}
                >
                  <SshServerMonitorPanel
                    labId={currentLabId!}
                    connected={isSshConnected}
                    active={labDetailTab === 'stats'}
                  />
                </div>

                <div
                  className={`${styles['tab-content']} ${labDetailTab === 'terminal' ? styles['tab-content--active'] : ''}`}
                >
                  <LabTerminalTab
                    isSshLab={true}
                    currentLab={currentLab}
                    isSshConnected={isSshConnected}
                    labDetailTab={labDetailTab as string}
                  />
                </div>
              </>
            )}
          </div>
        </>
      )}
    </main>
  )
}
