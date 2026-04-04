import { ipcRenderer } from 'electron'
import type { PaperDocument, PaperStatus } from '@shared/types/paper'
import type { OcrProviderId } from '@shared/types/config'

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
  }
}
