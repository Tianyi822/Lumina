import { useState, useEffect, useCallback, useMemo } from 'react'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { useConfigStore } from '@renderer/stores/configStore'
import { getRuntimePlatform } from '@renderer/composables/runtimePlatformCore'

import NotificationCenter from '@renderer/components/NotificationCenter'
import SettingsModal from '@renderer/components/SettingsModal'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import WindowControls from '@renderer/components/chrome/WindowControls'
import WorkspaceSidebarHost from '@renderer/components/chrome/WorkspaceSidebarHost'
import WorkspaceToolbar from '@renderer/components/chrome/WorkspaceToolbar'

import KnowledgePage from '@renderer/pages/KnowledgePage'
import LabPage from '@renderer/pages/LabPage'
import PaperReaderPage from '@renderer/pages/PaperReaderPage'

import styles from './App.module.css'

export default function App() {
  const currentView = useUIStateStore((s) => s.currentView)
  const isCurrentSidebarCollapsed = useUIStateStore((s) => s.isCurrentSidebarCollapsed())
  const toggleCurrentSidebar = useUIStateStore((s) => s.toggleCurrentSidebar)

  const { isMac, isWindows, usesCustomWindowControls } = useMemo(() => getRuntimePlatform(), [])

  const [showSettings, setShowSettings] = useState(false)

  const isPaperView = currentView === 'paper'
  const isKnowledgeView = currentView === 'knowledge'

  const workspacePageClasses = [
    styles.workspacePage,
    styles[`view--${currentView}`],
    isCurrentSidebarCollapsed && styles.sidebarCollapsed,
    isMac && styles.mac,
    isWindows && styles.windows
  ]
    .filter(Boolean)
    .join(' ')

  // Initialize on mount
  useEffect(() => {
    const uiState = useUIStateStore.getState()
    const configStore = useConfigStore.getState()

    uiState.initTheme()
    configStore.loadConfig()
  }, [])

  // Global link interceptor
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
        // Not a valid URL, ignore
      }
    }

    document.addEventListener('click', handleGlobalLinkClick, true)
    return () => {
      document.removeEventListener('click', handleGlobalLinkClick, true)
    }
  }, [])

  const openSettings = useCallback(() => setShowSettings(true), [])
  const closeSettings = useCallback(() => setShowSettings(false), [])

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
              {isPaperView && <PaperReaderPage key="paper" />}
              {isKnowledgeView && <KnowledgePage key="knowledge" />}
              {!isPaperView && !isKnowledgeView && <LabPage key="lab" />}
            </div>
          </div>
        </div>

        {showSettings && <SettingsModal onClose={closeSettings} />}
    </div>
  )
}
