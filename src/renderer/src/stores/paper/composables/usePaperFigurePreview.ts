import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type {
  PaperFigureItem,
  PaperTocEntry,
  PaperTocItem,
  PaperTocOutline
} from '@shared/types/paper'
import {
  buildBase64DataUrl,
  fileUrlToPath,
  getImageMimeTypeFromPath,
  isFileUrl
} from '@shared/utils'
import {
  PAPER_FIGURE_PREVIEW_MARGIN,
  PAPER_FIGURE_PREVIEW_MIN_HEIGHT,
  PAPER_FIGURE_PREVIEW_MIN_WIDTH,
  createDefaultFigurePreviewRect,
  type PaperFigurePreviewRect
} from '../shared'

export interface PaperFigurePreviewComposable {
  figuresByPaperId: Ref<Record<string, PaperFigureItem[]>>
  figureLoadingByPaperId: Ref<Record<string, boolean>>
  showFigurePanel: Ref<boolean>
  activeFigure: Ref<PaperFigureItem | null>
  figurePreviewPinned: Ref<boolean>
  figurePreviewRect: Ref<PaperFigurePreviewRect>
  figurePreviewImageRatio: Ref<number>
  paperTocTitle: Ref<PaperTocEntry | null>
  paperTocItems: Ref<PaperTocItem[]>
  currentPaperFigures: ComputedRef<PaperFigureItem[]>
  setPaperTocOutline: (outline: PaperTocOutline) => void
  clearPaperToc: () => void
  setFigurePanelVisible: (value: boolean) => void
  closeFigurePanel: () => void
  closeFigurePreview: () => void
  resetFigureUiState: () => void
  setFigurePreviewPinned: (value: boolean) => void
  setFigurePreviewImageRatio: (ratio: number) => void
  setFigurePreviewRect: (nextRect: Partial<PaperFigurePreviewRect>) => void
  moveFigurePreview: (delta: { x: number; y: number }) => void
  resizeFigurePreview: (nextWidth: number) => void
  resizeFigurePreviewFromLeft: (nextWidth: number) => void
  loadFigures: (paperId: string, force?: boolean) => Promise<PaperFigureItem[]>
  toggleFigurePanel: () => Promise<void>
  openFigurePreview: (
    item: PaperFigureItem,
    options?: {
      initialRect?: Partial<PaperFigurePreviewRect>
    }
  ) => void
  scrollToHeading: (headingId: string) => boolean
  clearPaperFigureState: (paperId: string) => void
}

