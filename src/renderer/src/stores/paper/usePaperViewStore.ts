import { create } from 'zustand'
import type { PaperTocEntry, PaperTocItem, PaperTocOutline } from '@shared/types/paper'
import { useConfigStore } from '@renderer/stores/configStore'
import { usePaperFigureStore } from './usePaperFigureStore'

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export interface PaperViewScrollPosition {
  scrollTop: number
  scrollLeft: number
}

// ---------------------------------------------------------------------------
// 缩放常量
// ---------------------------------------------------------------------------

const ZOOM_DEFAULT = 1.0
const ZOOM_MIN = 0.5
const ZOOM_MAX = 2.0
const ZOOM_STEP = 0.1

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

function normalizeZoomLevel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return ZOOM_DEFAULT
  }
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +value.toFixed(2)))
}

function normalizeScrollPosition(position: PaperViewScrollPosition): PaperViewScrollPosition {
  const scrollTop = Number.isFinite(position.scrollTop) ? Math.max(position.scrollTop, 0) : 0
  const scrollLeft = Number.isFinite(position.scrollLeft) ? Math.max(position.scrollLeft, 0) : 0
  return { scrollTop, scrollLeft }
}

// ---------------------------------------------------------------------------
// State 类型
// ---------------------------------------------------------------------------

interface PaperViewState {
  zoomLevel: number
  zoomPercent: number
  originalPdfVisible: boolean
  paperTocTitle: PaperTocEntry | null
  paperTocItems: PaperTocItem[]

  // Getters
  canZoomIn: () => boolean
  canZoomOut: () => boolean

  // 注册回调
  scrollToHeadingFn: ((headingId: string) => boolean) | null

