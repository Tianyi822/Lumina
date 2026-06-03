import { useLayoutEffect, useMemo, useRef } from 'react'
import LabDetailEmptyState from './LabDetailEmptyState'
import type { ContainerDetails, LabData } from '@renderer/types/lab'
import { useLabTerminalSessionStore } from '@renderer/stores/lab/labTerminalSessionStore'
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
  const slotRef = useRef<HTMLDivElement>(null)
  const ensureSession = useLabTerminalSessionStore((s) => s.ensureSession)
  const setVisibleSession = useLabTerminalSessionStore((s) => s.setVisibleSession)
  const clearAnchor = useLabTerminalSessionStore((s) => s.clearAnchor)

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

  const canHostTerminal = useMemo(() => {
    if (!terminalTargetKey || !currentLab) return false
    if (isSshLab) {
      return isSshConnected
    }
    return isDockerReady && !!selectedContainer
  }, [terminalTargetKey, currentLab, isSshLab, isSshConnected, isDockerReady, selectedContainer])

  const currentLabId = currentLab?.labId ?? null
  const targetSessionReady = useLabTerminalSessionStore((s) =>
    terminalTargetKey ? Boolean(s.sessions[terminalTargetKey]) : false
  )

  useLayoutEffect(() => {
    if (!canHostTerminal || !terminalTargetKey || !currentLabId) {
      clearAnchor()
      return
    }

    const hasSession = !!useLabTerminalSessionStore.getState().sessions[terminalTargetKey]
    if (labDetailTab !== 'terminal' && !hasSession) {
      clearAnchor()
      return
    }

    ensureSession({
      key: terminalTargetKey,
      labId: currentLabId,
      backend: isSshLab ? 'ssh' : 'docker',
      targetId: isSshLab ? currentLabId : selectedContainer!.id,
      title: isSshLab ? currentLab!.name : dockerTerminalTitle,
      subtitle: isSshLab ? sshTerminalSubtitle : dockerTerminalSubtitle
    })

    if (labDetailTab !== 'terminal') {
      clearAnchor()
      return
    }

    const slot = slotRef.current
    if (!slot) {
      return
    }

    setVisibleSession(terminalTargetKey, slot)

    return () => {
      clearAnchor()
    }
  }, [
    canHostTerminal,
    terminalTargetKey,
    currentLabId,
    currentLab?.name,
    isSshLab,
    selectedContainer,
    labDetailTab,
    targetSessionReady,
    ensureSession,
    setVisibleSession,
    clearAnchor,
    dockerTerminalTitle,
    dockerTerminalSubtitle,
    sshTerminalSubtitle
  ])

  if (isSshLab) {
    if (!currentLab || !isSshConnected) {
      return (
        <section className={styles['ssh-terminal-connect-panel']}>
          <div className={styles['ssh-terminal-connect-panel__copy']}>
            <h2>SSH 未连接</h2>
            <p>请使用上方连接提示重新连接 {sshTerminalSubtitle || '远程服务器'}。</p>
          </div>
        </section>
      )
    }

    return <div ref={slotRef} className={styles['terminal-slot']} />
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

  return <div ref={slotRef} className={styles['terminal-slot']} />
}
