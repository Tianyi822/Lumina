import { useState, useEffect, useMemo } from 'react'
import InteractiveTerminalPanel from './InteractiveTerminalPanel'
import LabDetailEmptyState from './LabDetailEmptyState'
import type { ContainerDetails, LabData } from '@renderer/types/lab'
import styles from './LabTerminalTab.module.css'

interface LabTerminalTabProps {
  isSshLab: boolean
  isDockerReady: boolean
  currentLab: LabData | null
  selectedContainer: ContainerDetails | null
  isSshConnected: boolean
  labDetailTab: string
}

export default function LabTerminalTab({
  isSshLab,
  isDockerReady,
  currentLab,
  selectedContainer,
  isSshConnected,
  labDetailTab
}: LabTerminalTabProps) {
  const sshTerminalSubtitle = useMemo(() => {
    const ssh = currentLab?.ssh
    if (!ssh) return ''
    return `${ssh.username}@${ssh.host}:${ssh.port}`
  }, [currentLab?.ssh])

  const dockerTerminalTitle = useMemo(() => {
    return selectedContainer?.names?.[0]?.replace(/^\//, '') || '未命名容器'
  }, [selectedContainer?.names])

  const dockerTerminalSubtitle = useMemo(() => {
    if (!selectedContainer) return ''
    return `${selectedContainer.shortId} · ${selectedContainer.image}`
  }, [selectedContainer])

  const terminalTargetKey = useMemo(() => {
    if (currentLab?.backendType === 'ssh') {
      return currentLab.status === 'running' ? `ssh:${currentLab.labId}` : null
    }
    return selectedContainer ? `docker:${selectedContainer.id}` : null
  }, [currentLab?.backendType, currentLab?.status, currentLab?.labId, selectedContainer])

  const [renderedTerminalKey, setRenderedTerminalKey] = useState<string | null>(null)

  useEffect(() => {
    setRenderedTerminalKey((prev) => {
      if (!terminalTargetKey) return null
      // 目标变了且正在渲染旧目标 → 先清空
      if (prev && terminalTargetKey !== prev) return null
      // 只在终端 tab 激活时渲染
      if (labDetailTab === 'terminal') return terminalTargetKey
      return prev
    })
  }, [labDetailTab, terminalTargetKey])

  if (isSshLab) {
    if (currentLab && isSshConnected && renderedTerminalKey === terminalTargetKey) {
      return (
        <InteractiveTerminalPanel
          key={terminalTargetKey || undefined}
          backend="ssh"
          targetId={currentLab.labId}
          title={currentLab.name}
          subtitle={sshTerminalSubtitle}
        />
      )
    }

    return (
      <section className={styles['ssh-terminal-connect-panel']}>
        <div className={styles['ssh-terminal-connect-panel__copy']}>
          <h2>SSH 未连接</h2>
          <p>
            请使用上方连接提示重新连接 {sshTerminalSubtitle || '远程服务器'}。
          </p>
        </div>
      </section>
    )
  }

  if (!isDockerReady) {
    return (
      <LabDetailEmptyState
        title="Docker 未就绪"
        message="本地 Docker 运行时不可用，容器终端功能暂时无法使用。"
      />
    )
  }

  if (!selectedContainer) {
    return (
      <LabDetailEmptyState
        title="终端尚未绑定容器"
        message="选中目标容器后，可在这里执行临时命令、定位问题并确认运行环境。"
      />
    )
  }

  if (renderedTerminalKey === terminalTargetKey) {
    return (
      <InteractiveTerminalPanel
        key={terminalTargetKey || undefined}
        backend="docker"
        targetId={selectedContainer.id}
        title={dockerTerminalTitle}
        subtitle={dockerTerminalSubtitle}
      />
    )
  }

  return null
}
