/**
 * 论文状态
 */
export type PaperStatus =
  | 'draft'
  | 'rendering'
  | 'ocr_processing'
  | 'completed'
  | 'partial_failed'
  | 'failed'

/**
 * OCR 进度信息
 * 跨进程共享，主进程通过 IPC 推送实时进度
 */
export interface OcrProgressInfo {
  /** 关联的论文 ID */
  paperId: string
  /** 当前正在处理的页码（从 0 开始） */
  currentPage: number
  /** 总页数 */
  totalPages: number
  /** 已完成处理的页数 */
  completedPages: number
  /** 失败的页码列表 */
  failedPages: number[]
  /** 当前状态 */
  status: 'idle' | 'processing' | 'completed' | 'partial_failed' | 'failed' | 'cancelled'
  /** 错误信息（可选） */
  errorMessage?: string
}

/**
 * 布局块标签
 */
export type BlockLabel = 'text' | 'image' | 'table' | 'formula'

/**
 * 论文文档元信息
 */
export interface PaperDocument {
  /** 论文唯一标识（UUID v4） */
  id: string
  /** 原始文件名 */
  fileName: string
  /** 本地 PDF 文件路径 */
  filePath: string
  /** 文件 hash（用于去重） */
  fileHash: string
  /** 文件大小（字节） */
  fileSize: number
  /** 总页数 */
  pageCount: number
  /** 当前状态 */
  status: PaperStatus
  /** 创建时间 */
  createdAt: string
  /** 最后更新时间 */
  updatedAt: string
  /** 最后打开时间 */
  lastOpenedAt: string
  /** OCR 服务提供商 */
  ocrProvider: string
  /** OCR 使用的模型 */
  ocrModel: string
  /** 已完成 OCR 的页数 */
  completedPageCount: number
  /** 已持久化的页面图片资源 */
  pageAssets?: PaperPageAsset[]
  /** 错误信息（可选） */
  errorMessage?: string
}

/**
 * 论文页面图片资源信息
 */
export interface PaperPageAsset {
  /** 所属论文 ID */
  paperId: string
  /** 页码（从 0 开始） */
  pageIndex: number
  /** 图片本地路径 */
  imagePath: string
  /** 图片 MIME 类型 */
  imageMimeType: string
  /** 图片宽度 */
  imageWidth: number
  /** 图片高度 */
  imageHeight: number
  /** PDF 原始页宽度（scale=1.0） */
  sourceWidth?: number
  /** PDF 原始页高度（scale=1.0） */
  sourceHeight?: number
  /** 渲染时使用的缩放比例 */
  renderScale: number
  /** base64 数据大小（字节） */
  base64Size: number
}

/**
 * 布局块信息
 */
export interface PaperLayoutBlock {
  /** 块在页面中的索引 */
  index: number
  /** 所属页码 */
  pageIndex: number
  /** 块类型标签 */
  label: BlockLabel
  /** 块的内容文本 */
  content: string
  /** 边界框坐标 */
  bbox: { x: number; y: number; width: number; height: number }
  /** 归一化边界框（0-1 范围） */
  normalizedBbox?: { x: number; y: number; width: number; height: number }
  /** 像素边界框 */
  pixelBbox?: { x: number; y: number; width: number; height: number }
  /** 块宽度 */
  width: number
  /** 块高度 */
  height: number
  /** 本地资源路径（图片/表格等） */
  localAssetPath?: string
  /** 远程资源 URL */
  remoteAssetUrl?: string
}

/**
 * 单页 OCR 结果
 */
export interface PaperPageOcrResult {
  /** 所属论文 ID */
  paperId: string
  /** 页码 */
  pageIndex: number
  /** 页面 Markdown 内容 */
  markdown: string
  /** 布局块列表 */
  blocks: PaperLayoutBlock[]
  /** Token 使用量 */
  usage?: { total_tokens?: number }
  /** 请求 ID */
  requestId?: string
  /** 任务 ID */
  taskId?: string
  /** 处理状态 */
  status: 'pending' | 'processing' | 'completed' | 'failed'
  /** 错误信息（可选） */
  errorMessage?: string
}

