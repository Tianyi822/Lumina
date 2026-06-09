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
 * 文档上传 API
 */
export interface DocumentApi {
  /** 上传并解析单个文档 */
  uploadAndParse: (file: File) => Promise<{
    success: boolean
    data?: ParsedDocumentData
    error?: string
  }>
  /** 批量上传并解析多个文档 */
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
}
