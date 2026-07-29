import { useState, useRef, useEffect, useCallback } from 'react'
import { CssSwitchTransition } from '@renderer/components/motion/CssTransition'
import { useUIStateStore } from '@renderer/stores'
import PaperSidebarSection from '@renderer/components/chrome/PaperSidebarSection'
import KnowledgeSidebarSection from '@renderer/components/chrome/KnowledgeSidebarSection'
import PrimarySidebar from '@renderer/components/chrome/PrimarySidebar'
import WriterSidebarSection from '@renderer/components/chrome/WriterSidebarSection'
import styles from './WorkspaceSidebarHost.module.css'

const PAPER_SIDEBAR_MIN_WIDTH = 260
const PAPER_SIDEBAR_MAX_WIDTH = 480

interface WorkspaceSidebarHostProps {
  onOpenSettings?: () => void
}

/**
 * 工作区侧边栏容器组件
 * 管理一级侧边栏和二级侧边栏（根据视图切换内容面），支持论文侧边栏宽度拖拽调整
 */
export default function WorkspaceSidebarHost({ onOpenSettings }: WorkspaceSidebarHostProps) {
  const currentView = useUIStateStore((s) => s.currentView)
  const isCurrentSidebarCollapsed = useUIStateStore((s) => s.isCurrentSidebarCollapsed())
  const paperSidebarWidth = useUIStateStore((s) => s.paperSidebarWidth)
  const setPaperSidebarWidth = useUIStateStore((s) => s.setPaperSidebarWidth)
  const writerSidebarWidth = useUIStateStore((s) => s.writerSidebarWidth)
  const setWriterSidebarWidth = useUIStateStore((s) => s.setWriterSidebarWidth)
  const currentSidebarWidth = currentView === 'writer' ? writerSidebarWidth : paperSidebarWidth

  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const secondarySidebarRef = useRef<HTMLDivElement>(null)
  const isResizingSidebarRef = useRef(false)
  const sidebarWidthRef = useRef(currentSidebarWidth)
  const pendingSidebarWidthRef = useRef<number | null>(null)
  const sidebarResizeRafRef = useRef<number | null>(null)

  // 非拖拽时同步 ref 与 store 的实际宽度
  useEffect(() => {
    if (!isResizingSidebarRef.current) {
      sidebarWidthRef.current = currentSidebarWidth
    }
  }, [currentSidebarWidth])

  // 论文视图时设置侧边栏宽度 CSS 变量
  useEffect(() => {
    if (currentView === 'paper' || currentView === 'writer') {
      secondarySidebarRef.current?.style.setProperty(
        '--paper-sidebar-width',
        `${currentSidebarWidth}px`
      )
    } else {
      secondarySidebarRef.current?.style.removeProperty('--paper-sidebar-width')
    }
  }, [currentSidebarWidth, currentView])

  // 应用侧边栏宽度（带 RAF 防抖和范围钳制）
  const applySidebarWidth = useCallback((nextWidth: number) => {
    const width = Math.min(
      Math.max(Math.round(nextWidth), PAPER_SIDEBAR_MIN_WIDTH),
      PAPER_SIDEBAR_MAX_WIDTH
    )
    sidebarWidthRef.current = width
    pendingSidebarWidthRef.current = width

    // 使用 RAF 防抖避免频繁重排
    if (sidebarResizeRafRef.current !== null) return

    sidebarResizeRafRef.current = requestAnimationFrame(() => {
      sidebarResizeRafRef.current = null
      const pendingWidth = pendingSidebarWidthRef.current
      pendingSidebarWidthRef.current = null
      if (pendingWidth === null) return
      secondarySidebarRef.current?.style.setProperty('--paper-sidebar-width', `${pendingWidth}px`)
    })
  }, [])

  const handleSidebarResizeMove = useCallback(
    (event: PointerEvent) => {
      if (!isResizingSidebarRef.current) return
      const sidebarEl = secondarySidebarRef.current
      if (!sidebarEl) return
      const { left } = sidebarEl.getBoundingClientRect()
      applySidebarWidth(event.clientX - left)
    },
    [applySidebarWidth]
  )

  // 停止侧边栏拖拽，清理事件监听
  const stopSidebarResize = useCallback(() => {
    if (!isResizingSidebarRef.current) return

    isResizingSidebarRef.current = false
    setIsResizingSidebar(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('pointermove', handleSidebarResizeMove)
    window.removeEventListener('pointerup', stopSidebarResize)

    if (sidebarResizeRafRef.current !== null) {
      cancelAnimationFrame(sidebarResizeRafRef.current)
      sidebarResizeRafRef.current = null
    }
    pendingSidebarWidthRef.current = null
    if (currentView === 'writer') setWriterSidebarWidth(sidebarWidthRef.current)
    else setPaperSidebarWidth(sidebarWidthRef.current)
  }, [currentView, handleSidebarResizeMove, setPaperSidebarWidth, setWriterSidebarWidth])

  // 开始侧边栏宽度拖拽
  const startSidebarResize = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault()
      isResizingSidebarRef.current = true
      setIsResizingSidebar(true)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      window.addEventListener('pointermove', handleSidebarResizeMove)
      window.addEventListener('pointerup', stopSidebarResize)
      handleSidebarResizeMove(event.nativeEvent)
    },
    [handleSidebarResizeMove, stopSidebarResize]
  )

  return (
    <div className={styles['sm-sidebar-rail']}>
      <PrimarySidebar onOpenSettings={onOpenSettings} />

      <div
        ref={secondarySidebarRef}
        className={[
          'sm-secondary-sidebar',
          styles['sm-secondary-sidebar'],
          isCurrentSidebarCollapsed && 'is-collapsed',
          isResizingSidebar && styles['sm-secondary-sidebar--resizing']
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <aside className={['sm-sidebar-shell', styles['sm-workspace-sidebar-host']].join(' ')}>
          <div className={styles['sm-workspace-sidebar-host__viewport']}>
            <div className={styles['sm-workspace-sidebar-host__panel']}>
              <CssSwitchTransition
                name="sm-sidebar-section-switch"
                transitionKey={currentView}
                appear
              >
                {({ transitionKey, className, ref }) => (
                  <div
                    ref={ref}
                    className={[styles['sm-workspace-sidebar-host__section'], className]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {transitionKey === 'paper' && <PaperSidebarSection />}
                    {transitionKey === 'knowledge' && <KnowledgeSidebarSection />}
                    {transitionKey === 'writer' && <WriterSidebarSection />}
                  </div>
                )}
              </CssSwitchTransition>
            </div>
          </div>
        </aside>
        {(currentView === 'paper' || currentView === 'writer') && !isCurrentSidebarCollapsed && (
          <div
            className={styles.sidebarResizeHandle}
            role="separator"
            aria-orientation="vertical"
            onPointerDown={startSidebarResize}
          />
        )}
      </div>
    </div>
  )
}
