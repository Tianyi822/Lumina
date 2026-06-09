import { useLayoutEffect, useMemo, type ReactElement } from 'react'
import InteractiveTerminalPanel from './InteractiveTerminalPanel'
import { useAnchoredTerminalOverlay } from './hooks/useAnchoredTerminalOverlay'
import { useLabTerminalSessionStore } from '@renderer/stores/lab/labTerminalSessionStore'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import styles from './LabTerminalSessionHost.module.css'

/** 单个终端会话实例：将 InteractiveTerminalPanel 渲染到浮动叠层并锚定到 DOM 目标 */
function TerminalSessionInstance({ sessionKey }: { sessionKey: string }): ReactElement | null {
  const isLabView = useUIStateStore((s) => s.currentView === 'lab')
  const session = useLabTerminalSessionStore((s) => s.sessions[sessionKey])
  const visibleSessionKey = useLabTerminalSessionStore((s) => s.visibleSessionKey)
  const anchorElement = useLabTerminalSessionStore((s) => s.anchorElement)

  // 仅在实验室视图、且为当前可见会话、锚点 DOM 有效时才激活叠层
  const isActive =
    isLabView && visibleSessionKey === sessionKey && anchorElement !== null && anchorElement.isConnected
  const wrapperRef = useAnchoredTerminalOverlay({
    active: isActive,
    anchorElement: isActive ? anchorElement : null
  })

  if (!session) {
    return null
  }

  return (
    <div ref={wrapperRef} className={styles['terminal-session-shell']}>
      <InteractiveTerminalPanel
        targetId={session.targetId}
        title={session.title}
        subtitle={session.subtitle}
      />
    </div>
  )
}

/** 全局终端会话池：切换 Tab / 视图 / 实验室时保持 xterm 与远程连接 */
export default function LabTerminalSessionHost(): ReactElement {
  const currentView = useUIStateStore((s) => s.currentView)
  const clearAnchor = useLabTerminalSessionStore((s) => s.clearAnchor)
  const sessions = useLabTerminalSessionStore((s) => s.sessions)
  const sessionKeys = useMemo(() => Object.keys(sessions), [sessions])

  // 离开实验室视图时立刻收起叠层（不等离场动画延迟卸载）
  useLayoutEffect(() => {
    if (currentView !== 'lab') {
      clearAnchor()
    }
  }, [currentView, clearAnchor])

  if (sessionKeys.length === 0) {
    return <></>
  }

  return (
    <div className={styles['terminal-session-host']}>
      {sessionKeys.map((sessionKey) => (
        <TerminalSessionInstance key={sessionKey} sessionKey={sessionKey} />
      ))}
    </div>
  )
}
