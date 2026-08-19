import { create } from 'zustand'
import type { PaperFigureItem } from '@shared/types/paper'
import {
  buildBase64DataUrl,
  fileUrlToPath,
  getImageMimeTypeFromPath,
  isFileUrl
} from '@shared/utils'
import {
  clampPreviewHeight,
  clampPreviewLeft,
  clampPreviewTop,
  clampPreviewWidth,
  getFigurePreviewHeight,
  getFigureRatio
} from './composables/paperFigurePreviewCore'
import { createDefaultFigurePreviewRect, type PaperFigurePreviewRect } from './shared'
import { usePaperListStore } from './usePaperListStore'

// ---------------------------------------------------------------------------
// 图片路径解析
// ---------------------------------------------------------------------------

async function resolveFigureImagePath(imagePath: string, paperId: string): Promise<string> {
  if (!imagePath || /^(data:|blob:|https?:\/\/|lumina:\/\/)/i.test(imagePath)) {
    return imagePath
  }
  const localFilePath = isFileUrl(imagePath) ? fileUrlToPath(imagePath) || imagePath : imagePath

  if (/^(assets|pages)\//i.test(localFilePath)) {
    return `lumina://paper/${paperId}/${localFilePath}`
  }

  // 提取论文相对路径，构造 lumina:// 协议 URL（避免 Base64 IPC 传输）
  const paperMarker = `/${paperId}/`
  const markerIndex = localFilePath.indexOf(paperMarker)
  if (markerIndex >= 0) {
    const relativePath = localFilePath.substring(markerIndex + paperMarker.length)
    return `lumina://paper/${paperId}/${relativePath}`
  }
  // fallback：使用 IPC 读取
  const result = await window.api.paper.readFileAsBase64(localFilePath)
  if (!result.success || !result.data) {
    return imagePath
  }
  return buildBase64DataUrl(result.data, getImageMimeTypeFromPath(localFilePath))
}

async function normalizePaperFigures(
  figures: PaperFigureItem[],
  paperId: string
): Promise<PaperFigureItem[]> {
  return Promise.all(
    figures.map(async (figure) => {
      const imagePath = await resolveFigureImagePath(figure.imagePath, paperId)
      return { ...figure, imagePath }
    })
  )
}

// ---------------------------------------------------------------------------
// State 类型
// ---------------------------------------------------------------------------

interface PaperFigureState {
  figuresByPaperId: Record<string, PaperFigureItem[]>
  figureLoadingByPaperId: Record<string, boolean>
  showFigurePanel: boolean
  activeFigure: PaperFigureItem | null
  figurePreviewPinned: boolean
  figurePreviewRect: PaperFigurePreviewRect
  figurePreviewImageRatio: number

  // Getters
  currentPaperFigures: () => PaperFigureItem[]

