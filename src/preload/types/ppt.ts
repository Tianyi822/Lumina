import type { IpcRendererEvent } from 'electron'

/**
 * PPT 模板分析状态
 */
export type PptTemplateStatus = 'analyzing' | 'summarizing' | 'completed' | 'failed'

/**
 * AI 总结错误信息
 */
export interface SummaryError {
  message: string
  timestamp: string
}

/**
 * PPT 模板列表项
 */
export interface PptTemplateListItem {
  id: string
  name: string
  originalFileName: string
  fileSize: number
  slideCount: number
  createdAt: string
  analysisVersion: string
  status: PptTemplateStatus
  summaryError?: SummaryError
  summaryCompletedAt?: string
}

/**
 * 已选中的 PPT 模板
 */
export interface SelectedPptTemplate {
  id: string
  name: string
}

/**
 * PPT 模板列表响应
 */
export interface PptTemplateListResponse {
  success: boolean
  data?: PptTemplateListItem[]
  error?: string
}

/**
 * 创建 PPT 模板请求
 */
export interface CreatePptTemplateRequest {
  name?: string
}

/**
 * 创建 PPT 模板结果
 */
export interface CreatePptTemplateResult {
  success: boolean
  data?: PptTemplateListItem
  error?: string
}

/**
 * 单页 AI 总结
 */
export interface PptSlideSummary {
  slideIndex: number
  pageType: string
  purpose: string
  keyPoints: string[]
  designNotes?: string
}

/**
 * PPT 模板 AI 总结
 */
export interface PptTemplateAiSummary {
  schemaVersion: '1.0'
  templateId: string
  generatedAt: string
  modelName: string
  overallSummary: {
    style: string
    useCases: string[]
    designHighlights: string[]
    contentGuidelines: string
  }
  slideSummaries: PptSlideSummary[]
}

/**
 * PPT 模板 API
 */
export interface PptTemplateApi {
  list: () => Promise<PptTemplateListResponse>
  getById: (id: string) => Promise<{ success: boolean; data?: PptTemplateListItem; error?: string }>
  getAnalysis: (id: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
  getAiSummary: (
    id: string
  ) => Promise<{ success: boolean; data?: PptTemplateAiSummary | null; error?: string }>
  getSourceData: (
    id: string
  ) => Promise<{ success: boolean; data?: { data: number[] }; error?: string }>
  getFirstSlidePreview: (id: string) => Promise<{ success: boolean; data?: string; error?: string }>
  create: (file: File, name?: string) => Promise<CreatePptTemplateResult>
  delete: (templateId: string) => Promise<{ success: boolean; error?: string }>
  retrySummary: (templateId: string) => Promise<{ success: boolean; error?: string }>
}

/**
 * PPT 样式配置
 */
export interface PptStyleConfig {
  primaryColor?: string
  backgroundColor?: string
  titleFont?: string
  bodyFont?: string
  titleSize?: number
  bodySize?: number
}

/**
 * PPT 导出页面预览
 */
export interface PptExportSlidePreview {
  index: number
  title?: string
  contentType: 'title' | 'content' | 'table' | 'list' | 'mixed'
  summary: string
  previewImageDataUrl?: string
  selected: boolean
}

/**
 * 样式来源类型（仅支持模板）
 */
export type PptStyleSource = { type: 'template'; templateId: string }

/**
 * 幻灯片位置
 */
export interface SlidePosition {
  x: number
  y: number
  w: number | string
  h: number | string
}

/**
 * 模板幻灯片布局
 */
export interface TemplateSlideLayout {
  name: string
  backgroundColor?: string
  titlePosition?: SlidePosition
  contentPosition?: SlidePosition
}

/**
 * PPT 幻灯片尺寸
 */
export interface PptSlideSize {
  width: number
  height: number
}

/**
 * 模板样式提取结果
 */
export interface TemplateStyleExtraction {
  success: boolean
  style?: PptStyleConfig
  layouts?: TemplateSlideLayout[]
  slideSize?: PptSlideSize
  error?: string
}

/**
 * PPT 导出配置
 */
export interface PptExportConfig {
  slides: PptExportSlidePreview[]
  styleSource: PptStyleSource
  style: PptStyleConfig
  templateLayouts?: TemplateSlideLayout[]
  slideSize?: PptSlideSize
}

/**
 * PPT 导出预览请求
 */
export interface PreviewPptExportRequest {
  content: string
  templateId?: string
}

/**
 * PPT 导出预览结果
 */
export interface PreviewPptExportResult {
  success: boolean
  config?: PptExportConfig
  availableTemplates?: PptTemplateListItem[]
  warning?: string
  error?: string
}

/**
 * 生成 PPT 请求
 */
export interface GeneratePptRequest {
  content: string
  config: PptExportConfig
  title?: string
}

/**
 * 生成 PPT 结果
 */
export interface GeneratePptResult {
  success: boolean
  data?: number[]
  fileName?: string
  error?: string
}

/**
 * PPT 导出 API
 */
export interface PptExportApi {
  getConfig: () => Promise<{
    success: boolean
    configured: boolean
    config: {
      accessKeyId: string
      accessKeySecret: string
      workspaceId: string
    }
    error?: string
  }>
  saveConfig: (config: {
    accessKeyId: string
    accessKeySecret: string
    workspaceId: string
  }) => Promise<{ success: boolean; error?: string }>
  testConfig: (config: {
    accessKeyId: string
    accessKeySecret: string
    workspaceId: string
  }) => Promise<{ success: boolean; error?: string }>
  generateOutline: (
    prompt: string,
    sessionId: string
  ) => Promise<{ success: boolean; taskId?: string; outline?: string; error?: string }>
  onOutlineChunk: (
    callback: (event: IpcRendererEvent, data: { sessionId: string; text: string }) => void
  ) => () => void
  onOutlineDone: (
    callback: (
      event: IpcRendererEvent,
      data: { sessionId: string; taskId: string; outline: string }
    ) => void
  ) => () => void
  onOutlineError: (
    callback: (event: IpcRendererEvent, data: { sessionId: string; error: string }) => void
  ) => () => void
  removeOutlineListeners: () => void
  initiateCreation: (
    taskId: string,
    outline: string
  ) => Promise<{ success: boolean; appkey?: string; code?: string; error?: string }>
  bindArtifact: (
    taskId: string,
    artifactId: number
  ) => Promise<{ success: boolean; error?: string }>
}
