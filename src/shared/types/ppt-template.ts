/**
 * PPT 模板相关的类型定义
 * 用于模板上传、存储和结构分析
 */

// ==================== 模板状态 ====================

/** 模板分析状态 */
export type PptTemplateStatus = 'analyzing' | 'summarizing' | 'completed' | 'failed'

/** AI 总结错误信息 */
export interface SummaryError {
  /** 错误消息 */
  message: string
  /** 错误时间 */
  timestamp: string
}

// ==================== 模板元数据 ====================

/** 模板列表项 - 用于 templates.json 索引 */
export interface PptTemplateListItem {
  /** 模板的唯一标识 */
  id: string
  /** 模板名称（用户指定或默认生成） */
  name: string
  /** 原始文件名 */
  originalFileName: string
  /** 文件大小，单位字节 */
  fileSize: number
  /** 幻灯片页数 */
  slideCount: number
  /** 创建时间 */
  createdAt: string
  /** 分析器版本 */
  analysisVersion: string
  /** 分析状态 */
  status: PptTemplateStatus
  /** AI 总结错误 */
  summaryError?: SummaryError
  /** AI 总结完成时间 */
  summaryCompletedAt?: string
}

/** 已选中的 PPT 模板引用 */
export interface SelectedPptTemplate {
  /** 模板 ID */
  id: string
  /** 模板名称 */
  name: string
}

// ==================== 创建模板 ====================

/** 创建模板请求 */
export interface CreatePptTemplateRequest {
  /** 模板名称（可选，默认为"模板-{文件名}"） */
  name?: string
}

/** 创建模板结果 */
export interface CreatePptTemplateResult {
  /** 是否成功 */
  success: boolean
  /** 创建成功的模板数据 */
  data?: PptTemplateListItem
  /** 错误信息 */
  error?: string
}

// ==================== 分析结果 ====================

/** 元素来源 */
export type PptElementSource = 'slide' | 'layout' | 'master'

/** 元素类型 */
export type PptElementKind =
  | 'text'
  | 'placeholder'
  | 'image'
  | 'table'
  | 'chart'
  | 'shape'
  | 'group'
  | 'connector'
  | 'diagram'
  | 'unknown'

/** 文本段落 */
export interface PptTextParagraph {
  /** 段落文本 */
  text: string
  /** 段落级别 */
  level?: number
}

/** 文本块信息 */
export interface PptTextContent {
  /** 段落列表 */
  paragraphs: PptTextParagraph[]
  /** 纯文本（所有段落合并） */
  plainText: string
}

/** 形状几何信息 */
export interface PptShapeGeometry {
  /** 预设几何类型（如 rect, ellipse 等） */
  preset?: string
  /** 填充颜色 */
  fillColor?: string
  /** 边框颜色 */
  strokeColor?: string
  /** 边框宽度 */
  strokeWidth?: number
}

/** 图片信息 */
export interface PptImageContent {
  /** 关系目标（r:embed） */
  relationshipTarget?: string
  /** 文件名 */
  fileName?: string
  /** 像素宽度 */
  pixelWidth?: number
  /** 像素高度 */
  pixelHeight?: number
}

/** 表格单元格 */
export interface PptTableCell {
  /** 行索引 */
  rowIndex: number
  /** 列索引 */
  colIndex: number
  /** 单元格文本 */
  text: string
}

/** 表格信息 */
export interface PptTableContent {
  /** 行数 */
  rows: number
  /** 列数 */
  columns: number
  /** 单元格列表 */
  cells: PptTableCell[]
}

/** 图表信息 */
export interface PptChartContent {
  /** 关系目标 */
  relationshipTarget?: string
  /** 图表类型 */
  chartType?: string
}

/** 占位符信息 */
export interface PptPlaceholderInfo {
  /** 占位符类型 */
  type?: string
  /** 占位符索引 */
  idx?: number
}

