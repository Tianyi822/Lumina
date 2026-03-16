/**
 * 文档解析结果
 */
export interface ParsedDocumentData {
  fileName: string
  fileType: string
  fileSize: number
  parsedContent: string
}

/**
 * 支持的导出格式
 */
export type ExportFormat = 'markdown' | 'word' | 'pdf' | 'txt' | 'ppt'

/**
 * 消息导出请求
 */
export interface ExportMessageRequest {
  content: string
  format: ExportFormat
  title?: string
  timestamp?: string
  modelName?: string
}

/**
 * 消息导出结果
 */
export interface ExportMessageResult {
  success: boolean
  data?: number[]
  fileName?: string
  mimeType?: string
  error?: string
}

/**
 * 文档上传 API
 */
export interface DocumentApi {
  uploadAndParse: (file: File) => Promise<{
    success: boolean
    data?: ParsedDocumentData
    error?: string
  }>
  uploadAndParseMultiple: (files: File[]) => Promise<{
    success: boolean
    data?: Array<{
      fileName: string
      success: boolean
      data?: ParsedDocumentData
      error?: string
    }>
    error?: string
  }>
  exportMessage: (request: ExportMessageRequest) => Promise<ExportMessageResult>
}
