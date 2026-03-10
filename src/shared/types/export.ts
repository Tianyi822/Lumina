/**
 * 支持的导出格式
 */
export type ExportFormat = 'markdown' | 'word' | 'pdf' | 'txt' | 'pptx'

/**
 * 消息导出请求
 */
export interface ExportMessageRequest {
  /** 要导出的消息内容 */
  content: string
  /** 导出格式 */
  format: ExportFormat
  /** 可选的文档标题，用于文件命名 */
  title?: string
  /** 消息时间戳 */
  timestamp?: string
  /** 模型名称 */
  modelName?: string
}

/**
 * 消息导出结果
 */
export interface ExportMessageResult {
  /** 是否导出成功 */
  success: boolean
  /** 导出的二进制内容 */
  data?: number[]
  /** 推荐下载文件名 */
  fileName?: string
  /** MIME 类型 */
  mimeType?: string
  /** 错误信息 */
  error?: string
}
