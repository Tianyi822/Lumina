import { useState, useCallback, useEffect, useRef } from 'react'
import { useFileStore } from '@renderer/stores'
import type { FileItem } from '@renderer/types'
import type { UploadResult } from './hooks/useFileUpload'
import FileSelectorHeader from './file-selector/components/FileSelectorHeader'
import FileSelectorTabs from './file-selector/components/FileSelectorTabs'
import ExistingFilesTab from './file-selector/components/ExistingFilesTab'
import UploadTab from './file-selector/components/UploadTab'
import { useFileSelection } from './hooks/useFileSelection'
import styles from './FileSelectorModal.module.css'

type TabType = 'existing' | 'upload'

interface FileSelectorModalProps {
  kbId: string
  linkedFileIds: string[]
  onClose: () => void
  onFilesLinked: (files: FileItem[]) => void
}

const PANEL_HEIGHT_TRANSITION_FALLBACK_MS = 300

export default function FileSelectorModal({
  kbId,
  linkedFileIds,
  onClose,
  onFilesLinked
}: FileSelectorModalProps) {
  const files = useFileStore((s) => s.files)
  const loadFiles = useFileStore((s) => s.loadFiles)

  const [activeTab, setActiveTab] = useState<TabType>('existing')
  const [visibleTab, setVisibleTab] = useState<TabType>('existing')
  const [isPanelContentVisible, setIsPanelContentVisible] = useState(true)
  const [isPanelMeasured, setIsPanelMeasured] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const panelShellRef = useRef<HTMLDivElement>(null)
  const existingPanelRef = useRef<HTMLDivElement>(null)
  const uploadPanelRef = useRef<HTMLDivElement>(null)
  const pendingVisibleTabRef = useRef<TabType | null>(null)
  const panelTransitionTimerRef = useRef<number | null>(null)
  const panelHeightAnimationFrameRef = useRef<number | null>(null)
  const panelResizeObserverRef = useRef<ResizeObserver | null>(null)
  const isPanelHeightTransitioningRef = useRef(false)

  const {
    selectedFileIds,
    linkingFileIds,
    toggleSelection,
    selectAll,
    deselectAll,
    linkSelectedFiles
  } = useFileSelection(files, kbId)

  // Panel height helpers
  const getPanelElement = useCallback(
    (tab: TabType): HTMLElement | null =>
      tab === 'existing' ? existingPanelRef.current : uploadPanelRef.current,
    []
  )

  const readPanelAvailableHeight = useCallback((): number => {
    const container = containerRef.current
    const panelShell = panelShellRef.current
    if (!container || !panelShell) return Number.POSITIVE_INFINITY

    const containerStyles = window.getComputedStyle(container)
    const panelShellRect = panelShell.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const maxContainerHeight = parseFloat(containerStyles.maxHeight)
    const containerHeightLimit = Number.isFinite(maxContainerHeight)
      ? maxContainerHeight
      : container.clientHeight
    const panelShellTop = panelShellRect.top - containerRect.top
    const availableHeight = Math.floor(containerHeightLimit - panelShellTop)

    return Math.max(1, availableHeight)
  }, [])

  const readPanelHeight = useCallback(
    (tab: TabType): number => {
      const panel = getPanelElement(tab)
      if (!panel) return 0
      return Math.min(Math.ceil(panel.scrollHeight), readPanelAvailableHeight())
    },
    [getPanelElement, readPanelAvailableHeight]
  )

  const setPanelShellHeight = useCallback(
    (height: number) => {
      const panelShell = panelShellRef.current
      if (!panelShell || height <= 0) return
      setIsPanelMeasured(true)
      panelShell.style.height = `${Math.min(height, readPanelAvailableHeight())}px`
    },
    [readPanelAvailableHeight]
  )

  const lockPanelShellHeight = useCallback((): number => {
    const panelShell = panelShellRef.current
    if (!panelShell) return 0
    const currentHeight = Math.ceil(panelShell.offsetHeight)
    setPanelShellHeight(currentHeight)
    void panelShell.offsetHeight
    return currentHeight
  }, [setPanelShellHeight])

  const clearPanelHeightAnimationFrame = useCallback(() => {
    if (panelHeightAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(panelHeightAnimationFrameRef.current)
      panelHeightAnimationFrameRef.current = null
    }
  }, [])

  const animatePanelShellHeightTo = useCallback(
    (nextHeight: number) => {
      clearPanelHeightAnimationFrame()
      panelHeightAnimationFrameRef.current = window.requestAnimationFrame(() => {
        panelHeightAnimationFrameRef.current = null
        setPanelShellHeight(nextHeight)
      })
    },
    [clearPanelHeightAnimationFrame, setPanelShellHeight]
  )

  const syncVisiblePanelHeight = useCallback(() => {
    const nextHeight = readPanelHeight(visibleTab)
    if (nextHeight > 0) {
      lockPanelShellHeight()
      animatePanelShellHeightTo(nextHeight)
    }
  }, [visibleTab, readPanelHeight, lockPanelShellHeight, animatePanelShellHeightTo])

  const clearPanelTransitionTimer = useCallback(() => {
    if (panelTransitionTimerRef.current !== null) {
      window.clearTimeout(panelTransitionTimerRef.current)
      panelTransitionTimerRef.current = null
    }
  }, [])

  const observePanelContent = useCallback(() => {
    panelResizeObserverRef.current?.disconnect()

    if (typeof ResizeObserver === 'undefined') return

    panelResizeObserverRef.current = new ResizeObserver(() => {
      if (
        !pendingVisibleTabRef.current &&
        !isPanelHeightTransitioningRef.current &&
        isPanelContentVisible
      ) {
        syncVisiblePanelHeight()
      }
    })

    if (existingPanelRef.current) {
      panelResizeObserverRef.current.observe(existingPanelRef.current)
    }
    if (uploadPanelRef.current) {
      panelResizeObserverRef.current.observe(uploadPanelRef.current)
    }
  }, [isPanelContentVisible, syncVisiblePanelHeight])

  const finishPendingPanelTransition = useCallback(() => {
    const pendingTab = pendingVisibleTabRef.current
    if (!pendingTab) return

    setVisibleTab(pendingTab)
    pendingVisibleTabRef.current = null
    setIsPanelContentVisible(true)
    isPanelHeightTransitioningRef.current = false
    clearPanelTransitionTimer()

    // Use setTimeout to let React render first, then measure
    setTimeout(() => {
      observePanelContent()
      syncVisiblePanelHeight()
    }, 0)
  }, [clearPanelTransitionTimer, observePanelContent, syncVisiblePanelHeight])

  // Handle tab switch
  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab)
  }, [])

  // Effect: handle tab animation
  useEffect(() => {
    if (activeTab === visibleTab && !pendingVisibleTabRef.current) return

    pendingVisibleTabRef.current = null
    clearPanelTransitionTimer()
    clearPanelHeightAnimationFrame()
    lockPanelShellHeight()

    // Read next height after React renders
    const rafId = requestAnimationFrame(() => {
      const nextHeight = readPanelHeight(activeTab)
      if (nextHeight <= 0) return

      isPanelHeightTransitioningRef.current = true
      setIsPanelContentVisible(false)
      pendingVisibleTabRef.current = activeTab

      requestAnimationFrame(() => {
        void panelShellRef.current?.offsetHeight
        animatePanelShellHeightTo(nextHeight)
        panelTransitionTimerRef.current = window.setTimeout(
          finishPendingPanelTransition,
          PANEL_HEIGHT_TRANSITION_FALLBACK_MS
        )
      })
    })

    return () => cancelAnimationFrame(rafId)
  }, [
    activeTab,
    visibleTab,
    lockPanelShellHeight,
    readPanelHeight,
    animatePanelShellHeightTo,
    finishPendingPanelTransition,
    clearPanelTransitionTimer,
    clearPanelHeightAnimationFrame
  ])

  // Handle panel shell transition end
  const handlePanelShellTransitionEnd = useCallback(
    (event: React.TransitionEvent) => {
      if (
        event.target !== panelShellRef.current ||
        event.propertyName !== 'height' ||
        !isPanelHeightTransitioningRef.current
      ) {
        return
      }

      isPanelHeightTransitioningRef.current = false

      if (pendingVisibleTabRef.current) {
        finishPendingPanelTransition()
        return
      }

      clearPanelTransitionTimer()
      observePanelContent()
    },
    [finishPendingPanelTransition, clearPanelTransitionTimer, observePanelContent]
  )

  // Lifecycle: load files, setup observer
  useEffect(() => {
    loadFiles()

    // After initial render, observe and sync
    const rafId = requestAnimationFrame(() => {
      observePanelContent()
      syncVisiblePanelHeight()
    })

    const handleResize = () => syncVisiblePanelHeight()
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(rafId)
      panelResizeObserverRef.current?.disconnect()
      clearPanelTransitionTimer()
      clearPanelHeightAnimationFrame()
      window.removeEventListener('resize', handleResize)
    }
  }, [
    loadFiles,
    observePanelContent,
    syncVisiblePanelHeight,
    clearPanelTransitionTimer,
    clearPanelHeightAnimationFrame
  ])

  // Handlers
  const handleToggle = useCallback((fileId: string) => toggleSelection(fileId), [toggleSelection])

  const handleLinkSelected = useCallback(async () => {
    const linkedFiles = await linkSelectedFiles()
    if (linkedFiles.length > 0) {
      onFilesLinked(linkedFiles)
    }
  }, [linkSelectedFiles, onFilesLinked])

  const handleUploadComplete = useCallback(
    (result: UploadResult) => {
      const newFiles = [...result.uploaded, ...result.duplicates]
      if (newFiles.length > 0) {
        onFilesLinked(newFiles)
      }
    },
    [onFilesLinked]
  )

  return (
    <div className={`sm-modal__overlay ${styles['file-selector-overlay']}`} onClick={onClose}>
      <div
        ref={containerRef}
        className={`sm-modal__surface ${styles['file-selector-container']}`}
        onClick={(e) => e.stopPropagation()}
      >
        <FileSelectorHeader onClose={onClose} />

        <FileSelectorTabs activeTab={activeTab} onTabChange={handleTabChange} />

        <div
          ref={panelShellRef}
          className={`${styles['file-selector-panel-shell']} ${isPanelMeasured ? styles['is-measured'] : ''}`}
          onTransitionEnd={handlePanelShellTransitionEnd}
        >
          <div
            ref={existingPanelRef}
            className={`${styles['file-selector-panel']} ${visibleTab === 'existing' && isPanelContentVisible ? styles['is-active'] : ''}`}
            aria-hidden={visibleTab !== 'existing' || !isPanelContentVisible}
          >
            <ExistingFilesTab
              kbId={kbId}
              linkedFileIds={linkedFileIds}
              selectedFileIds={selectedFileIds}
              linkingFileIds={linkingFileIds}
              onToggle={handleToggle}
              onSelectAll={selectAll}
              onDeselectAll={deselectAll}
              onLinkSelected={handleLinkSelected}
              onClose={onClose}
            />
          </div>

          <div
            ref={uploadPanelRef}
            className={`${styles['file-selector-panel']} ${visibleTab === 'upload' && isPanelContentVisible ? styles['is-active'] : ''}`}
            aria-hidden={visibleTab !== 'upload' || !isPanelContentVisible}
          >
            <UploadTab kbId={kbId} onClose={onClose} onUploadComplete={handleUploadComplete} />
          </div>
        </div>
      </div>
    </div>
  )
}
