import { useState, useEffect, useCallback, useMemo } from 'react'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { useConfigStore } from '@renderer/stores/configStore'
import { usePaperViewStore } from '@renderer/stores/paper'
import { getRuntimePlatform } from '@renderer/composables/runtimePlatformCore'

import NotificationCenter from '@renderer/components/NotificationCenter'
import SettingsModal from '@renderer/components/SettingsModal'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import WindowControls from '@renderer/components/chrome/WindowControls'
import WorkspaceSidebarHost from '@renderer/components/chrome/WorkspaceSidebarHost'
import WorkspaceToolbar from '@renderer/components/chrome/WorkspaceToolbar'
import { CssSwitchTransition } from '@renderer/components/motion/CssTransition'

import KnowledgePage from '@renderer/pages/KnowledgePage'
import LabPage from '@renderer/pages/LabPage'
import PaperReaderPage from '@renderer/pages/PaperReaderPage'

import styles from './App.module.css'

export default function App() {
  const currentView = useUIStateStore((s) => s.currentView)
  const isCurrentSidebarCollapsed = useUIStateStore((s) => s.isCurrentSidebarCollapsed())
  const toggleCurrentSidebar = useUIStateStore((s) => s.toggleCurrentSidebar)
  const loadConfigStatus = useUIStateStore((s) => s.loadConfigStatus)

  const { isMac, isWindows, usesCustomWindowControls } = useMemo(() => getRuntimePlatform(), [])

  const [showSettings, setShowSettings] = useState(false)

  const isPaperView = currentView === 'paper'

  const workspacePageClasses = [
    styles.workspacePage,
    `sm-workspace-page--${currentView}`,
    isCurrentSidebarCollapsed && styles.sidebarCollapsed,
    isMac && 'sm-workspace-page--mac',
    isWindows && styles.windows
  ]
    .filter(Boolean)
    .join(' ')

  // 挂载时初始化
  useEffect(() => {
    const uiState = useUIStateStore.getState()
    const configStore = useConfigStore.getState()

    void uiState.initTheme()
    void loadConfigStatus()
    void configStore.loadConfig()
    usePaperViewStore.getState().loadPaperReaderPreferences()
  }, [loadConfigStatus])

  // 全局链接拦截
  useEffect(() => {
    function handleGlobalLinkClick(event: MouseEvent): void {
      const target = event.target as HTMLElement
      const anchor = target.closest('a') as HTMLAnchorElement | null
      if (!anchor?.href) return

      try {
        const url = new URL(anchor.href)
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          event.preventDefault()
          window.api.window.openExternal(anchor.href)
        }
      } catch {
        // 非法 URL，忽略
      }
    }

    document.addEventListener('click', handleGlobalLinkClick, true)
    return () => {
      document.removeEventListener('click', handleGlobalLinkClick, true)
    }
  }, [])

  const openSettings = useCallback(() => setShowSettings(true), [])
  const closeSettings = useCallback(() => setShowSettings(false), [])

  const handleMcpUpdated = useCallback(() => {
    useUIStateStore.getState().notifyMcpUpdate()
    useUIStateStore.getState().loadConfigStatus()
  }, [])

  const renderWorkspaceView = useCallback((view: string) => {
    if (view === 'paper') return <PaperReaderPage key="paper" />
    if (view === 'knowledge') return <KnowledgePage key="knowledge" />
    return <LabPage key="lab" />
  }, [])

  return (
    <div className="sm-app">
      <NotificationCenter />

      <div className={`sm-shell sm-workspace-page ${workspacePageClasses}`}>
        <div className={styles.dragRegion} aria-hidden="true" />

        <div className={styles.chromeActions} aria-label="窗口快捷操作">
          <button
            className={`sm-icon-button ${styles.chromeButton}`}
            title="设置"
            aria-label="打开设置"
            onClick={openSettings}
          >
            <SvgIcon name="settings" size={14} />
          </button>

          {isPaperView && (
            <button
              className={`sm-icon-button ${styles.chromeButton}`}
              title={isCurrentSidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
              aria-label={isCurrentSidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
              onClick={toggleCurrentSidebar}
            >
              <SvgIcon name="sidebar-toggle" size={14} />
            </button>
          )}
        </div>

        {usesCustomWindowControls && (
          <div className={styles.winControls}>
            <WindowControls />
          </div>
        )}

        <WorkspaceSidebarHost />

        <div className="sm-workspace-main">
          <WorkspaceToolbar />

          <div className="sm-workspace-main__body sm-workspace-main__body--fill">
            <CssSwitchTransition name="sm-workspace-switch" transitionKey={currentView} appear>
              {({ transitionKey, className, ref }) => (
                <div
                  ref={ref}
                  className={['sm-workspace-view', className].filter(Boolean).join(' ')}
                >
                  {renderWorkspaceView(transitionKey)}
                </div>
              )}
            </CssSwitchTransition>
          </div>
        </div>
      </div>

      {showSettings && <SettingsModal onClose={closeSettings} onMcpUpdated={handleMcpUpdated} />}
    </div>
  )
}