export function usePaperFigurePreview(
  currentPaperId: Ref<string | null>
): PaperFigurePreviewComposable {
  const figuresByPaperId = ref<Record<string, PaperFigureItem[]>>({})
  const figureLoadingByPaperId = ref<Record<string, boolean>>({})
  const showFigurePanel = ref(false)
  const activeFigure = ref<PaperFigureItem | null>(null)
  const figurePreviewPinned = ref(false)
  const figurePreviewRect = ref<PaperFigurePreviewRect>(createDefaultFigurePreviewRect())
  const figurePreviewImageRatio = ref(0.75)
  const paperTocTitle = ref<PaperTocEntry | null>(null)
  const paperTocItems = ref<PaperTocItem[]>([])
  const previewChromeHeightEstimate = 128

  const currentPaperFigures = computed<PaperFigureItem[]>(() => {
    if (!currentPaperId.value) {
      return []
    }

    return figuresByPaperId.value[currentPaperId.value] || []
  })

  function setPaperTocOutline(outline: PaperTocOutline): void {
    paperTocTitle.value = outline.documentTitle || null
    paperTocItems.value = outline.items
  }

  function clearPaperToc(): void {
    paperTocTitle.value = null
    paperTocItems.value = []
  }

  function setFigurePanelVisible(value: boolean): void {
    showFigurePanel.value = value
  }

  function closeFigurePanel(): void {
    showFigurePanel.value = false
  }

  function closeFigurePreview(): void {
    activeFigure.value = null
    figurePreviewPinned.value = false
    figurePreviewImageRatio.value = 0.75
  }

  function resetFigureUiState(): void {
    closeFigurePanel()
    closeFigurePreview()
  }

  function setFigurePreviewPinned(value: boolean): void {
    figurePreviewPinned.value = value
  }

  function setFigurePreviewImageRatio(ratio: number): void {
    if (!Number.isFinite(ratio) || ratio <= 0) {
      return
    }

    figurePreviewImageRatio.value = ratio
  }

  function setFigurePreviewRect(nextRect: Partial<PaperFigurePreviewRect>): void {
    const nextWidth =
      typeof nextRect.width === 'number' && Number.isFinite(nextRect.width)
        ? nextRect.width
        : figurePreviewRect.value.width
    const width = clampPreviewWidth(nextWidth)
    const currentHeight = figurePreviewRect.value.height
    const fallbackHeight =
      typeof currentHeight === 'number' && Number.isFinite(currentHeight)
        ? currentHeight
        : getFigurePreviewHeight(width, figurePreviewImageRatio.value)
    const nextHeight =
      typeof nextRect.height === 'number' && Number.isFinite(nextRect.height)
        ? nextRect.height
        : fallbackHeight
    const height = clampPreviewHeight(nextHeight)

    figurePreviewRect.value = {
      left: clampPreviewLeft(nextRect.left ?? figurePreviewRect.value.left, width),
      top: clampPreviewTop(nextRect.top ?? figurePreviewRect.value.top, height),
      width,
      height
    }
  }

  function clampPreviewWidth(width: number): number {
    if (typeof window === 'undefined') {
      return Math.max(width, PAPER_FIGURE_PREVIEW_MIN_WIDTH)
    }

    const maxWidth = Math.max(
      window.innerWidth - PAPER_FIGURE_PREVIEW_MARGIN * 2,
      PAPER_FIGURE_PREVIEW_MIN_WIDTH
    )
    return Math.min(Math.max(width, PAPER_FIGURE_PREVIEW_MIN_WIDTH), maxWidth)
  }

  function clampPreviewHeight(height: number): number {
    if (typeof window === 'undefined') {
      return Math.max(height, PAPER_FIGURE_PREVIEW_MIN_HEIGHT)
    }

    const maxHeight = Math.max(
      window.innerHeight - PAPER_FIGURE_PREVIEW_MARGIN * 2,
      PAPER_FIGURE_PREVIEW_MIN_HEIGHT
    )
    return Math.min(Math.max(height, PAPER_FIGURE_PREVIEW_MIN_HEIGHT), maxHeight)
  }

  function clampPreviewLeft(left: number, width: number): number {
    if (typeof window === 'undefined') {
      return Math.max(left, PAPER_FIGURE_PREVIEW_MARGIN)
    }

    return Math.min(
      Math.max(left, PAPER_FIGURE_PREVIEW_MARGIN),
      Math.max(window.innerWidth - width - PAPER_FIGURE_PREVIEW_MARGIN, PAPER_FIGURE_PREVIEW_MARGIN)
    )
  }

  function clampPreviewTop(top: number, height: number): number {
    if (typeof window === 'undefined') {
      return Math.max(top, PAPER_FIGURE_PREVIEW_MARGIN)
    }

    return Math.min(
      Math.max(top, PAPER_FIGURE_PREVIEW_MARGIN),
      Math.max(
        window.innerHeight - height - PAPER_FIGURE_PREVIEW_MARGIN,
        PAPER_FIGURE_PREVIEW_MARGIN
      )
    )
  }

  function getFigureRatio(item: PaperFigureItem): number {
    return item.bbox.width > 0 && item.bbox.height > 0 ? item.bbox.height / item.bbox.width : 0.75
  }

  function getFigurePreviewHeight(width: number, ratio: number): number {
    const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 0.75
    return width * safeRatio + previewChromeHeightEstimate
  }

  function moveFigurePreview(delta: { x: number; y: number }): void {
    figurePreviewRect.value = {
      ...figurePreviewRect.value,
      left: clampPreviewLeft(figurePreviewRect.value.left + delta.x, figurePreviewRect.value.width),
      top: clampPreviewTop(figurePreviewRect.value.top + delta.y, figurePreviewRect.value.height)
    }
  }

  function resizeFigurePreview(nextWidth: number): void {
    if (!Number.isFinite(nextWidth)) {
      return
    }

    const width = clampPreviewWidth(nextWidth)

    figurePreviewRect.value = {
      ...figurePreviewRect.value,
      width,
      left: clampPreviewLeft(figurePreviewRect.value.left, width)
    }
  }

  function resizeFigurePreviewFromLeft(nextWidth: number): void {
    if (!Number.isFinite(nextWidth)) {
      return
    }

    const right = figurePreviewRect.value.left + figurePreviewRect.value.width
    const width = clampPreviewWidth(nextWidth)

    figurePreviewRect.value = {
      ...figurePreviewRect.value,
      width,
      left: clampPreviewLeft(right - width, width)
    }
  }

  function setFigureLoading(paperId: string, loading: boolean): void {
    figureLoadingByPaperId.value = {
      ...figureLoadingByPaperId.value,
      [paperId]: loading
    }
  }

  function setPaperFigures(paperId: string, figures: PaperFigureItem[]): void {
    figuresByPaperId.value = {
      ...figuresByPaperId.value,
      [paperId]: figures
    }
  }

  function clearPaperFigureState(paperId: string): void {
    const nextFigures = { ...figuresByPaperId.value }
    delete nextFigures[paperId]
    figuresByPaperId.value = nextFigures

    const nextFigureLoading = { ...figureLoadingByPaperId.value }
    delete nextFigureLoading[paperId]
    figureLoadingByPaperId.value = nextFigureLoading
  }

  async function resolveFigureImagePath(imagePath: string): Promise<string> {
    if (!imagePath || /^(data:|blob:|https?:\/\/)/i.test(imagePath)) {
      return imagePath
    }

    const localFilePath = isFileUrl(imagePath) ? fileUrlToPath(imagePath) || imagePath : imagePath
    const result = await window.api.paper.readFileAsBase64(localFilePath)
    if (!result.success || !result.data) {
      return imagePath
    }

    return buildBase64DataUrl(result.data, getImageMimeTypeFromPath(localFilePath))
  }

  async function normalizePaperFigures(figures: PaperFigureItem[]): Promise<PaperFigureItem[]> {
    return Promise.all(
      figures.map(async (figure) => {
        const imagePath = await resolveFigureImagePath(figure.imagePath)
        return {
          ...figure,
          imagePath
        }
      })
    )
  }

  async function loadFigures(paperId: string, force = false): Promise<PaperFigureItem[]> {
    const cachedFigures = figuresByPaperId.value[paperId]
    if (!force && cachedFigures) {
      return cachedFigures
    }

    setFigureLoading(paperId, true)
    try {
      const result = await window.api.paper.listFigures(paperId)
      if (!result.success || !result.data) {
        setPaperFigures(paperId, [])
        return []
      }

      const normalizedFigures = await normalizePaperFigures(result.data)
      setPaperFigures(paperId, normalizedFigures)
      return normalizedFigures
    } finally {
      setFigureLoading(paperId, false)
    }
  }

  async function toggleFigurePanel(): Promise<void> {
    if (!currentPaperId.value) {
      return
    }

    if (showFigurePanel.value) {
      closeFigurePanel()
      return
    }

    showFigurePanel.value = true
    await loadFigures(currentPaperId.value)
  }

  function openFigurePreview(
    item: PaperFigureItem,
    options?: {
      initialRect?: Partial<PaperFigurePreviewRect>
    }
  ): void {
    const ratio = getFigureRatio(item)

    if (!activeFigure.value) {
      const defaultRect = createDefaultFigurePreviewRect()
      const initialRect = options?.initialRect
      const width = clampPreviewWidth(initialRect?.width ?? defaultRect.width)
      const height =
        typeof initialRect?.height === 'number' && Number.isFinite(initialRect.height)
          ? initialRect.height
          : getFigurePreviewHeight(width, ratio)

      setFigurePreviewRect({
        left: initialRect?.left ?? defaultRect.left,
        top: initialRect?.top ?? defaultRect.top,
        width,
        height
      })
      figurePreviewPinned.value = false
    }

    activeFigure.value = item
    figurePreviewImageRatio.value = ratio
    closeFigurePanel()
  }

  function scrollToHeading(headingId: string): boolean {
    if (typeof document === 'undefined') {
      return false
    }

    const heading = document.getElementById(headingId)
    if (!heading) {
      return false
    }

    heading.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    })

    return true
  }

  return {
    figuresByPaperId,
    figureLoadingByPaperId,
    showFigurePanel,
    activeFigure,
    figurePreviewPinned,
    figurePreviewRect,
    figurePreviewImageRatio,
    paperTocTitle,
    paperTocItems,
    currentPaperFigures,
    setPaperTocOutline,
    clearPaperToc,
    setFigurePanelVisible,
    closeFigurePanel,
    closeFigurePreview,
    resetFigureUiState,
    setFigurePreviewPinned,
    setFigurePreviewImageRatio,
    setFigurePreviewRect,
    moveFigurePreview,
    resizeFigurePreview,
    resizeFigurePreviewFromLeft,
    loadFigures,
    toggleFigurePanel,
    openFigurePreview,
    scrollToHeading,
    clearPaperFigureState
  }
}