/** 元素分析结果 */
export interface PptTemplateElementAnalysis {
  /** 元素来源 */
  source: PptElementSource
  /** 元素类型 */
  kind: PptElementKind
  /** 元素名称 */
  name?: string
  /** 占位符信息 */
  placeholder?: PptPlaceholderInfo
  /** 位置 X（EMU） */
  x: number
  /** 位置 Y（EMU） */
  y: number
  /** 宽度（EMU） */
  cx: number
  /** 高度（EMU） */
  cy: number
  /** 层级 */
  zIndex: number
  /** 文本内容（kind 为 text 或 placeholder 时） */
  text?: PptTextContent
  /** 形状几何（kind 为 shape 时） */
  shape?: PptShapeGeometry
  /** 图片信息（kind 为 image 时） */
  image?: PptImageContent
  /** 表格信息（kind 为 table 时） */
  table?: PptTableContent
  /** 图表信息（kind 为 chart 时） */
  chart?: PptChartContent
}

/** 背景信息 */
export interface PptSlideBackground {
  /** 背景类型 */
  type?: 'solid' | 'gradient' | 'image' | 'pattern'
  /** 背景颜色 */
  color?: string
  /** 背景图片路径 */
  imagePath?: string
}

/** 幻灯片分析结果 */
export interface PptTemplateSlideAnalysis {
  /** 幻灯片索引（从 0 开始） */
  slideIndex: number
  /** 标题 */
  title?: string
  /** 备注文本 */
  notesText?: string
  /** 布局名称 */
  layoutName?: string
  /** 母版名称 */
  masterName?: string
  /** 背景 */
  background?: PptSlideBackground
  /** 元素列表 */
  elements: PptTemplateElementAnalysis[]
  /** 纯文本（所有文本元素合并） */
  plainText: string
}

/** 源文件信息 */
export interface PptTemplateSource {
  /** 原始文件名 */
  originalFileName: string
  /** 文件大小（字节） */
  fileSize: number
  /** 上传时间 */
  uploadedAt: string
  /** 文件哈希（用于去重） */
  hash?: string
}

/** 演示文稿概览 */
export interface PptPresentationOverview {
  /** 页数 */
  slideCount: number
  /** 幻灯片宽度（EMU） */
  slideWidth: number
  /** 幻灯片高度（EMU） */
  slideHeight: number
  /** 主题名称 */
  themeName?: string
  /** 母版数量 */
  masterCount?: number
  /** 布局数量 */
  layoutCount?: number
}

/** 完整的模板分析结果 - 用于 analysis.json */
export interface PptTemplateAnalysis {
  /** Schema 版本 */
  schemaVersion: string
  /** 模板 ID */
  templateId: string
  /** 模板名称 */
  templateName: string
  /** 源文件信息 */
  source: PptTemplateSource
  /** 演示文稿概览 */
  presentation: PptPresentationOverview
  /** 幻灯片分析列表 */
  slides: PptTemplateSlideAnalysis[]
}

// ==================== AI 总结 ====================

/** 单页总结 */
export interface PptSlideSummary {
  /** 幻灯片索引（从 0 开始） */
  slideIndex: number
  /** 页面类型 */
  pageType: string
  /** 页面用途 */
  purpose: string
  /** 关键信息 */
  keyPoints: string[]
  /** 设计说明 */
  designNotes?: string
}

/** PPT 模板 AI 总结 */
export interface PptTemplateAiSummary {
  /** Schema 版本 */
  schemaVersion: '1.0'
  /** 模板 ID */
  templateId: string
  /** 生成时间 */
  generatedAt: string
  /** 模型名称 */
  modelName: string
  /** 总体总结 */
  overallSummary: {
    /** 风格描述 */
    style: string
    /** 适用场景 */
    useCases: string[]
    /** 设计亮点 */
    designHighlights: string[]
    /** 内容编写建议 */
    contentGuidelines: string
  }
  /** 分页总结 */
  slideSummaries: PptSlideSummary[]
}

// ==================== API 响应 ====================

/** 模板列表响应 */
export interface PptTemplateListResponse {
  /** 是否成功 */
  success: boolean
  /** 模板列表 */
  data?: PptTemplateListItem[]
  /** 错误信息 */
  error?: string
}
