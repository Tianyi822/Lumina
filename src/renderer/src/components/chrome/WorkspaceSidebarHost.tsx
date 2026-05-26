import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import WorkspaceSidebarChrome from '@renderer/components/chrome/WorkspaceSidebarChrome'
import { CssSwitchTransition } from '@renderer/components/motion/CssTransition'
import {
  useUIStateStore,
  usePaperListStore,
  useKnowledgeStore,
  useLabListStore
} from '@renderer/stores'
import PaperSidebarSection from '@renderer/components/chrome/PaperSidebarSection'
import KnowledgeSidebarSection from '@renderer/components/chrome/KnowledgeSidebarSection'
import LabSidebarSection from '@renderer/components/chrome/LabSidebarSection'
import styles from './WorkspaceSidebarHost.module.css'

const PAPER_SIDEBAR_MIN_WIDTH = 260
const PAPER_SIDEBAR_MAX_WIDTH = 480

export default function WorkspaceSidebarHost() {
  const currentView = useUIStateStore((s) => s.currentView)
  const isCurrentSidebarCollapsed = useUIStateStore((s) => s.isCurrentSidebarCollapsed())
  const paperSidebarWidth = useUIStateStore((s) => s.paperSidebarWidth)
  const setPaperSidebarWidth = useUIStateStore((s) => s.setPaperSidebarWidth)

  const paperCount = usePaperListStore((s) => s.papers.length)
  const kbCount = useKnowledgeStore((s) => s.knowledgeBases.length)
  const labCount = useLabListStore((s) => s.labList.length)
  const sidebarCount = useMemo(() => {
    if (currentView === 'paper') return paperCount
    if (currentView === 'knowledge') return kbCount
    return labCount
  }, [currentView, paperCount, kbCount, labCount])

  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const sidebarFrameRef = useRef<HTMLDivElement>(null)
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
      sidebarFrameRef.current?.style.setProperty('--paper-sidebar-width', `${paperSidebarWidth}px`)
    } else {
      sidebarFrameRef.current?.style.removeProperty('--paper-sidebar-width')
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
      sidebarFrameRef.current?.style.setProperty('--paper-sidebar-width', `${pendingWidth}px`)
    })
  }, [])

  const handleSidebarResizeMove = useCallback(
    (event: PointerEvent) => {
      if (!isResizingSidebarRef.current) return
      applySidebarWidth(event.clientX)
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
    <div
      ref={sidebarFrameRef}
      className={[
        'sm-sidebar-frame',
        styles['sm-sidebar-frame'],
        isCurrentSidebarCollapsed && 'is-collapsed',
        isResizingSidebar && styles['sm-sidebar-frame--resizing']
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <aside className={['sm-sidebar-shell', styles['sm-workspace-sidebar-host']].join(' ')}>
        <WorkspaceSidebarChrome count={sidebarCount} />

        <div className={styles['sm-workspace-sidebar-host__viewport']}>
          <div className={styles['sm-workspace-sidebar-host__panel']}>
            <CssSwitchTransition
              name="sm-sidebar-section-switch"
              transitionKey={currentView}
              appear
            >
              {({ transitionKey, className, ref }) => (
                <div ref={ref} className={className}>
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
  )
}
