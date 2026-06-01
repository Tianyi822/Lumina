import { ipcRenderer } from 'electron'
import type {
  CreatePaperAnnotationPayload,
  PaperAnnotation,
  PaperAnnotationAffectedKnowledgeBase,
  PaperDocument,
  PaperFigureItem,
  PaperReaderDocument,
  UpdatePaperAnnotationPayload,
  PaperStatus,
  PaperTranslationProgress,
  PaperTranslationProgressBatch,
  PaperTranslationSummary,
  PaperTranslationState
} from '@shared/types/paper'
import type { OcrProviderId } from '@shared/types/config'

export interface OcrProgressInfo {
  paperId: string
  currentPage: number
  totalPages: number
  completedPages: number
  failedPages: number[]
  status: 'idle' | 'processing' | 'completed' | 'partial_failed' | 'failed' | 'cancelled'
  errorMessage?: string
}

/**
 * 创建论文的结果
 */
export interface CreatePaperResult {
  success: boolean
  data?: PaperDocument
  error?: string
}

/**
 * 论文列表结果
 */
export interface PaperListResult {
  success: boolean
  data?: PaperDocument[]
  error?: string
}

/**
 * 论文详情结果
 */
export interface PaperGetResult {
  success: boolean
  data?: PaperDocument
  error?: string
}

/**
 * 删除论文结果
 */
export interface DeletePaperResult {
  success: boolean
  error?: string
}

/**
 * Markdown 内容结果
 */
export interface MergedMdResult {
  success: boolean
  data?: string
  error?: string
}

/**
 * 保存 Markdown 结果
 */
export interface SaveMdResult {
  success: boolean
  error?: string
}

/**
 * PDF 文件选择结果
 */
export interface PdfFileInfo {
  path: string
  name: string
  size: number
}

/**
 * 页图保存结果
 */
export interface PageImageResult {
  success: boolean
  error?: string
}

/**
 * 页图读取结果
 */
export interface PageImageReadResult {
  success: boolean
  data?: string
  error?: string
}

/**
 * 论文状态更新结果
 */
export interface PaperStatusUpdateResult {
  success: boolean
  data?: PaperDocument
  error?: string
}

/**
 * 论文相关的 API
 */
