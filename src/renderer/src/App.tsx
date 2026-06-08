import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { useConfigStore } from '@renderer/stores/configStore'
import { isAnyLabDisciplineEnabled } from '@shared/utils/labFeatures'
import { usePaperViewStore } from '@renderer/stores/paper'
import { getRuntimePlatform } from '@renderer/composables/runtimePlatformCore'

import { useForegroundUpdateCheck } from '@renderer/composables/useForegroundUpdateCheck'
import NotificationCenter from '@renderer/components/NotificationCenter'
import SettingsModal from '@renderer/components/SettingsModal'
import WindowControls from '@renderer/components/chrome/WindowControls'
import WorkspaceSidebarHost from '@renderer/components/chrome/WorkspaceSidebarHost'
import { CssSwitchTransition } from '@renderer/components/motion/CssTransition'
import LabTerminalSessionHost from '@renderer/components/lab/LabTerminalSessionHost'

const PaperReaderPage = lazy(() => import('@renderer/pages/PaperReaderPage'))
const KnowledgePage = lazy(() => import('@renderer/pages/KnowledgePage'))
const LabPage = lazy(() => import('@renderer/pages/LabPage'))

import styles from './App.module.css'

export default function App() {
  const currentView = useUIStateStore((s) => s.currentView)
  const isCurrentSidebarCollapsed = useUIStateStore((s) => s.isCurrentSidebarCollapsed())
  const paperChatPanelOpen = useUIStateStore((s) => s.paperChatPanelOpen)
  const loadConfigStatus = useUIStateStore((s) => s.loadConfigStatus)

  const labFeaturesLabEnabled = useConfigStore((s) => isAnyLabDisciplineEnabled(s.labFeatures))

  const { isMac, isWindows, usesCustomWindowControls } = useMemo(() => getRuntimePlatform(), [])

  const [showSettings, setShowSettings] = useState(false)
  useForegroundUpdateCheck()
  const shouldFlushPaperReaderRight = currentView === 'paper' && !paperChatPanelOpen

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

  // lab 禁用时同步视图状态
  useEffect(() => {
    if (!labFeaturesLabEnabled) {
      const currentViewState = useUIStateStore.getState().currentView
      if (currentViewState === 'lab') {
        useUIStateStore.getState().setCurrentView('paper')
      }
    }
  }, [labFeaturesLabEnabled])

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
    // lab 禁用时 fallback 渲染 PaperReaderPage
    const labEnabled = isAnyLabDisciplineEnabled(useConfigStore.getState().labFeatures)
    if (!labEnabled) {
      return (
        <Suspense fallback={fallback}>
          <PaperReaderPage key="paper" />
        </Suspense>
      )
    }
    return (
      <Suspense fallback={fallback}>
        <LabPage key="lab" />
      </Suspense>
    )
  }, [])

  return (
    <div className="sm-app">
      <LabTerminalSessionHost />
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
