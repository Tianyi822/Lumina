import { useState, useRef, useEffect, useCallback } from 'react'
import { CssSwitchTransition } from '@renderer/components/motion/CssTransition'
import { useUIStateStore } from '@renderer/stores'
import PaperSidebarSection from '@renderer/components/chrome/PaperSidebarSection'
import KnowledgeSidebarSection from '@renderer/components/chrome/KnowledgeSidebarSection'
import LabSidebarSection from '@renderer/components/chrome/LabSidebarSection'
import PrimarySidebar from '@renderer/components/chrome/PrimarySidebar'
import styles from './WorkspaceSidebarHost.module.css'

const PAPER_SIDEBAR_MIN_WIDTH = 260
const PAPER_SIDEBAR_MAX_WIDTH = 480

interface WorkspaceSidebarHostProps {
  onOpenSettings?: () => void
}

export default function WorkspaceSidebarHost({ onOpenSettings }: WorkspaceSidebarHostProps) {
  const currentView = useUIStateStore((s) => s.currentView)
  const isCurrentSidebarCollapsed = useUIStateStore((s) => s.isCurrentSidebarCollapsed())
  const paperSidebarWidth = useUIStateStore((s) => s.paperSidebarWidth)
  const setPaperSidebarWidth = useUIStateStore((s) => s.setPaperSidebarWidth)

  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const secondarySidebarRef = useRef<HTMLDivElement>(null)
  const isResizingSidebarRef = useRef(false)
  const sidebarWidthRef = useRef(paperSidebarWidth)
  const pendingSidebarWidthRef = useRef<number | null>(null)
  const sidebarResizeRafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!isResizingSidebarRef.current) {
      sidebarWidthRef.current = paperSidebarWidth
    }
  }, [paperSidebarWidth])

  useEffect(() => {
    if (currentView === 'paper') {
      secondarySidebarRef.current?.style.setProperty(
        '--paper-sidebar-width',
        `${paperSidebarWidth}px`
      )
    } else {
      secondarySidebarRef.current?.style.removeProperty('--paper-sidebar-width')
    }
  }, [currentView, paperSidebarWidth])

  const applySidebarWidth = useCallback((nextWidth: number) => {
    const width = Math.min(
      Math.max(Math.round(nextWidth), PAPER_SIDEBAR_MIN_WIDTH),
      PAPER_SIDEBAR_MAX_WIDTH
    )
    sidebarWidthRef.current = width
    pendingSidebarWidthRef.current = width

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
    setPaperSidebarWidth(sidebarWidthRef.current)
  }, [handleSidebarResizeMove, setPaperSidebarWidth])

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
                    {transitionKey === 'lab' && <LabSidebarSection />}
                  </div>
                )}
              </CssSwitchTransition>
            </div>
          </div>
        </aside>
        {currentView === 'paper' && !isCurrentSidebarCollapsed && (
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