export const paperApi = {
  /**
   * 创建论文记录
   */
  create: (params: { sourcePdfPath: string; pageCount: number }): Promise<CreatePaperResult> => {
    return ipcRenderer.invoke('paper:create', params)
  },

  /**
   * 获取论文列表
   */
  list: (): Promise<PaperListResult> => {
    return ipcRenderer.invoke('paper:list')
  },

  /**
   * 获取论文详情
   */
  get: (paperId: string): Promise<PaperGetResult> => {
    return ipcRenderer.invoke('paper:get', paperId)
  },

  setChatSession: (params: {
    paperId: string
    sessionId: string
  }): Promise<PaperStatusUpdateResult> => {
    return ipcRenderer.invoke('paper:setChatSession', params)
  },

  saveReadingProgress: (params: {
    paperId: string
    scrollPercentOriginal?: number
    scrollPercentTranslated?: number
    zoomLevel: number
    translationVisible: boolean
  }): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('paper:saveReadingProgress', params)
  },

  /**
   * 删除论文及其所有数据
   */
  delete: (paperId: string): Promise<DeletePaperResult> => {
    return ipcRenderer.invoke('paper:delete', paperId)
  },

  /**
   * 获取合并后的 Markdown
   */
  getMergedMd: (paperId: string): Promise<MergedMdResult> => {
    return ipcRenderer.invoke('paper:getMergedMd', paperId)
  },

  /**
   * 获取阅读版 Markdown（正文已去图）
   */
  getReaderMarkdown: (paperId: string): Promise<MergedMdResult> => {
    return ipcRenderer.invoke('paper:getReaderMarkdown', paperId)
  },

  /**
   * 获取阅读器权威文档结构
   */
  getReaderDocument: (
    paperId: string
  ): Promise<{ success: boolean; data?: PaperReaderDocument; error?: string }> => {
    return ipcRenderer.invoke('paper:getReaderDocument', paperId)
  },

  /**
   * 获取论文图片列表
   */
  listFigures: (
    paperId: string
  ): Promise<{ success: boolean; data?: PaperFigureItem[]; error?: string }> => {
    return ipcRenderer.invoke('paper:listFigures', paperId)
  },

  /**
   * 获取论文批注列表
   */
  listAnnotations: (
    paperId: string
  ): Promise<{ success: boolean; data?: PaperAnnotation[]; error?: string }> => {
    return ipcRenderer.invoke('paper:listAnnotations', paperId)
  },

  /**
   * 创建论文批注
   */
  createAnnotation: (
    params: CreatePaperAnnotationPayload
  ): Promise<{ success: boolean; data?: PaperAnnotation; error?: string }> => {
    return ipcRenderer.invoke('paper:createAnnotation', params)
  },

  /**
   * 更新论文批注
   */
  updateAnnotation: (
    params: UpdatePaperAnnotationPayload
  ): Promise<{
    success: boolean
    data?: PaperAnnotation
    affectedKnowledgeBases?: PaperAnnotationAffectedKnowledgeBase[]
    error?: string
  }> => {
    return ipcRenderer.invoke('paper:updateAnnotation', params)
  },

  /**
   * 删除论文批注
   */
  deleteAnnotation: (params: {
    paperId: string
    annotationId: string
  }): Promise<{ success: boolean; data?: PaperAnnotation[]; error?: string }> => {
    return ipcRenderer.invoke('paper:deleteAnnotation', params)
  },

  /**
   * 保存编辑后的 Markdown
   */
  saveMergedMd: (params: { paperId: string; content: string }): Promise<SaveMdResult> => {
    return ipcRenderer.invoke('paper:saveMergedMd', params)
  },

  /**
   * 选择 PDF 文件（弹出系统文件选择对话框）
   */
  selectPdfFile: (): Promise<PdfFileInfo | null> => {
    return ipcRenderer.invoke('paper:selectPdfFile')
  },

  /**
   * 读取本地文件内容为 base64 字符串
   */
  readFileAsBase64: (
    filePath: string
  ): Promise<{ success: boolean; data?: string; error?: string }> => {
    return ipcRenderer.invoke('paper:readFileAsBase64', filePath)
  },

  /**
   * 上传 PDF 并创建论文记录
   */
  uploadPdf: (params: { sourcePdfPath: string; pageCount: number }): Promise<CreatePaperResult> => {
    return ipcRenderer.invoke('paper:uploadPdf', params)
  },

  /**
   * 保存单页图片（base64，不含前缀）
   */
  savePageImage: (params: {
    paperId: string
    pageIndex: number
    base64Data: string
    imageWidth: number
    imageHeight: number
    sourceWidth?: number
    sourceHeight?: number
    renderScale: number
  }): Promise<PageImageResult> => {
    return ipcRenderer.invoke('paper:savePageImage', params)
  },

  /**
   * 获取指定页图片（返回 base64 字符串）
   */
  getPageImage: (params: { paperId: string; pageIndex: number }): Promise<PageImageReadResult> => {
    return ipcRenderer.invoke('paper:getPageImage', params)
  },

  /**
   * 更新论文状态
   */
  updateStatus: (params: {
    paperId: string
    status: PaperStatus
    errorMessage?: string
  }): Promise<PaperStatusUpdateResult> => {
    return ipcRenderer.invoke('paper:updateStatus', params)
  },

  testOcrConnection: (params: {
    provider: OcrProviderId
    apiKey: string
  }): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('paper:testOcrConnection', params)
  },

  startOcr: (paperId: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('paper:startOcr', paperId)
  },

  cancelOcr: (paperId: string): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('paper:cancelOcr', paperId)
  },

  getOcrProgress: (paperId: string): Promise<{ success: boolean; data?: OcrProgressInfo }> => {
    return ipcRenderer.invoke('paper:getOcrProgress', paperId)
  },

  isOcrActive: (paperId: string): Promise<{ success: boolean; data?: boolean }> => {
    return ipcRenderer.invoke('paper:isOcrActive', paperId)
  },

  retryPage: (params: {
    paperId: string
    pageIndex: number
  }): Promise<{
    success: boolean
    error?: string
  }> => {
    return ipcRenderer.invoke('paper:retryPage', params)
  },

  onOcrProgress: (callback: (progress: OcrProgressInfo) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: OcrProgressInfo): void => {
      callback(progress)
    }
    ipcRenderer.on('paper:ocrProgress', handler)
    return () => {
      ipcRenderer.removeListener('paper:ocrProgress', handler)
    }
  },

  getTranslationState: (
    paperId: string
  ): Promise<{ success: boolean; data?: PaperTranslationState; error?: string }> => {
    return ipcRenderer.invoke('paper:getTranslationState', paperId)
  },

  listTranslationStatus: (
    paperIds: string[]
  ): Promise<{ success: boolean; data?: Record<string, boolean>; error?: string }> => {
    return ipcRenderer.invoke('paper:listTranslationStatus', paperIds)
  },

  listTranslationSummaries: (
    paperIds: string[]
  ): Promise<{
    success: boolean
    data?: Record<string, PaperTranslationSummary>
    error?: string
  }> => {
    return ipcRenderer.invoke('paper:listTranslationSummaries', paperIds)
  },

  deleteTranslation: (paperId: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('paper:deleteTranslation', paperId)
  },

  startTranslation: (
    paperId: string
  ): Promise<{ success: boolean; alreadyRunning?: boolean; error?: string }> => {
    return ipcRenderer.invoke('paper:startTranslation', { paperId })
  },

  retranslateSegment: (params: {
    paperId: string
    segmentId: string
  }): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('paper:retranslateSegment', params)
  },

  onTranslationProgress: (callback: (progress: PaperTranslationProgress) => void): (() => void) => {
    void ipcRenderer.invoke('paper:subscribeTranslationProgress')
    const handler = (
      _event: Electron.IpcRendererEvent,
      progress: PaperTranslationProgress
    ): void => {
      callback(progress)
    }
    ipcRenderer.on('paper:translationProgress', handler)
    return () => {
      ipcRenderer.removeListener('paper:translationProgress', handler)
      void ipcRenderer.invoke('paper:unsubscribeTranslationProgress')
    }
  },

  onTranslationProgressBatch: (
    callback: (batch: PaperTranslationProgressBatch) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      batch: PaperTranslationProgressBatch
    ): void => {
      callback(batch)
    }
    ipcRenderer.on('paper:translationProgressBatch', handler)
    return () => {
      ipcRenderer.removeListener('paper:translationProgressBatch', handler)
    }
  }
}