/**
 * 论文图片项
 */
export interface PaperFigureItem {
  /** 图片项唯一标识 */
  id: string
  /** 所属论文 ID */
  paperId: string
  /** 页码 */
  pageIndex: number
  /** 块索引 */
  blockIndex: number
  /** 图片所属分组 ID */
  groupId: string
  /** 图片资源本地路径（绝对路径，位于论文目录 assets/page-* 下） */
  imagePath: string
  /** 图片对应的主图注 */
  caption: string
  /** 图片对应的子图注（可选） */
  subCaption?: string
  /** 图片边界框 */
  bbox: { x: number; y: number; width: number; height: number }
}

/**
 * 论文批注信息
 */
export interface PaperAnnotation {
  /** 批注唯一标识 */
  id: string
  /** 所属论文 ID */
  paperId: string
  /** 页码 */
  pageIndex: number
  /** 块索引 */
  blockIndex: number
  /** 选中文本起始偏移 */
  startOffset: number
  /** 选中文本结束偏移 */
  endOffset: number
  /** 选中的文本内容 */
  selectedText: string
  /** 批注内容 */
  comment: string
  /** 高亮颜色 */
  color: string
  /** 创建时间 */
  createdAt: string
  /** 最后更新时间 */
  updatedAt: string
}

/**
 * 论文翻译段落类型
 */
export type PaperTranslationSegmentKind =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'quote'
  | 'table'
  | 'code'

/**
 * 论文翻译段落状态
 */
export type PaperTranslationStatus = 'queued' | 'translating' | 'completed' | 'failed' | 'skipped'

/**
 * 可翻译段落信息
 */
export interface PaperTranslationSegment {
  /** 段落唯一标识 */
  id: string
  /** 段落顺序 */
  index: number
  /** 段落类型 */
  kind: PaperTranslationSegmentKind
  /** 原始 Markdown 内容 */
  originalMarkdown: string
  /** 去除大部分标记后的纯文本 */
  originalText: string
}

/**
 * 单段翻译结果
 */
export interface PaperTranslationEntry extends PaperTranslationSegment {
  /** 当前翻译状态 */
  status: PaperTranslationStatus
  /** 翻译后的 Markdown */
  translatedMarkdown?: string
  /** 翻译后的纯文本 */
  translatedText?: string
  /** 错误信息 */
  errorMessage?: string
  /** 最后更新时间 */
  updatedAt?: string
}

/**
 * 论文翻译缓存
 */
export interface PaperTranslationCache {
  /** 论文 ID */
  paperId: string
  /** 当前阅读版 Markdown 的内容哈希 */
  sourceHash: string
  /** 段落总数 */
  totalSegments: number
  /** 已完成或跳过的段落数 */
  completedSegments: number
  /** 段落翻译条目 */
  entries: PaperTranslationEntry[]
  /** 最后更新时间 */
  updatedAt: string
}

/**
 * 单段翻译进度事件
 */
export interface PaperTranslationProgress {
  /** 论文 ID */
  paperId: string
  /** 内容哈希 */
  sourceHash: string
  /** 更新的段落 ID */
  segmentId: string
  /** 当前段落状态 */
  status: PaperTranslationStatus
  /** 已完成段落数 */
  completedSegments: number
  /** 总段落数 */
  totalSegments: number
  /** 当前任务是否仍在运行 */
  isRunning: boolean
  /** 当前段落完整数据 */
  entry: PaperTranslationEntry
  /** 错误信息 */
  errorMessage?: string
}

/**
 * 论文翻译状态
 */
export interface PaperTranslationState {
  /** 当前缓存 */
  cache: PaperTranslationCache | null
  /** 是否仍在后台翻译 */
  isRunning: boolean
}
