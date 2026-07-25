import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { useConfigStore } from '@renderer/stores/configStore'
import { usePaperViewStore } from '@renderer/stores/paper'
import { getRuntimePlatform } from '@renderer/composables/runtimePlatformCore'

import { useForegroundUpdateCheck } from '@renderer/composables/useForegroundUpdateCheck'
import NotificationCenter from '@renderer/components/NotificationCenter'
import SettingsModal from '@renderer/components/SettingsModal'
import WindowControls from '@renderer/components/chrome/WindowControls'
import WorkspaceSidebarHost from '@renderer/components/chrome/WorkspaceSidebarHost'
import { CssSwitchTransition } from '@renderer/components/motion/CssTransition'

const PaperReaderPage = lazy(() => import('@renderer/pages/PaperReaderPage'))
const KnowledgePage = lazy(() => import('@renderer/pages/KnowledgePage'))

import styles from './App.module.css'

/**
 * 应用根组件
 * 管理视图路由（论文/知识库）、主题初始化、全局链接拦截、设置弹窗
 */
export default function App() {
  const currentView = useUIStateStore((s) => s.currentView)
  const isCurrentSidebarCollapsed = useUIStateStore((s) => s.isCurrentSidebarCollapsed())
  const paperChatPanelOpen = useUIStateStore((s) => s.paperChatPanelOpen)
  const loadConfigStatus = useUIStateStore((s) => s.loadConfigStatus)

  const { isMac, isWindows, usesCustomWindowControls } = useMemo(() => getRuntimePlatform(), [])

  const [showSettings, setShowSettings] = useState(false)
  useForegroundUpdateCheck()
  const shouldFlushPaperReaderRight = currentView === 'paper' && !paperChatPanelOpen

  // 根据当前视图、侧边栏状态、平台组合工作区样式
  const workspacePageClasses = [
    styles.workspacePage,
    `sm-workspace-page--${currentView}`,
    isCurrentSidebarCollapsed && styles.sidebarCollapsed,
    shouldFlushPaperReaderRight && styles.paperReaderFlushRight,
    isMac && 'sm-workspace-page--mac',
    isWindows && 'sm-workspace-page--windows',
    isWindows && styles.windows
  ]
    .filter(Boolean)
    .join(' ')

  // 挂载时初始化：主题、配置、论文阅读器偏好
  useEffect(() => {
    const uiState = useUIStateStore.getState()
    const configStore = useConfigStore.getState()

    void uiState.initTheme()
    void loadConfigStatus()
    void configStore.loadConfig()
    usePaperViewStore.getState().loadPaperReaderPreferences()
  }, [loadConfigStatus])

  // 全局链接拦截：防止默认导航，通过主进程打开外部链接
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
    const fallback = <div className={styles.viewLoading} />
    if (view === 'paper')
      return (
        <Suspense fallback={fallback}>
          <PaperReaderPage key="paper" />
        </Suspense>
      )
    if (view === 'knowledge')
      return (
        <Suspense fallback={fallback}>
          <KnowledgePage key="knowledge" />
        </Suspense>
      )
    return null
  }, [])

  return (
    <div className="sm-app">
      <NotificationCenter />

      <div className={`sm-shell sm-workspace-page ${workspacePageClasses}`}>
        <div className={styles.dragRegion} aria-hidden="true" />

        {usesCustomWindowControls && (
          <div className={styles.winControls}>
            <WindowControls />
          </div>
        )}

        <WorkspaceSidebarHost onOpenSettings={openSettings} />

        <div className="sm-workspace-main">
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
