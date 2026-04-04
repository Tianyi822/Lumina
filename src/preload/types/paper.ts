import type { PaperDocument, PaperStatus } from '@shared/types/paper'
import type { OcrProviderId } from '@shared/types/config'

/**
 * 论文相关的 Preload API 类型
 */
export interface PaperApi {
  /** 创建论文记录 */
  create: (params: { sourcePdfPath: string; pageCount: number }) => Promise<{
    success: boolean
    data?: PaperDocument
    error?: string
  }>

  /** 获取论文列表 */
  list: () => Promise<{
    success: boolean
    data?: PaperDocument[]
    error?: string
  }>

  /** 获取论文详情 */
  get: (paperId: string) => Promise<{
    success: boolean
    data?: PaperDocument
    error?: string
  }>

  /** 删除论文及其所有数据 */
  delete: (paperId: string) => Promise<{
    success: boolean
    error?: string
  }>

  /** 获取合并后的 Markdown */
  getMergedMd: (paperId: string) => Promise<{
    success: boolean
    data?: string
    error?: string
  }>

  /** 保存编辑后的 Markdown */
  saveMergedMd: (params: { paperId: string; content: string }) => Promise<{
    success: boolean
    error?: string
  }>

  /** 选择 PDF 文件（弹出系统文件选择对话框） */
  selectPdfFile: () => Promise<{
    path: string
    name: string
    size: number
  } | null>

  /** 上传 PDF 并创建论文记录 */
  uploadPdf: (params: { sourcePdfPath: string; pageCount: number }) => Promise<{
    success: boolean
    data?: PaperDocument
    error?: string
  }>

  /** 保存单页图片（base64，不含前缀） */
  savePageImage: (params: {
    paperId: string
    pageIndex: number
    base64Data: string
    imageWidth: number
    imageHeight: number
    sourceWidth?: number
    sourceHeight?: number
    renderScale: number
  }) => Promise<{
    success: boolean
    error?: string
  }>

  /** 获取指定页图片（返回 base64 字符串） */
  getPageImage: (params: { paperId: string; pageIndex: number }) => Promise<{
    success: boolean
    data?: string
    error?: string
  }>

  /** 更新论文状态 */
  updateStatus: (params: {
    paperId: string
    status: PaperStatus
    errorMessage?: string
  }) => Promise<{
    success: boolean
    data?: PaperDocument
    error?: string
  }>

  testOcrConnection: (params: { provider: OcrProviderId; apiKey: string }) => Promise<{
    success: boolean
    error?: string
  }>
}
