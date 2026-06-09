import { useState, useEffect, useMemo } from 'react'
import { useLabStore } from '@renderer/stores'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import SshReconnectPrompt from './SshReconnectPrompt'
import TabNavigation from './lab-detail/TabNavigation'
import SshServerMonitorPanel from './SshServerMonitorPanel'
import LabTerminalTab from './LabTerminalTab'
import type { LabData } from '@renderer/types/lab'
import styles from './LabMainContent.module.css'

/** 实验室主内容区：展示详情/空状态，管理 SSH 连接和标签页切换 */
interface LabMainContentProps {
  currentLab: LabData | null
}

export default function LabMainContent({ currentLab }: LabMainContentProps) {
  const labStore = useLabStore()

  // 读取当前实验室 ID 及其激活的详情 Tab，默认为 stats（监控面板）
  const currentLabId = currentLab?.labId ?? null
  const labDetailTab = useUIStateStore((s) =>
    currentLabId ? (s.labDetailTabsByLabId[currentLabId] ?? 'stats') : 'stats'
  )

  const isSshConnected = currentLab?.status === 'running'
  // 正在重新连接 SSH 的状态
  const [isConnectingSsh, setIsConnectingSsh] = useState(false)
  const [sshReconnectPassword, setSshReconnectPassword] = useState('')

  // 切换实验室时清空密码缓存
  useEffect(() => {
    setSshReconnectPassword('')
  }, [currentLab?.labId])

  // 监听 SSH 连接状态变化，自动刷新实验室详情
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

  /** 发起 SSH 重新连接，连接成功后刷新实验室数据和清空密码 */
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

  /** 格式化时间戳为中文字符串，用于头部最近更新时间显示 */
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