  // Actions
  registerScrollToHeading: (fn: (headingId: string) => boolean) => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  setZoomLevel: (value: number, options?: { persist?: boolean }) => void
  handleWheelZoom: (event: WheelEvent) => void
  loadPaperReaderPreferences: () => void
  toggleOriginalPdfVisible: () => void
  hideOriginalPdf: () => void
  setPaperTocOutline: (outline: PaperTocOutline) => void
  clearPaperToc: () => void
  scrollToHeading: (headingId: string) => boolean
  setMarkdownScrollPosition: (paperId: string, position: PaperViewScrollPosition) => void
  getMarkdownScrollPosition: (paperId: string) => PaperViewScrollPosition | null
  setOriginalPdfScrollPosition: (paperId: string, position: PaperViewScrollPosition) => void
  getOriginalPdfScrollPosition: (paperId: string) => PaperViewScrollPosition | null
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePaperViewStore = create<PaperViewState>()((set, get) => {
  // 非响应式闭包状态（等价于模块级 Map）
  const markdownScrollPositionByPaperId = new Map<string, PaperViewScrollPosition>()
  const originalPdfScrollPositionByPaperId = new Map<string, PaperViewScrollPosition>()

  // 缩放持久化闭包
  let zoomPersistenceReady = false
  let zoomSaveTimer: ReturnType<typeof setTimeout> | null = null
  let wheelZoomRafId: number | null = null
  let pendingWheelDelta = 0
  let zoomEndTimer: ReturnType<typeof setTimeout> | null = null
  let zoomPercentRafId: number | null = null

  function scheduleZoomPercentSync(): void {
    if (zoomPercentRafId !== null) return
    zoomPercentRafId = requestAnimationFrame(() => {
      zoomPercentRafId = null
      const level = get().zoomLevel
      set({ zoomPercent: Math.round(level * 100) })
    })
  }

  function scheduleZoomPersistence(): void {
    if (!zoomPersistenceReady) return
    const configStore = useConfigStore.getState()
    configStore.updatePaperReaderConfig({ zoomLevel: get().zoomLevel })
    if (zoomSaveTimer) clearTimeout(zoomSaveTimer)
    zoomSaveTimer = setTimeout(() => {
      zoomSaveTimer = null
      void configStore.saveConfig({ silent: true })
    }, 800)
  }

  function internalSetZoomLevel(value: number, options: { persist?: boolean } = {}): void {
    const nextZoomLevel = normalizeZoomLevel(value)
    const currentLevel = get().zoomLevel
    if (currentLevel === nextZoomLevel) return

    set({ zoomLevel: nextZoomLevel })
    scheduleZoomPercentSync()

    if (options.persist !== false) {
      scheduleZoomPersistence()
    }
  }

  return {
    zoomLevel: ZOOM_DEFAULT,
    zoomPercent: 100,
    originalPdfVisible: false,
    paperTocTitle: null as PaperTocEntry | null,
    paperTocItems: [] as PaperTocItem[],
    scrollToHeadingFn: null as ((headingId: string) => boolean) | null,

    // -----------------------------------------------------------------------
    // Getters
    // -----------------------------------------------------------------------

    canZoomIn: () => get().zoomLevel < ZOOM_MAX,
    canZoomOut: () => get().zoomLevel > ZOOM_MIN,

    // -----------------------------------------------------------------------
    // Zoom Actions
    // -----------------------------------------------------------------------

    zoomIn: () => {
      internalSetZoomLevel(+(get().zoomLevel + ZOOM_STEP).toFixed(1))
    },

    zoomOut: () => {
      internalSetZoomLevel(+(get().zoomLevel - ZOOM_STEP).toFixed(1))
    },

    resetZoom: () => {
      internalSetZoomLevel(ZOOM_DEFAULT)
    },

    setZoomLevel: internalSetZoomLevel,

    handleWheelZoom: (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      pendingWheelDelta += -event.deltaY * 0.01
      if (wheelZoomRafId === null) {
        wheelZoomRafId = requestAnimationFrame(() => {
          wheelZoomRafId = null
          if (pendingWheelDelta === 0) return
          const level = get().zoomLevel
          const nextZoomLevel = normalizeZoomLevel(level + pendingWheelDelta)
          pendingWheelDelta = 0
          if (get().zoomLevel === nextZoomLevel) return
          set({ zoomLevel: nextZoomLevel })
          scheduleZoomPercentSync()
        })
      }
      if (zoomEndTimer) clearTimeout(zoomEndTimer)
      zoomEndTimer = setTimeout(() => {
        zoomEndTimer = null
        scheduleZoomPersistence()
      }, 500)
    },

    loadPaperReaderPreferences: () => {
      const configStore = useConfigStore.getState()
      const level = normalizeZoomLevel(configStore.paperReaderConfig.zoomLevel)
      const zoomPercent = Math.round(level * 100)
      zoomPersistenceReady = true
      const s = get()
      if (s.zoomLevel === level && s.zoomPercent === zoomPercent) {
        return
      }
      set({ zoomLevel: level, zoomPercent })
    },

    // -----------------------------------------------------------------------
    // Original PDF Actions
    // -----------------------------------------------------------------------

    toggleOriginalPdfVisible: () => {
      const s = get()
      const nextVisible = !s.originalPdfVisible
      if (nextVisible) {
        usePaperFigureStore.getState().resetFigureUiState()
        set({ originalPdfVisible: true })
      } else {
        set({ originalPdfVisible: false })
      }
    },

    hideOriginalPdf: () => {
      set({ originalPdfVisible: false })
    },

    // -----------------------------------------------------------------------
    // TOC Actions
    // -----------------------------------------------------------------------

    setPaperTocOutline: (outline: PaperTocOutline) => {
      set({
        paperTocTitle: outline.documentTitle || null,
        paperTocItems: outline.items
      })
    },

    clearPaperToc: () => {
      set({ paperTocTitle: null, paperTocItems: [] })
    },

    registerScrollToHeading: (fn: (headingId: string) => boolean) => {
      set({ scrollToHeadingFn: fn })
    },

    scrollToHeading: (headingId: string): boolean => {
      const fn = get().scrollToHeadingFn
      if (fn) return fn(headingId)
      if (typeof document === 'undefined') return false
      const heading = document.getElementById(headingId)
      if (!heading) return false
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return true
    },

    // -----------------------------------------------------------------------
    // Scroll Position Actions
    // -----------------------------------------------------------------------

    setMarkdownScrollPosition: (paperId: string, position: PaperViewScrollPosition) => {
      if (!paperId) return
      markdownScrollPositionByPaperId.set(paperId, normalizeScrollPosition(position))
    },

    getMarkdownScrollPosition: (paperId: string): PaperViewScrollPosition | null => {
      return markdownScrollPositionByPaperId.get(paperId) || null
    },

    setOriginalPdfScrollPosition: (paperId: string, position: PaperViewScrollPosition) => {
      if (!paperId) return
      originalPdfScrollPositionByPaperId.set(paperId, normalizeScrollPosition(position))
    },

    getOriginalPdfScrollPosition: (paperId: string): PaperViewScrollPosition | null => {
      return originalPdfScrollPositionByPaperId.get(paperId) || null
    }
  }
})