  // Actions
  loadFigures: (paperId: string, force?: boolean) => Promise<PaperFigureItem[]>
  setFigurePanelVisible: (value: boolean) => void
  closeFigurePanel: () => void
  toggleFigurePanel: () => Promise<void>
  openFigurePreview: (
    item: PaperFigureItem,
    options?: { initialRect?: Partial<PaperFigurePreviewRect> }
  ) => void
  openFigurePreviewById: (paperId: string, figureId: string) => Promise<void>
  closeFigurePreview: () => void
  setFigurePreviewPinned: (value: boolean) => void
  setFigurePreviewImageRatio: (ratio: number) => void
  setFigurePreviewRect: (nextRect: Partial<PaperFigurePreviewRect>) => void
  moveFigurePreview: (delta: { x: number; y: number }) => void
  resizeFigurePreview: (nextWidth: number) => void
  resizeFigurePreviewFromLeft: (nextWidth: number) => void
  resetFigureUiState: () => void
  clearPaperFigureState: (paperId: string) => void
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePaperFigureStore = create<PaperFigureState>()((set, get) => ({
  figuresByPaperId: {} as Record<string, PaperFigureItem[]>,
  figureLoadingByPaperId: {} as Record<string, boolean>,
  showFigurePanel: false,
  activeFigure: null as PaperFigureItem | null,
  figurePreviewPinned: false,
  figurePreviewRect: createDefaultFigurePreviewRect(),
  figurePreviewImageRatio: 0.75,

  // -------------------------------------------------------------------------
  // Getters
  // -------------------------------------------------------------------------

  currentPaperFigures: () => {
    const currentPaperId = usePaperListStore.getState().currentPaperId
    if (!currentPaperId) return []
    return get().figuresByPaperId[currentPaperId] || []
  },

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  loadFigures: async (paperId: string, force = false): Promise<PaperFigureItem[]> => {
    const s = get()
    const cachedFigures = s.figuresByPaperId[paperId]
    if (!force && cachedFigures) return cachedFigures

    // 设置加载状态
    set({
      figureLoadingByPaperId: {
        ...s.figureLoadingByPaperId,
        [paperId]: true
      }
    })
    try {
      const result = await window.api.paper.listFigures(paperId)
      if (!result.success || !result.data) {
        set({
          figuresByPaperId: {
            ...get().figuresByPaperId,
            [paperId]: []
          }
        })
        return []
      }
      const normalizedFigures = await normalizePaperFigures(result.data, paperId)
      set({
        figuresByPaperId: {
          ...get().figuresByPaperId,
          [paperId]: normalizedFigures
        }
      })
      return normalizedFigures
    } finally {
      const s2 = get()
      set({
        figureLoadingByPaperId: {
          ...s2.figureLoadingByPaperId,
          [paperId]: false
        }
      })
    }
  },

  setFigurePanelVisible: (value: boolean) => {
    if (get().showFigurePanel === value) return
    set({ showFigurePanel: value })
  },

  closeFigurePanel: () => {
    if (!get().showFigurePanel) return
    set({ showFigurePanel: false })
  },

  toggleFigurePanel: async () => {
    const s = get()
    const currentPaperId = usePaperListStore.getState().currentPaperId
    if (!currentPaperId) return

    if (s.showFigurePanel) {
      set({ showFigurePanel: false })
      return
    }

    set({ showFigurePanel: true })
    await get().loadFigures(currentPaperId)
  },

  openFigurePreview: (
    item: PaperFigureItem,
    options?: { initialRect?: Partial<PaperFigurePreviewRect> }
  ) => {
    const s = get()
    const ratio = getFigureRatio(item)

    if (!s.activeFigure) {
      const defaultRect = createDefaultFigurePreviewRect()
      const initialRect = options?.initialRect
      const width = clampPreviewWidth(initialRect?.width ?? defaultRect.width)
      const height =
        typeof initialRect?.height === 'number' && Number.isFinite(initialRect.height)
          ? initialRect.height
          : getFigurePreviewHeight(width, ratio)

      const nextRect: PaperFigurePreviewRect = {
        left: clampPreviewLeft(initialRect?.left ?? defaultRect.left, width),
        top: clampPreviewTop(initialRect?.top ?? defaultRect.top, height),
        width,
        height: clampPreviewHeight(height)
      }
      set({
        figurePreviewRect: nextRect,
        figurePreviewPinned: false,
        activeFigure: item,
        figurePreviewImageRatio: ratio,
        showFigurePanel: false
      })
      return
    }

    set({
      activeFigure: item,
      figurePreviewImageRatio: ratio,
      showFigurePanel: false
    })
  },

  closeFigurePreview: () => {
    set({
      activeFigure: null,
      figurePreviewPinned: false,
      figurePreviewImageRatio: 0.75
    })
  },

  // 按图片 ID 打开预览；图片列表未加载时先加载（loadFigures 有缓存，不会重复请求），
  // 确保首次启动后直接点击正文图片也能打开预览
  openFigurePreviewById: async (paperId: string, figureId: string): Promise<void> => {
    const figures = await get().loadFigures(paperId)
    const figure = figures.find((f) => f.id === figureId)
    if (figure) {
      get().openFigurePreview(figure)
    }
  },

  setFigurePreviewPinned: (value: boolean) => set({ figurePreviewPinned: value }),

  setFigurePreviewImageRatio: (ratio: number) => {
    if (!Number.isFinite(ratio) || ratio <= 0) return
    set({ figurePreviewImageRatio: ratio })
  },

  setFigurePreviewRect: (nextRect: Partial<PaperFigurePreviewRect>) => {
    const s = get()
    const nextWidth =
      typeof nextRect.width === 'number' && Number.isFinite(nextRect.width)
        ? nextRect.width
        : s.figurePreviewRect.width
    const width = clampPreviewWidth(nextWidth)
    const currentHeight = s.figurePreviewRect.height
    const fallbackHeight =
      typeof currentHeight === 'number' && Number.isFinite(currentHeight)
        ? currentHeight
        : getFigurePreviewHeight(width, s.figurePreviewImageRatio)
    const nextHeight =
      typeof nextRect.height === 'number' && Number.isFinite(nextRect.height)
        ? nextRect.height
        : fallbackHeight
    const height = clampPreviewHeight(nextHeight)

    set({
      figurePreviewRect: {
        left: clampPreviewLeft(nextRect.left ?? s.figurePreviewRect.left, width),
        top: clampPreviewTop(nextRect.top ?? s.figurePreviewRect.top, height),
        width,
        height
      }
    })
  },

  moveFigurePreview: (delta: { x: number; y: number }) => {
    const s = get()
    set({
      figurePreviewRect: {
        ...s.figurePreviewRect,
        left: clampPreviewLeft(s.figurePreviewRect.left + delta.x, s.figurePreviewRect.width),
        top: clampPreviewTop(s.figurePreviewRect.top + delta.y, s.figurePreviewRect.height)
      }
    })
  },

  resizeFigurePreview: (nextWidth: number) => {
    if (!Number.isFinite(nextWidth)) return
    const s = get()
    const width = clampPreviewWidth(nextWidth)
    set({
      figurePreviewRect: {
        ...s.figurePreviewRect,
        width,
        left: clampPreviewLeft(s.figurePreviewRect.left, width)
      }
    })
  },

  resizeFigurePreviewFromLeft: (nextWidth: number) => {
    if (!Number.isFinite(nextWidth)) return
    const s = get()
    const right = s.figurePreviewRect.left + s.figurePreviewRect.width
    const width = clampPreviewWidth(nextWidth)
    set({
      figurePreviewRect: {
        ...s.figurePreviewRect,
        width,
        left: clampPreviewLeft(right - width, width)
      }
    })
  },

  resetFigureUiState: () => {
    set({
      showFigurePanel: false,
      activeFigure: null,
      figurePreviewPinned: false,
      figurePreviewImageRatio: 0.75
    })
  },

  clearPaperFigureState: (paperId: string) => {
    const s = get()
    const nextFigures = { ...s.figuresByPaperId }
    delete nextFigures[paperId]

    const nextFigureLoading = { ...s.figureLoadingByPaperId }
    delete nextFigureLoading[paperId]

    set({
      figuresByPaperId: nextFigures,
      figureLoadingByPaperId: nextFigureLoading
    })
  }
}))
