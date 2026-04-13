import type { OcrProviderId } from '@shared/types/config'
import type {
  CreatePaperAnnotationPayload,
  OcrProgressInfo,
  PaperAnnotation,
  PaperDocument,
  PaperFigureItem,
  PaperReaderDocument,
  UpdatePaperAnnotationPayload,
  ReanchorPaperAnnotationPayload,
  PaperStatus,
  PaperTranslationProgress,
  PaperTranslationState
} from '@shared/types/paper'

export type {
  BlockLabel,
  CreatePaperAnnotationPayload,
  LegacyPaperAnnotation,
  OcrProgressInfo,
  PaperAnnotation,
  PaperDocument,
  PaperFigureItem,
  PaperLayoutBlock,
  PaperPageAsset,
  PaperPageOcrResult,
  PaperReaderDocument,
  PaperReaderSegment,
  PaperReaderSegmentSourceRefs,
  PaperReaderSourcePosition,
  UpdatePaperAnnotationPayload,
  ReanchorPaperAnnotationPayload,
  PaperStatus,
  PaperAnnotationNoteType,
  PaperAnnotationRecoveryMeta,
  PaperAnnotationSemanticAnchor,
  PaperAnnotationStatus,
  PaperAnnotationTextAnchor,
  PaperAnnotationTranslationAnchor,
  PaperAnnotationView,
  PaperAnnotationStore,
  PaperTocEntry,
  PaperTocItem,
  PaperTocOutline,
  PaperTranslationEntry,
  PaperTranslationProgress,
  PaperTranslationSegment,
  PaperTranslationSegmentKind,
  PaperTranslationState,
  PaperTranslationStatus
} from '@shared/types/paper'

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

  /** 获取阅读版 Markdown（正文已去图） */
  getReaderMarkdown: (paperId: string) => Promise<{
    success: boolean
    data?: string
    error?: string
  }>

  /** 获取阅读器权威文档结构 */
  getReaderDocument: (paperId: string) => Promise<{
    success: boolean
    data?: PaperReaderDocument
    error?: string
  }>

  /** 获取论文图片列表 */
  listFigures: (paperId: string) => Promise<{
    success: boolean
    data?: PaperFigureItem[]
    error?: string
  }>

  /** 获取论文批注列表 */
  listAnnotations: (paperId: string) => Promise<{
    success: boolean
    data?: PaperAnnotation[]
    error?: string
  }>

  /** 创建论文批注 */
  createAnnotation: (params: CreatePaperAnnotationPayload) => Promise<{
    success: boolean
    data?: PaperAnnotation
    error?: string
  }>

  /** 重新绑定论文批注 */
  reanchorAnnotation: (params: ReanchorPaperAnnotationPayload) => Promise<{
    success: boolean
    data?: PaperAnnotation
    error?: string
  }>

  /** 更新论文批注 */
  updateAnnotation: (params: UpdatePaperAnnotationPayload) => Promise<{
    success: boolean
    data?: PaperAnnotation
    error?: string
  }>

  /** 删除论文批注 */
  deleteAnnotation: (params: { paperId: string; annotationId: string }) => Promise<{
    success: boolean
    data?: PaperAnnotation[]
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

  /** 读取本地文件内容为 base64 字符串 */
  readFileAsBase64: (filePath: string) => Promise<{
    success: boolean
    data?: string
    error?: string
  }>

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

  startOcr: (paperId: string) => Promise<{
    success: boolean
    error?: string
  }>

  cancelOcr: (paperId: string) => Promise<{
    success: boolean
  }>

  getOcrProgress: (paperId: string) => Promise<{
    success: boolean
    data?: OcrProgressInfo
  }>

  retryPage: (params: { paperId: string; pageIndex: number }) => Promise<{
    success: boolean
    error?: string
  }>

  onOcrProgress: (callback: (progress: OcrProgressInfo) => void) => () => void

  /** 获取翻译状态 */
  getTranslationState: (paperId: string) => Promise<{
    success: boolean
    data?: PaperTranslationState
    error?: string
  }>

  /** 查询论文是否已有完整翻译 */
  listTranslationStatus: (paperIds: string[]) => Promise<{
    success: boolean
    data?: Record<string, boolean>
    error?: string
  }>

  /** 删除论文翻译缓存 */
  deleteTranslation: (paperId: string) => Promise<{
    success: boolean
    error?: string
  }>

  /** 启动或继续翻译 */
  startTranslation: (paperId: string) => Promise<{
    success: boolean
    alreadyRunning?: boolean
    error?: string
  }>

  /** 监听翻译进度 */
  onTranslationProgress: (callback: (progress: PaperTranslationProgress) => void) => () => void
}
