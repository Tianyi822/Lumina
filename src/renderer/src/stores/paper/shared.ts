import type { OcrProgressInfo, PaperStatus } from '@shared/types/paper'
import type { PageInfo } from '@renderer/composables/usePdfPageRasterizer'

export interface RenderingProgress {
  currentPage: number
  totalPages: number
  completedPages: number
  stage: 'idle' | 'selecting' | 'loading' | 'rendering' | 'completed' | 'failed'
  error?: string
}

export interface RenderPipelineContext {
  paperId: string
  pageInfos: PageInfo[]
  rasterizer: {
    loadPdf(data: ArrayBuffer): Promise<PageInfo[]>
    renderPage(
      pageIndex: number,
      scale: number
    ): Promise<{ base64: string; width: number; height: number }>
    dispose(): void
  }
}

export interface PipelineControl {
  aborted: boolean
  deleted: boolean
}

export interface PaperTranslationTaskState {
  isRunning: boolean
  completedSegments: number
  totalSegments: number
  lastError?: string
}

export interface PaperFigurePreviewRect {
  left: number
  top: number
  width: number
}

const READABLE_PAPER_STATUS: PaperStatus = 'completed'

export function isPaperReadableStatus(status: PaperStatus): boolean {
  return status === READABLE_PAPER_STATUS
}

export function createIdleOcrProgress(paperId: string, totalPages: number): OcrProgressInfo {
  return {
    paperId,
    currentPage: 0,
    totalPages,
    completedPages: 0,
    failedPages: [],
    status: 'idle'
  }
}

export function createIdleTranslationTaskState(): PaperTranslationTaskState {
  return {
    isRunning: false,
    completedSegments: 0,
    totalSegments: 0
  }
}

export function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)

  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index)
  }

  return bytes.buffer as ArrayBuffer
}

export function createDefaultFigurePreviewRect(): PaperFigurePreviewRect {
  const width = 420
  const left = typeof window === 'undefined' ? 32 : Math.max(window.innerWidth - width - 32, 32)

  return {
    left,
    top: 88,
    width
  }
}
