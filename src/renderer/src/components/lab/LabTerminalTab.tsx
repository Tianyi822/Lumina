import { useLayoutEffect, useMemo, useRef } from 'react'
import type { LabData } from '@renderer/types/lab'
import { useLabTerminalSessionStore } from '@renderer/stores/lab/labTerminalSessionStore'
import styles from './LabTerminalTab.module.css'

interface LabTerminalTabProps {
  isSshLab: boolean
  currentLab: LabData | null
  isSshConnected: boolean
  labDetailTab: string
}

export default function LabTerminalTab({
  currentLab,
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

  const terminalTargetKey = useMemo(() => {
    if (currentLab?.backendType === 'ssh') {
      return currentLab.status === 'running' ? `ssh:${currentLab.labId}` : null
    }
    return null
  }, [currentLab?.backendType, currentLab?.status, currentLab?.labId])

  const canHostTerminal = useMemo(() => {
    if (!terminalTargetKey || !currentLab) return false
    return isSshConnected
  }, [terminalTargetKey, currentLab, isSshConnected])

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
      backend: 'ssh',
      targetId: currentLabId,
      title: currentLab!.name,
      subtitle: sshTerminalSubtitle
    })

    if (labDetailTab !== 'terminal') {
      clearAnchor()
      return
    }

    const slot = slotRef.current
    if (!slot) return

    setVisibleSession(terminalTargetKey, slot)

    return () => {
      clearAnchor()
    }
  }, [
    canHostTerminal,
    terminalTargetKey,
    currentLabId,
    currentLab?.name,
    labDetailTab,
    targetSessionReady,
    ensureSession,
    setVisibleSession,
    clearAnchor,
    sshTerminalSubtitle
  ])

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
