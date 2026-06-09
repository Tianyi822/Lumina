import { useLayoutEffect, useMemo, useRef } from 'react'
import type { LabData } from '@renderer/types/lab'
import { useLabTerminalSessionStore } from '@renderer/stores/lab/labTerminalSessionStore'
import styles from './LabTerminalTab.module.css'

/** 终端 Tab：管理 SSH 终端会话的生命周期，将终端渲染到锚点 DOM 节点 */
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

  // 拼接终端副标题：user@host:port
  const sshTerminalSubtitle = useMemo(() => {
    const ssh = currentLab?.ssh
    if (!ssh) return ''
    return `${ssh.username}@${ssh.host}:${ssh.port}`
  }, [currentLab?.ssh])

  // 构造终端会话唯一键，只有 running 状态才生成有效键
  const terminalTargetKey = useMemo(() => {
    if (currentLab?.backendType === 'ssh') {
      return currentLab.status === 'running' ? `ssh:${currentLab.labId}` : null
    }
    return null
  }, [currentLab?.backendType, currentLab?.status, currentLab?.labId])

  // 判断是否可以承载终端（需要有效键 + SSH 已连接）
  const canHostTerminal = useMemo(() => {
    if (!terminalTargetKey || !currentLab) return false
    return isSshConnected
  }, [terminalTargetKey, currentLab, isSshConnected])

  const currentLabId = currentLab?.labId ?? null
  const targetSessionReady = useLabTerminalSessionStore((s) =>
    terminalTargetKey ? Boolean(s.sessions[terminalTargetKey]) : false
  )

  // 当终端条件满足时创建会话并绑定到 DOM 锚点；条件不满足时清理锚点
  useLayoutEffect(() => {
    if (!canHostTerminal || !terminalTargetKey || !currentLabId) {
      clearAnchor()
      return
    }

    const hasSession = !!useLabTerminalSessionStore.getState().sessions[terminalTargetKey]
    // 用户不在 terminal Tab 且会话尚未创建时，不提前预建
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

    // 不在 terminal Tab 时无需绑定渲染锚点
    if (labDetailTab !== 'terminal') {
      clearAnchor()
      return
    }

    const slot = slotRef.current
    if (!slot) return

    // 将会话渲染到指定 DOM 容器
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
